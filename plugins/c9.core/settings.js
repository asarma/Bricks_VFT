define(function(require, exports, module) {
    main.consumes = ["c9", "ui", "Plugin", "fs", "proc"];
    main.provides = ["settings"];
    return main;

    function main(options, imports, register) {
        var c9       = imports.c9;
        var ui       = imports.ui;
        var Plugin   = imports.Plugin;
        var fs       = imports.fs;
        var proc     = imports.proc;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit   = plugin.getEmitter();
        var model  = new ui.model();
        
        // We'll have a lot of listeners, so upping the limit
        emit.setMaxListeners(10000);
        
        var resetSettings = c9.location.match(/reset=([\w\|]*)/) && RegExp.$1;
        var develMode     = c9.location.indexOf("devel=1") > -1;
        var testing       = options.testing;
        
        // do not leave reset= in url
        if (resetSettings && window.history)
            window.history.pushState(null, null, location.href.replace(/reset=([\w\|]*)/,""));
        
        var TEMPLATE = options.template || "<settings><user /><project /><state /></settings>";
        var INTERVAL = 1000;
        var PATH     = {
            "project" : (options.projectConfigPath || "/.c9") + "/project.settings",
            "user"    : (options.userConfigPath || "~/.c9") + "/user.settings",
            "state"   : (options.stateConfigPath || "/.c9") + "/state.settings"
        };
        
        var xmldb  = apf.xmldb;
        var cache  = {};
        var diff   = 0; // TODO should we allow this to be undefined and get NaN in timestamps?
        
        var inited = false;
        function loadSettings(callback) {
            var xml;
            model.setProperty("create-model", false);
            
            //@todo this will leak listeners on reload of the model...
            plugin.on("newListener", function(type, cb){
                if (type == "read" || type == "write") 
                    return;
                
                var node = model.queryNode(type);
                if (!node) return;
                
                ui.xmldb.addListener(node, cb);
            }, plugin);
            plugin.on("removeListener", function(type, cb){
                if (type == "read" || type == "write") 
                    return;
                
                var node = model.queryNode(type);
                if (!node) return;
                
                ui.xmldb.removeListener(node, cb);
            }, plugin);
            
            // Load from TEMPLATE
            if (options.settings == "defaults" || testing)
                xml = TEMPLATE;
            // Load from parsed settings in the index file
            else if (options.settings)
                xml = options.settings;
    
            if (!xml) {
                var info    = ["<settings>", "</settings>"];
                var gotData = function (data) {
                    info.splice(1, 0, data);
                    if (info.length == 5) {
                        read(info.join(""));
                        events();
                        callback();
                    }
                };
                
                Object.keys(PATH).forEach(function(type){
                    fs.readFile(PATH[type], function(err, data){
                        if (err)
                            return gotData("<" + type + "/>");
                        gotData(data);
                    });
                });
                return;
            }
            
            read(xml);
            events();
            
            if (resetSettings)
                saveToFile();
            
            Object.keys(PATH).forEach(function(type){
                var node = model.queryNode(type);
                if (node)
                    cache[type] = xmldb.cleanXml(node.xml);
            });
            
            callback();
        }
        
        /***** Methods *****/
        
        var dirty, timer;
        function checkSave() {
            if (dirty)
                saveToFile();
        }
    
        function startTimer() {
            if (c9.readonly) return;
            
            clearInterval(timer);
            timer = setInterval(checkSave, INTERVAL);
        }
    
        function save(force){
            dirty = true;
    
            if (force) {
                saveToFile();
                startTimer();
            }
        }
    
        function saveToFile() {
            if (c9.readonly) return;
            
            if (c9.debug)
                console.log("Saving Settings...");
                
            emit("write", { model : model });
    
            model.data.setAttribute("time", new Date().getTime());
    
            if (develMode) {
                dirty = false;
                return;
            }
    
            saveModel();
        }
        
        function saveModel(forceSync){
            if (c9.readonly) return;
            
            if (c9.has(c9.NETWORK)) {
                if (model.data && !testing) {
                    Object.keys(PATH).forEach(function(type){
                        var node = model.queryNode(type);
                        if (!node) return;
                        
                        var xml = xmldb.cleanXml(node.xml) || "";
                        if (cache[type] != xml) {
                            cache[type] = xml;
                            fs.writeFile(PATH[type], 
                                xml, forceSync, function(err){});
                        }
                    });
                }
                
                dirty = false;
            }
        }
    
        function read(xml){
            try {
                if (testing) throw "testing";
                
                model.load(xml);
                
                if (resetSettings) {
                    var query = resetSettings == 1 
                        ? "user|state" : resetSettings;
                    var nodes = model.queryNodes(query);
                    var tmplNodes = apf.getXml(TEMPLATE).selectNodes(query);
                    for (var i = nodes.length - 1; i >= 0; i--) {
                        model.removeXml(nodes[i]);
                        model.appendXml(tmplNodes[i]);
                    }
                }
                
            } catch(e) {
                model.load(TEMPLATE);
            }
    
            if (!c9.debug) {
                try {
                    emit("read", {
                        model : model,
                        ext   : plugin
                    });
                } catch(e) {
                    fs.writeFile(PATH.project 
                        + ".broken", xml.xml || xml, function(){});
    
                    model.load(TEMPLATE);
    
                    emit("read", {
                        model : model,
                        ext   : plugin
                    });
                }
            }
            else {
                emit("read", {
                    model : model,
                    ext   : plugin
                });
            }
            
            if (inited)
                return;
            
            inited = true;
    
            plugin.on("newListener", function(type, cb){
                if (type != "read") return;

                if (c9.debug) {
                    cb({model : model, ext : plugin});
                }
                else {
                    try {
                        cb({model : model, ext : plugin});
                    }
                    catch(e){
                        console.error(e.message, e.stack);
                    }
                }
            });
        }
    
        function events() {
            startTimer();

            window.addEventListener("beforeunload", function(){
                emit("write", { model: model, unload: true });
                saveModel(true); //Forcing sync xhr works in chrome 
            });

            c9.on("stateChange", function(e){
                if (e.state | c9.NETWORK && e.last | c9.NETWORK)
                    saveToFile(); //Save to file
            }, plugin);

            model.on("update", function(){
                dirty = true; //Prevent recursion
            });
        }
        
        function migrate(pathFrom, pathTo, attrs){
            var nodeFrom = model.queryNode(pathFrom);
            if (!nodeFrom) return;
            
            // Remove node
            nodeFrom.parentNode.removeChild(nodeFrom);
            
            // Create new node
            var nodeTo  = ui.createNodeFromXpath(model.data, pathTo);
            
            // Move attributes
            var lastIdx = attrs[0].length - 1;
            attrs.forEach(function(attr){
                var value = nodeFrom.getAttribute(attr[lastIdx]);
                if (typeof value == "string")
                    nodeTo.setAttribute(attr[0], value);
            });
        }

        function setDefaults(path, attr){
            var node = model.queryNode(path);
            if (!node)
                node = ui.createNodeFromXpath(model.data, path);
    
            for (var i = 0, l = attr.length; i < l; i++) {
                if (!node.getAttributeNode(attr[i][0]))
                    ui.xmldb.setAttribute(node, attr[i][0], attr[i][1]);
            }
    
            ui.xmldb.applyChanges("synchronize", node);
        }
        
        function set(query, value){
            if (!inited) return false;
            model.setQueryValue(query, value);
            return true;
        }
        
        function setJson(query, value){
            return set(query, JSON.stringify(value));
        }
        
        function getJson(query){
            var json = get(query);
            try{
                var obj = JSON.parse(json)
                return obj;
            }
            catch(e){
                return false;
            }
        }
        
        function getBool(query){
            var bool = get(query);
            return ui.isTrue(bool) || (ui.isFalse(bool) ? false : undefined)
        }
        
        function getNumber(query){
            var double = get(query);
            return parseFloat(double, 10);
        }
        
        function get(query){
            return model.queryValue(query);
        }
        
        function exist(query){
            return model.queryNode(query) ? true : false;
        }
        
        function reset(){
            var xml = model.getXml();
            var nodes = xml.selectNodes("user|project");
            for (var i = nodes.length - 1; i >= 0; i--) {
                xml.removeChild(nodes[i]);
            }
            
            read(xml);
            saveToFile();
        }
    
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            // Get the Time
            var local = Date.now();
            proc.execFile("node", { 
                args: ["-e", "console.log(Date.now())"]
            }, function(err, stdout, stderr){
                if (err || stderr)
                    return;
                
                var time = parseInt(stdout, 10);
                diff = local - time;
            });
        });
        plugin.on("enable", function(){
        });
        plugin.on("disable", function(){
        });
        plugin.on("unload", function(){
        });
        
        /***** Register and define API *****/
        
        /**
         * Settings for Cloud9 IDE. Settings are stored based on a path pointing
         * to leaves. Each leaf can be accessed using the "@" char.
         * 
         * Example:
         * 
         *     settings.set("user/tree/@width", "200");
         * 
         * Example:
         * 
         *     settings.getNumber("user/tree/@width");
         * @singleton
         */
        plugin.freezePublicAPI({
            /**
             * Exposes the model object that stores the XML used to store the
             * settings. This property is here for backwards compatibility only
             * and will be removed in the next version.
             * @property model
             * @deprecated
             * @private
             */
            model : model, //Backwards compatibility, should be removed in a later version
            
            /**
             * @property {Boolean} inited whether the settings have been loaded
             */
            get inited(){ return inited; },
            
            /**
             * The offset between the server time and the client time in 
             * milliseconds. A positive number means the client is ahead of the
             * server.
             * @property timeOffset
             * @readonly
             */
            get timeOffset(){ return diff; },
            
            _events : [
                /** 
                 * @event read Fires when settings are read
                 */
                "read",
                /**
                 * @event write Fires when settings are written
                 * @param {Object}  e
                 * @param {Boolean} e.unload  specifies whether the application 
                 *   is being unloaded. During an unload there is not much time 
                 *   and only the highly urgent information should be saved in a
                 *   way that the browser still allows (socket is gone, etc).
                 **/ 
                "write"
            ],
            
            /**
             * Saves the most current settings after a timeout
             * @param {Boolean} force forces the settings to be saved immediately
             */
            save : save,
            
            /**
             * Loads the xml settings into the application
             * @param {XMLElement} xml The settings xml
             */
            read : read,
            
            /**
             * Sets a value in the settings tree
             * @param {String} path the path specifying the key for the value
             * @param {String} value the value to store in the specified location
             */
            "set" : set,
            
            /**
             * Sets a value in the settings tree and serializes it as JSON
             * @param {String} path the path specifying the key for the value
             * @param {String} value the value to store in the specified location
             */
            "setJson" : setJson,
            
            /**
             * Gets a value from the settings tree
             * @param {String} path the path specifying the key for the value
             */
            "get" : get,
            
            /**
             * Gets a value from the settings tree and interprets it as JSON
             * @param {String} path the path specifying the key for the value
             */
            "getJson" : getJson,
            
            /**
             * Gets a value from the settings tree and interprets it as Boolean
             * @param {String} path the path specifying the key for the value
             */
            "getBool" : getBool,
            
            /**
             * Gets a value from the settings tree and interprets it as Boolean
             * @param {String} path the path specifying the key for the value
             */
            "getNumber" : getNumber,
            
            /**
             * Checks to see if a node exists
             * @param {String} path the path specifying the key for the value
             */
            "exist" : exist,
            
            /**
             * Sets the default attributes of a settings tree node.
             * 
             * Example:
             * 
             *     settings.setDefaults("user/myplugin", [
             *       ["width", 200],
             *       ["show", true]
             *     ])
             * 
             * @param {String} path   the path specifying the key for the value
             * @param {Array}  attr   two dimensional array with name 
             *      values of the attributes for which the defaults are set
             */
            setDefaults : setDefaults,
            
            /**
             * Moves and renames attributes from one path to another path
             * @param {String} fromPath the path specifying where key for the value
             * @param {String} toPath   the path specifying where key for the value
             * @param {Array}  attr     two dimensional array with name 
             *      values of the attributes for which the defaults are set
             */
            migrate : migrate,
            
            /**
             * Resets the settings to their defaults
             */
            reset : reset
        });
        
        if (c9.connected) {
            load();
        }
        c9.once("connect", function() {
            load();
        });
        function load() {
            loadSettings(function(err) {
                if (err) return register(err);
                
                register(null, {
                    settings: plugin
                });
            });
        }
    }
});
