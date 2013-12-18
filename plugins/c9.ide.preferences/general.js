define(function(require, exports, module) {
    main.consumes = [
        "PreferencePanel", "ui", "dialog.confirm", "settings",
        "preferences"
    ];
    main.provides = ["preferences.general"];
    return main;

    function main(options, imports, register) {
        var PreferencePanel = imports.PreferencePanel;
        var prefs           = imports.preferences;
        var settings        = imports.settings;
        var confirm         = imports["dialog.confirm"].show;
        
        /***** Initialization *****/
        
        var plugin = new PreferencePanel("Ajax.org", main.consumes, {
            caption : "General Settings",
            form    : true,
            index   : 100
        });
        var emit   = plugin.getEmitter();
        emit.setMaxListeners(1000);
        
        var navHtml;
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
            prefs.on("add", function(e){
                if (!("Project" in e.state))
                    plugin.add(e.state, e.plugin);
            });
        }
        
        var drawn = false;
        function draw(e) {
            if (drawn) return;
            drawn = true;
            
            navHtml = e.navHtml;
            
            plugin.add({
               "General" : {
                    position : 10,
                    "General" : {
                        position : 10,
                        "Reset to Factory Settings" : {
                            type    : "button",
                            caption : "Reset to Defaults",
                            width   : 140,
                            onclick : function(){
                                confirm("Reset Settings", 
                                    "Are you sure you want to reset your settings?", 
                                    "By resetting your settings to their "
                                    + "defaults you will lose all custom settings. "
                                    + "Cloud9 IDE will return to it's original configuration", 
                                    function(){
                                        settings.reset();
                                    }, function(){})
                            }
                        }
                    },
                    "User Interface" : {
                        position : 20,
                        "Enable UI Animations" : {
                            type : "checkbox",
                            path : "user/general/@animateui",
                            position : 1000
                        },
                        "Main Theme" : {
                            type  : "dropdown",
                            path  : "user/general/@skin",
                            width : 150,
                            items : [
                                { caption: "Cloud9 Dark Theme", value: "dark" },
                                { caption: "Cloud9 Bright Theme", value: "white" }
                            ],
                            position : 900
                        }
                    }
                }
            }, plugin);
        }
        
        /***** Methods *****/
        
        
        /***** Lifecycle *****/
        
        plugin.on("load", function() {
            load();
        });
        plugin.on("draw", function(e) {
            draw(e);
        });
        plugin.on("enable", function() {
            
        });
        plugin.on("disable", function() {
            
        });
        plugin.on("unload", function() {
            loaded = false;
            drawn  = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * 
         **/
        plugin.freezePublicAPI({
        });
        
        register(null, {
            "preferences.general": plugin
        });
    }
});