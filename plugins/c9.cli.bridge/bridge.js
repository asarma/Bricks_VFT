/**
 * File Finder module for the Cloud9 IDE that uses nak
 *
 * @copyright 2012, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {
    main.consumes = ["c9", "Plugin", "ext"];
    main.provides = ["bridge"];
    return main;

    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var c9       = imports.c9;
        var ext      = imports.ext;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit   = plugin.getEmitter();
        
        var CODE = require("text!./bridge-service.js");
        var PORT = options.port || 17123;
        
        var stream, api;
        
        var loaded = false;
        function load(){
            if (loaded) return;
            loaded = true;
            
            ext.loadRemotePlugin("bridge", {
                code     : CODE,
                redefine : true
            }, function(err, remote){
                if (err)
                    return console.error(err);
                
                api = remote;
                
                api.connect(PORT, function(err, meta){
                    if (err) {
                        loaded = false;
                        
                        if (err.code == "EADDRINUSE") {
                            console.warn("Another Application is using port " 
                                + PORT + ". CLI client interface disabled. Restart Cloud9 to retry connecting.");
                        }
                        else
                            console.error(err);
                        
                        return;
                    }
                    
                    stream = meta.stream;
                    
                    stream.on("data", function(chunk){
                        try { var message = JSON.parse(chunk); }
                        catch(e) {
                            setTimeout(function(){
                                loaded = false;
                                load();
                            }, 60000);
                            return;
                        }
                        emit("message", { message: message });
                    });
                    
                    stream.on("close", function(){
                        loaded = false;
                    });
                })
            });
            
            c9.once("stateChange", function(e){
                if (e.state & c9.NETWORK) {
                    load();
                }
                else {
                    loaded = false;
                }
            }, plugin);
            
            window.addEventListener("unload", function(){
                api && api.disconnect();
            });
        }
        
        /***** Methods *****/
        
        plugin.on("load", function(){
            load();
        });
        
        plugin.on("unload", function(){
            api && api.disconnect();
        });
        
        /***** Register and define API *****/
        
        /**
         * Bridge To Communicate from CLI to IDE
         **/
        plugin.freezePublicAPI({ });
        
        register(null, {
            bridge: plugin
        });
    }
});
