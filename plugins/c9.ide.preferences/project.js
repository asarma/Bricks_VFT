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
        var ui              = imports.ui;
        var settings        = imports.settings;
        var confirm         = imports["dialog.confirm"].show;
        
        /***** Initialization *****/
        
        var plugin = new PreferencePanel("Ajax.org", main.consumes, {
            caption : "Project Settings",
            form    : true,
            index   : 50
        });
        var emit   = plugin.getEmitter();
        emit.setMaxListeners(1000);
        
        var navHtml;
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
            prefs.on("add", function(e){
                if ("Project" in e.state)
                    plugin.add(e.state, e.plugin);
            });
            
            prefs.on("draw", function(e){
                if (!prefs.activePanel)
                    prefs.activate(plugin);
            });
        }
        
        var drawn = false;
        function draw(e) {
            if (drawn) return;
            drawn = true;
            
            navHtml = e.navHtml;
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
            _events : [
                
            ]
        });
        
        register(null, {
            "preferences.general": plugin
        });
    }
});