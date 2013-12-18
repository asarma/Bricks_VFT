define(function(require, exports, module) {
    main.consumes = ["Plugin", "http", "ui"];
    main.provides = ["layout.preload"];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var http   = imports.http;
        var ui     = imports.ui;
        
        var async  = require("async");

        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);

        var themePrefix = options.themePrefix;
        var packed = ui.packed;

        var themes = {
            "dark": themePrefix + "/dark.css",
            "white": themePrefix + "/white.css"
        };

        /***** Methods *****/
        
        function preload(callback) {
            if (!packed) return callback();
            
            async.forEach(Object.keys(themes), function(theme, next) {
                http.request(themes[theme], function(err, data) {
                    if (err)
                        return next(err);
                    
                    themes[theme] = data;
                    next();
                });
            }, callback);
        }

        function getTheme(name) {
            return themes[name];
        }
        
        /***** Register and define API *****/
        
        /**
         * 
         * @singleton
         **/
        plugin.freezePublicAPI({
            getTheme: getTheme    
        });
        
        preload(function(err) {
            register(err, {
                "layout.preload": plugin
            });
        });
    }
});