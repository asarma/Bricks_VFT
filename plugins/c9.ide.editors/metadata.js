define(function(require, exports, module) {
    main.consumes = [
        "c9", "Plugin", "fs", "settings", "tabManager", "layout", 
        "dialog.question", "preferences"
    ];
    main.provides = ["metadata"];
    return main;

    function main(options, imports, register) {
        var c9       = imports.c9;
        var Plugin   = imports.Plugin;
        var fs       = imports.fs;
        var settings = imports.settings;
        var tabs     = imports.tabManager;
        var confirm  = imports["dialog.question"].show;
        var layout   = imports.layout;
        var prefs    = imports.preferences;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit   = plugin.getEmitter();

        var PATH      = options.path || "/.c9/metadata";
        var WORKSPACE = "/workspace";
        
        var jobs    = {};
        var changed = {};
        var cached  = {};
        var worker;
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            // Schedule for inspection when tab becomes active
            tabs.on("tabAfterActivate", function(e){
                // If disabled don't do anything
                if (!e.tab.loaded || !settings.getBool("user/metadata/@enabled"))
                    return;
                
                changed[e.tab.name] = e.tab;
            }, plugin);
            
            // Closing a tab
            tabs.on("tabAfterClose", function(e){
                // If disabled don't do anything
                if (!settings.getBool("user/metadata/@enabled"))
                    return;
                
                if (!e.tab.path) {
                    fs.unlink(PATH + "/" + e.tab.name, function(){});
                }
                else if (e.tab.document.meta.newfile) {
                    fs.unlink(PATH + WORKSPACE + e.tab.path, function(){});
                }
                else if (check(e.tab) !== false) {
                    delete changed[e.tab.name];
                    delete cached[e.tab.name];
                }
            }, plugin);
            
            // Opening a file
            tabs.on("beforeOpen", function(e){
                // If disabled don't do anything
                if (!settings.getBool("user/metadata/@enabled"))
                    return;
                
                // Don't load metadata if document state is defined or value is set
                if (e.tab.path && e.options.document.filter === false
                  || !e.tab.path && !e.options.document.filter
                  || e.options.value)
                    return;
                
                // Show the loader
                if (e.tab.path && e.loadFromDisk)
                    setLoading(e.tab);
                
                // Fetch the metadata and real data
                var callback = function(err){
                    if (e.loadFromDisk)
                        e.callback(err);
                };
                e.options.loadFromDisk = e.loadFromDisk;
                loadMetadata(e.tab, e.options, callback);
                
                return e.loadFromDisk ? false : true;
            }, plugin);
            
            // Settings
            
            settings.on("read", function(e){
                settings.setDefaults("user/metadata", [["enabled", "true"]]);
            }, plugin);
            
            settings.on("write", function(e){
                if (e.unload) return;
                
                checkChangedTabs();
            }, plugin);
            
            
            function checkChangedTabs(unload){
                // If disabled don't do anything
                if (!settings.getBool("user/metadata/@enabled"))
                    return;
                
                tabs.getPanes().forEach(function(pane){
                    var tab = pane.getTab();
                    if (tab) {
                        changed[tab.name] = tab;
                    }
                });
                
                for (var name in changed) {
                    if (check(changed[name], unload) === false)
                        return;
                }
                
                changed = {};
            }
            
            // Preferences
            
            prefs.add({
                "General" : {
                    "General" : {
                        "Store Meta Data of Opened Files" : {
                            type : "checkbox",
                            path : "user/metadata/@enabled",
                            position : 1000
                        }
                    }
                }
            }, plugin);
            
            // Exiting Cloud9
            
            var unload = function(){
                checkChangedTabs(true);
            };
            window.addEventListener("beforeunload", unload);
            plugin.addOther(function(){ 
                window.removeEventListener("beforeunload", unload);
            });
            
            // Handler to show loading indicator
            function setLoading(tab){
                tab.className.add("loading");
                var total = [0, 0], loaded = [0, 0], complete = [false, false];
                    
                var loadStartT = Date.now();
                fs.on("downloadProgress", function progress(e){
                    var index = 
                        e.path == PATH + WORKSPACE + tab.path ? 0 : 
                        (e.path == tab.path ? 1 : false);
                    if (index === false) 
                        return;
                    
                    if (e.complete)
                        complete[index] = true;
                    
                
                    if (e.total)
                        total[index]  = e.total;
                    if (e.loaded)
                        loaded[index] = e.loaded;
                        
                    var data = { 
                        total    : total[0] + total[1], 
                        loaded   : loaded[0] + loaded[1],
                        complete : complete[0] && complete[1],
                        dt       : Date.now() - loadStartT
                    };
                    
                    tab.document.progress(data);
                    
                    
                    if (complete[0] && complete[1])
                        fs.off("downloadProgress", progress);
                });
                tab.document.progress({dt: 0, loaded: 0, total: 1});
            }
            
            // Initial Load
            tabs.getTabs().forEach(function(tab){
                var options = tab.getState();
                options.loadFromDisk = tab.path 
                  && !tab.document.meta.newfile
                  // autoload to false prevents loading data, used by image editor
                  && (!tab.editor || tab.editor.autoload !== false);
                  
                if (tab.path && options.loadFromDisk) 
                    setLoading(tab);
                
                loadMetadata(tab, options, function(err){
                    if (err) {
                        tab.unload();
                        layout.showError("File not found '" + tab.path + "'");
                        return;
                    }
                    tab.className.remove("loading");
                }, true);
            });
        }
        
        /***** Methods *****/
        
        function check(tab, forceSync){
            var state      = tab.document.getState();
            var docChanged = state.changed;
            
            // Don't save state if we're offline
            if (!c9.has(c9.STORAGE))
                return false;
            
            // Ignore metadata files and preview pages
            if (tab.path && tab.path.indexOf(PATH) === 0
              || tab.document.meta.preview)
                return;
            
            // meta is recorded by the tab state
            delete state.meta;
            
            // If we discarded the file before closing, clear that data
            if (tab.document.meta.$ignoreSave) {
                delete state.value;
                delete state.changed;
                delete state.undoManager;
                docChanged = true;
            }
            
            if (docChanged || typeof state.value == "undefined" || forceSync) {
                write(forceSync);
            }
            else {
                hash(state.value, function(err, hash){
                    if (err) return;
                    
                    delete state.value;
                    delete state.changed;
                    state.hash = hash;
                    write(forceSync);
                });
            }
            
            function write(forceSync) {
                if (c9.readonly) return;
                
                try {
                    // This throws when a structure is circular
                    var sstate = JSON.stringify(state);
                } catch(e){
                    debugger;
                    return;
                }
                
                if (cached[tab.name] != sstate) {
                    cached[tab.name] = sstate;
                    
                    if (tab.path) {
                        fs.metadata(tab.path, state, forceSync, function(err){
                            if (err)
                                return;
                        });
                    }
                    else {
                        fs.metadata("/_/_/" + tab.name, state, forceSync, function(err){
                            if (err)
                                return;
                        });
                    }
                }
            }
            
            return true;
        }
        
        function merge(from, to) {
            for (var prop in from) {
                if (to[prop] && typeof from[prop] == "object")
                    merge(from[prop], to[prop]);
                else
                    to[prop] = from[prop];
            }
        }
        
        function loadMetadata(tab, options, callback, init){
            // When something goes wrong somewhere in cloud9, this can happen
            if (tab.path && tab.path.charAt(0) != "/")
                debugger;
                
            var path = tab.path
                ? PATH + WORKSPACE + tab.path
                : PATH + "/" + tab.name;
            
            var storedValue, storedMetadata;
            
            if (tab.path) {
                if (options.loadFromDisk === false) {
                    // This is for new files and other files that will store 
                    // their value in the metadata
                    receive(tab.document.value);
                    
                    if (!init) {
                        receive(null, -1);
                        return;
                    }    
                }
                else {
                    tab.className.add("loading");
                    
                    fs.readFile(tab.path, "utf8", function(err, data){
                        if (err) return callback(err);
                        receive(data);
                    });
                }
            }
            
            fs.readFile(path, "utf8", function(err, data){
                receive(null, err ? -1 : data);
            });
            
            /*
                @TODO metadata check when value is set is wrong
            */
            function receive(value, metadata){
                var state;
                
                if (value !== null)
                    storedValue = value;
                if (metadata) {
                    storedMetadata = metadata;
                    if (metadata != -1) {
                        cached[tab.name] 
                            = metadata.replace(/"timestamp":\d+\,?$/, "");
                    }
                }
                
                // Final state processing and then we're done
                function done(state, cleansed){
                    // Import state from options
                    var doc = options.document;
                    
                    delete doc.fullState;
                    delete doc.value;
                    delete doc.undoManager;
                    
                    if (!doc.changed)
                        delete doc.changed;
                    
                    if (cleansed) {
                        delete state.undoManager;
                        
                        if (tab.editor && state[tab.editor.type])
                            state[tab.editor.type].cleansed = true;
                    }
                        
                    merge(doc, state);
                    
                    // Set new state
                    tab.document.setState(state);
                    
                    callback();
                }
                
                if ((!tab.path || storedValue !== undefined) && storedMetadata) {
                    try{ 
                        state = storedMetadata == -1 
                            ? {} : JSON.parse(storedMetadata); 
                    }
                    catch(e){ state = {} }
                    
                    // There's a hash. Lets compare it to the hash of the 
                    // current value. If they are the same we can keep the
                    // undo stack, otherwise we'll clear the undo stack
                    if (state.hash && storedValue !== null) {
                        state.value = storedValue;
                        
                        hash(storedValue, function(err, hash){
                            done(state, state.hash != hash);
                        });
                        return; // Wait until hash is retrieved
                    }
                    else if (state.value && tab.path) {
                        // If the stored value is not the same as the value
                        // on disk we need to find out which is newer
                        if (state.value != storedValue) {
                            fs.stat(tab.path, function(err, stat){
                                if (err) return;
                                
                                // @todo this won't work well on windows, because
                                // there is a 20s period in which the mtime is
                                // the same. The solution would be to have a 
                                // way to compare the saved document to the 
                                // loaded document that created the state
                                if (state.meta.timestamp < stat.mtime) {
                                    var doc = tab.document;
                                    
                                    confirm("File Changed",
                                      tab.path + " has been changed on disk.",
                                      "Would you like to reload this file?",
                                      function(){
                                          // Set new value and clear undo state
                                          doc.setBookmarkedValue(storedValue, true);
                                          doc.meta.timestamp = stat.mtime;
                                      }, 
                                      function(){
                                          // Set to changed
                                          doc.undoManager.bookmark(-2);
                                      }, 
                                      { merge: false, all: false }
                                    );
                                }
                            });
                        }
                    }
                    else {
                        state.value = storedValue;
                    }
                    
                    done(state);
                }
            }
        }
        
        hash.counter = 0;
        function hash(data, callback){
            if (!worker) {
                worker = new Worker('/static/lib/rusha/rusha.min.js');
                worker.addEventListener("message", function(e){
                    // @todo security?
                    
                    if (jobs[e.data.id]) {
                        jobs[e.data.id](null, e.data.hash);
                        delete jobs[e.data.id];
                    }
                });
            }
            worker.postMessage({ id: ++hash.counter, data: data });
            jobs[hash.counter] = callback;
            
            if (hash.counter === 30000)
                hash.counter = 0;
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("enable", function(){
            
        });
        plugin.on("disable", function(){
            
        });
        plugin.on("unload", function(){
            loaded = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * Manages metadata for tabs in Cloud9 IDE. Each tab in Cloud9 has
         * additional information that needs to be stored. 
         * 
         * When you open a file in Cloud9, it generally is opened in a tab and 
         * displayed using the {@link ace.Ace Ace} editor. The ace editor maintains a
         * lot of state while displaying the file, such as the scroll position,
         * the selection, the folds, the syntax highligher, etc. The document
         * also serializes the value and the complete undo stack. Editors
         * that don't open files can still hold metadata. The {@link terminal.Terminal Terminal}
         * for instance has selection, scroll state and scroll history. All this
         * information can be saved to disk by the metadata plugin.
         * 
         * The metadata is saved in ~/.c9/metadata. The metadata plugin plugs
         * into the tabManager and takes over the loading of the file content
         * so that the loading of the content and the metadata is synchronized.
         * This plugin is also responsible for saving the metadata back to the
         * workspace.
         * 
         * @singleton
         **/
        plugin.freezePublicAPI({

        });
        
        register(null, {
            metadata: plugin
        });
    }
});
