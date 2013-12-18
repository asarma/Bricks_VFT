define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "c9", "settings", "ui", "layout", "tooltip",
        "anims", "menus", "tabManager", "preferences", "save",
        "ace.stripws"
    ];
    main.provides = ["autosave"];
    return main;

    function main(options, imports, register) {
        var c9       = imports.c9;
        var Plugin   = imports.Plugin;
        var settings = imports.settings;
        var save     = imports.save;
        var tooltip  = imports.tooltip;
        var tabs     = imports.tabManager;
        var prefs    = imports.preferences;
        var stripws  = imports["ace.stripws"];
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit   = plugin.getEmitter();
        
        var INTERVAL       = 60000;
        var CHANGE_TIMEOUT = 500;
        
        var docChangeTimeout   = null;
        var btnSave, autosave, saveInterval;
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            prefs.add({
                "General" : {
                    "General" : {
                        "Enable Auto-Save" : {
                            type     : "checkbox",
                            position : 1000,
                            path     : "user/general/@autosave"
                        }
                    }
                }
            }, plugin);
            
            settings.on("read", function(e){
                settings.setDefaults("user/general", [["autosave", "false"]]);
                autosave = settings.getBool("user/general/@autosave");
                transformButton();
            }, plugin);
    
            settings.on("user/general", function(e) {
                autosave = settings.getBool("user/general/@autosave");
                transformButton();
            }, plugin);
    
            // when we're back online we'll trigger an autosave if enabled
            c9.on("stateChange", function(e) {
                if (e.state & c9.STORAGE && !(e.last & c9.STORAGE))
                    check();
            }, plugin);
            
            save.getElement("btnSave", function(btn){
                btnSave = btn;
                transformButton();
            });
            
            tabs.on("tabCreate", function(e){
                var tab = e.tab;
                tab.document.undoManager.on("change", function(e){
                    if (!autosave || !tab.path)
                        return;
                    
                    clearTimeout(docChangeTimeout);
                    docChangeTimeout = setTimeout(function() {
                        stripws.disable();
                        saveTab(tab);
                    }, CHANGE_TIMEOUT);
                }, plugin);
            }, plugin);
            
            tabs.on("tabDestroy", function(e){
                if (!e.tab.path)
                    return;
                
                if (tabs.getTabs().length == 1)
                    btnSave.hide();
        
                saveTab(e.tab);
            }, plugin);
            
            save.on("beforeWarn", function(e){
                if (autosave && !e.tab.document.meta.newfile) {
                    saveTab(e.tab);
                    return false;
                }
            }, plugin);
        }
        
        function transformButton(){
            if (!btnSave) return;
            if (btnSave.autosave === autosave) return;
            
            if (autosave) {
                // Transform btnSave
                btnSave.setAttribute("caption", "");
                btnSave.setAttribute("margin", "0 20");
                btnSave.removeAttribute("tooltip");
                btnSave.removeAttribute("command");
                apf.setStyleClass(btnSave.$ext, "btnSave");
                
                tooltip.add(btnSave, {
                    message : "Changes to your file are automatically saved.<br />\
                        View all your changes through <a href='javascript:void(0)' \
                        onclick='require(\"ext/revisions/revisions\").toggle();' \
                        class='revisionsInfoLink'>the Revision History pane</a>. \
                        Rollback to a previous state, or make comparisons.",
                    width : "250px",
                    hideonclick : true
                }, plugin);
            }
            else {
                
            }
            
            btnSave.autosave = autosave;
        }
        
        /***** Helpers *****/
    
        function check() {
            if (!autosave) return;
            
            var pages = tabs.getTabs();
            for (var tab, i = 0, l = pages.length; i < l; i++) {
                if ((tab = pages[i]).document.changed && tab.path)
                    saveTab(tab)
            }
        }
    
        function saveTab(tab, force) {
            if (!autosave) return;
            
            if (!c9.has(c9.STORAGE)) {
                save.setSavingState(tab, "offline");
                return;
            }
            
            if (!force && (!tab.path 
              || !tab.document.changed
              || tab.document.meta.newfile
              || tab.document.meta.error))
                return;
    
            save.save(tab, { silentsave: true, timeout: 1 }, function() {
                stripws.enable();
            });
        }
    
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("enable", function(){
            autosave = settings.getBool("user/general/@autosave");
            transformButton();
            
        });
        plugin.on("disable", function(){
            autosave = false;
            transformButton();
        });
        plugin.on("unload", function(){
            if (saveInterval)
                clearInterval(saveInterval);
    
            loaded = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * Implements auto save for Cloud9 IDE. When the user enables autosave
         * the contents of files are automatically saved about 500ms after the
         * change is made.
         * @singleton
         **/
        plugin.freezePublicAPI({ });
        
        register(null, {
            autosave: plugin
        });
    }
});