define(function(require, exports, module) {
    main.consumes = ["Plugin", "commands", "proc"];
    main.provides = ["restart"];
    return main;

    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var cmd      = imports.commands;
        var proc     = imports.proc;
        
        var fs       = require("fs");
        var PATH     = require("path");

        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit   = plugin.getEmitter();

        var loaded;
        function load(){
            if (loaded) return;
            loaded = true;
            
            cmd.addCommand({
                name    : "restart", 
                info    : "Restarts the currently running Cloud9 IDE",
                options : {},
                exec    : function(argv){
                    restart(function(err, success){
                        console.log(err || success);
                        process.exit();
                    });
                }
            });
        }

        /***** Methods *****/
        
        function restart(callback){
            if (options.platform == "darwin") {
                var appPath = process.env.HOME 
                    + "/Applications/cloud9.app/Contents/MacOS/node-webkit";

                fs.stat(appPath, function(err, stat){
                    var exists = !err && stat ? true : false;
                    
                    if (!exists)
                        return callback("Could not find Cloud9 app");
                    
                    fs.readFile(process.env.HOME + "/.c9/pid", function(err, pid){
                        if (err) return callback("Cloud9 is Not Running");
                        
                        // Kill existing process
                        proc.execFile("kill", {
                            args : ["-9", pid]
                        }, function(err, stdout, stderr){
                            if (err) 
                                return callback("Could not kill Cloud9");
                            
                            // Start new process
                            proc.spawn(appPath, {
                                args     : [],
                                detached : true
                            }, function(err, child){
                                if (err)
                                    return callback(false);
                
                                // required so the parent can exit
                                child.unref && child.unref();
                                
                                callback(null, "Restarted Cloud9 IDE");
                            });
                        });
                    });
                });
            }
            else if (options.platform == "linux") {
                
            }
            else if (options.platform == "windows") {
                
            }
            else {
                callback(false);
            }
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
         * Finds or lists files and/or lines based on their filename or contents
         **/
        plugin.freezePublicAPI({
            /**
             *
             */
            restart : restart
        });
        
        register(null, {
            restart: plugin
        });
    }
});