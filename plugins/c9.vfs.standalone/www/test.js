var bar; // Intended global

require([
    "lib/chai/chai", 
    "text!plugins/c9.ide.layout.classic/skins.xml", 
    "events",
    "text!plugins/c9.ide.layout.classic/themes/default-dark.less",
    "text!plugins/c9.ide.layout.classic/less/lesshat.less"
], function (chai, skin, events, less1, less2) {
    "use strict";
    var expect = chai.expect;
    var EventEmitter = events.EventEmitter;

    function html(path, message){
        var htmlNode;
        if (typeof path != "object" || !(path instanceof HTMLElement))
            htmlNode = html.constr(path);
        else
            htmlNode = path;
        var not = false;
        
        function testOk(value){
            if (not)
                expect(value, message || path).not.ok;
            else
                expect(value, message || path).ok;
            not = false;
        }
        
        var obj = {
            get is(){ return obj; },
            get has(){ return obj; },
            get have(){ return obj; },
            get and(){ return obj; },
            get to(){ return obj; },
            get not(){ not = true; return obj; },
            
            get ok(){ testOk(htmlNode); return obj; },
            get exists(){ testOk(htmlNode); return obj; },
            get exist(){ testOk(htmlNode); return obj; },
            get node(){ return htmlNode },
            
            get visible() {
                testOk(htmlNode && htmlNode.offsetWidth);
                return obj;
            },
            
            text : function(text){
                testOk(htmlNode.innerText.match(text));
                return obj;
            },
            
            icon : function(icon){
                testOk(htmlNode.innerHTML.indexOf(icon) > -1);
                return obj;
            },
            
            className : function(name){
                testOk(htmlNode.className.indexOf(name) > -1);
                return obj;
            },
            child : function(query){ 
                if (typeof query == "number") {
                    if (query < 0)
                        query = htmlNode.children.length + query;
                    htmlNode = htmlNode.children[query];
                } else {
                    htmlNode = htmlNode.querySelector(query); 
                }
                return obj;
            }
        }
        return obj;
    }
    expect.html = html;
    expect.html.setConstructor = function(fn){
        html.constr = fn;
    }
    
    expect.html.mocked = function(options, imports, register){
        register(null, {
            c9 : (function(){
                var x = new EventEmitter();
                x.location = "";
                x.has = function(){ return false; };
                x.connected = true;
                return x;
            })(),
            vfs : (function(){
                var x = new EventEmitter();
                return x;
            })(),
            anims : (function(){
                var x = new EventEmitter();
                x.animateSplitBoxNode = function(node, opt){
                    node.setAttribute("height", parseInt(opt.height, 10));
                };
                return x;
            })(),
            watcher : (function(){
                var x = new EventEmitter();
                x.watch = function(){};
                x.unwatch = function(){};
                x.check = function(){};
                return x;
            })(),
            save : (function(){
                var x = new EventEmitter();
                x.saveAll = function(c){ c(); };
                return x;
            })(),
            findreplace : {
                
            },
            ace : {
                getElement : function(){}
            },
            settings : (function(){
                var obj = new EventEmitter();
                obj.save = function(){};
                obj.set = function(){};
                obj.get = function(){};
                obj.emit("read", {}, true);
                return obj;
            })(),
            fs : (function(){
                var obj = new EventEmitter();
                obj.writeFile = function(){};
                obj.watch = function(){};
                return obj;
            })(),
            tooltip : {
                add : function(){}
            },
            clipboard : (function(){
                var cb = new EventEmitter();
                cb.registerHandler = function(){};
                return cb;
            })(),
            preferences : (function(){
                var prefs = new EventEmitter();
                prefs.add = function(){};
                return prefs;
            })(),
            commands : (function(){
                var commands = {};
                
                if (typeof apf != "undefined") {
                    apf.button.prototype.$propHandlers["command"] =
                    apf.item.prototype.$propHandlers["command"] = function(value){
                        this.onclick = function(){
                            commands[value].exec(
                                apf.getPlugin("tabManager").focussedPage.editor
                            );
                        }
                    };
                }
                
                var c = new EventEmitter();
                
                c.commands    = commands;
                c.addCommands = function(a, b, c){
                    a.forEach(function(o){
                        commands[o.name] = o;
                    })
                };
                c.addCommand = function(o){
                    commands[o.name] = o;
                };
                c.removeCommand = function(o){
                    delete commands[o.name];
                }
                c.exec = function(name){
                    commands[name].exec();
                };
                
                return c;
            })(),
            log: {},
            http : {},
            layout : (function(){
                // Load the skin
                if (imports.ui) {
                    var plugin = new imports.Plugin();
                    
                    imports.ui.defineLessLibrary(less1, plugin);
                    imports.ui.defineLessLibrary(less2, plugin);
                    // imports.ui.insertCss(less3, false, plugin);
                    
                    imports.ui.insertSkin({
                        "data"       : skin,
                        "media-path" : "plugins/c9.ide.layout.classic/images/",
                        "icon-path"  : "plugins/c9.ide.layout.classic/icons/"
                    }, {addElement: function(){}});
                    
                    document.documentElement.style.background = "white";
                }
                
                return {
                    initMenus: function() {},
                    findParent : function(){
                        if (!bar) {
                            bar = apf.document.documentElement.appendChild(
                                new imports.ui.bar());
                            bar.$ext.style.position = "fixed";
                            bar.$ext.style.left = "20px";
                            bar.$ext.style.right = "320px";
                            bar.$ext.style.bottom = "20px";
                            bar.$ext.style.height = "200px";
                        }
                        bar.setAttribute("resizable", true);
                        
                        return bar;
                    },
                    getElement : function(){
                        return new apf.bar();
                    }
                };
            })(),
            panels   : (function(){
                var panel, column;
                
                var api = {
                    register   : function(p, o){
                        if (!column) {
                            column = apf.document.documentElement.appendChild(
                                new imports.ui.bar({style:"background : #303130;"}));
                            column.$ext.style.position = "fixed";
                            column.$ext.style.top = "75px";
                            column.$ext.style.right = "20px";
                            column.$ext.style.left = "";
                            column.$ext.style.bottom = "20px";
                            column.$ext.style.width = "300px";
                            column.$ext.style.height = "";
                        }
                        
                        panel = p; 
                        p.draw({container: column.$ext, aml: column});
                    },
                    unregister : function(){}, 
                    activate   : function(){
                        // panel.panel.show()
                    },
                    deactivate : function(){
                        // panel.panel.hide()
                    },
                    on : function(){
                        
                    }
                }
                if (imports.Plugin) {
                    var plugin = new imports.Plugin();
                    plugin.freezePublicAPI(api);
                    return plugin;
                } else {
                    return api;
                }
            })(),
            Panel: function(developer, deps, options) {
                var plugin = new imports.Plugin(developer, deps);
                var emit   = plugin.getEmitter();
                var drawn  = false;
                var where;
                plugin.on("load", function(){
                    where = options.where || "left";
                    var panels = apf.getPlugin("panels");
                    panels.register(plugin);
                });
                plugin.freezePublicAPI.baseclass();
                plugin.freezePublicAPI({
                    get autohide(){ return false; },
                    get width(){ return options.width; },
                    get minWidth(){ return options.minWidth; },
                    get aml(){ return plugin.getElement(options.elementName); },
                    get area(){ return ""; },
                    get where(){ return where; },
                    setCommand : function(){},
                    attachTo : function(){},
                    detach : function(){},
                    show : function(){},
                    hide : function(){},
                    draw : function draw(area){
                        if (drawn) return false;
                        drawn = true;
                        
                        emit("draw", { 
                            html : area.container, 
                            aml  : area.aml 
                        }, true);
                        
                        return true;
                    }
                });
                
                return plugin;
            },
            tree : (function(){
                var tree = new EventEmitter();
                tree.createFolder = function(){};
                tree.getElement = function(){};
                return tree;
            })(),
            tabManager  : (function(){
                var tabManager = new EventEmitter();
                tabManager.open = function(){ tabManager.emit("open") };
                tabManager.openFile = function(){ tabManager.emit("open") };
                tabManager.findPage = function(){};
                tabManager.getPanes = function(){ return [] };
                return tabManager;
            })(),
            tabbehavior : (function(){
                var x = new EventEmitter();
                x.getElement = function(){};
                return x;
            })(),
            menus : (function(){
                var menus = new EventEmitter();
                menus.addItemByPath = function(x, aml, y, plugin){ 
                    aml && (plugin || y).addElement(aml);
                    return aml;
                };
                menus.addItemToMenu = menus.addItemByPath;
                menus.get = function(){return {}};
                menus.remove = function(){return {}};
                menus.enableItem = function(){};
                menus.disableItem = function(){};
                return menus;
            })(),
            util : {
                alert : function(){ }
            },
            gotoline : {
                toggle : function(){ }
            },
            "auth.bootstrap": {
                login: function(callback) { callback(); }
            },
            "ace.gotoline": {},
            "ace.stripws": {
                disable : function(){},
                enable : function(){}
            },
            "dialog.alert": {show: function() { arguments[arguments.length - 1]() }},
            "dialog.confirm": {show: function() {}},
            "dialog.question": {show: function() {}},
            "dialog.filesave": {show: function() {}},
            "dialog.fileremove": {show: function() {}},
            "dialog.fileoverwrite": {show: function() {}},
            proc: {
                execFile: function() {}
            },
            "debugger": {},
            "run.gui": {},
        });
    };
    
    expect.setupArchitectTest = function(config, architect) {
        architect.resolveConfig(config, function(err, config) {
            /*global describe it before after  =*/
            if (err) throw err;
            var app = window.app = architect.createApp(config, function(err, app) {
                describe('app', function() {
                    it('should load test app', function(done) {
                        expect(err).not.ok;
                        done();
                    });
                });
            
                onload && onload();
                
            });
            if (app) {
                app.on("service", function(name, plugin){ 
                    if (!plugin.name)
                        plugin.name = name; 
                });
                app.rerun = function() {
                    expect.setupArchitectTest(config, architect);
                };
            }
        });
    };
        
});