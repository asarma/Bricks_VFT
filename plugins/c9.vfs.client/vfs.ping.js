define(function(require, exports, module) {
    "use strict";

    main.consumes = ["Plugin", "ext", "c9"];
    main.provides = ["vfs.ping"];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var c9 = imports.c9;
        var ext = imports.ext;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        var api;
        
        var loaded = false;
        function load(){
            if (loaded) return;
            loaded = true;
            
            ext.loadRemotePlugin("ping", {
                code     : getServiceCode(),
                redefine : true
            }, function(err, remote) {
                if (err)
                    return console.error(err);
                
                api = remote;
            });
            
            c9.on("stateChange", function(e){
                if (e.state & c9.NETWORK) {
                    load();
                }
                else {
                    loaded = false;
                    api = null;
                }
            }, plugin);
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        
        /***** Register and define API *****/
     
        function getServiceCode() {
            function pingService(vfs, register) { 
                register(null, {
                    ping: function (payload, callback) {
                        callback(null, payload);
                    }
                });
            }
            return "module.exports = " + pingService.toString();
        }
        
        function ping(callback) {
            if (!callback)
                callback = function() {};
                
            if (!api) return callback(new Error("Client is offline"));
            
            var start = Date.now();
            api.ping("ping", function(err) {
                var took = Date.now() - start;
                if (err) return callback(err);
                
                console.log("ping took", took, "ms");
                callback(null, took);
            });
        }

        window.ping = ping;
        
        /**
         * 
         **/
        plugin.freezePublicAPI({
            ping: ping
        });
        
        register(null, { "vfs.ping" : plugin });
    }
    
});