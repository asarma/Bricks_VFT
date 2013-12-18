define(function(require, exports, module) {
    main.consumes = ["Plugin", "commands", "proc", "bridge-client"];
    main.provides = ["open"];
    return main;

    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var cmd      = imports.commands;
        var proc     = imports.proc;
        var bridge   = imports["bridge-client"];
        
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
                name    : "open", 
                info    : "Opens a file or directory.",
                usage   : "[--remote-c9] [--local-c9] [--default-editor] [-w <path>] [<workspace>:]<path>\n\nUse cases:\n"
                    + "   1. The file is local and it opens in the default local editor\n"
                    + "   2. The file is local and it opens in the local cloud9\n"
                    + "   3. The file is local and it opens in the hosted cloud9 on c9.io\n"
                    + "   4. The file is in a remote workspace and it opens in the default local editor\n"
                    + "   5. The file is in a remote workspace and it opens in the local cloud9\n"
                    + "   6. The file is in a remote workspace and it opens in the hosted cloud9 on c9.io",
                options : {
                    "remote-c9" : {
                        alias : "r",
                        description : "Open the file or directory in cloud9 on c9.io",
                        default : false
                    },
                    "local-c9" : {
                        alias : "l",
                        description : "Open the file or directory in the local cloud9. Default.",
                        default : true
                    },
                    "default-editor" : {
                        alias : "d",
                        description : "Open the file or directory in the local default editor",
                        default : false
                    },
                    "w" : {
                        description : "Specify the path that will be the workspace. Only applicable to local-c9.",
                        default : false
                    }
                },
                check: function(argv){
                    if (argv._.length < 2 && !argv["w"])
                        throw new Error("Missing workspace name");
                },
                exec: function(argv){
                    open(
                        argv["remote-c9"], 
                        argv["local-c9"], 
                        argv["default-editor"], 
                        argv["w"], 
                        argv._.slice(1),  // Remove "open" from the paths
                        function(){});
                }
            });
        }

        /***** Methods *****/

        function open(remote, local, editor, workspace, paths, callback){
            if (local || !remote) {
                var cwd;
                
                try {
                    paths = paths.map(function(path){
                        var isDir = fs.statSync(path).isDirectory();
                        return {
                            path : PATH.resolve(path),
                            type : isDir ? "directory" : "file"
                        };
                    });
                } catch(e) {
                    var msg = e.message.split(",")[1].trim();
                    console.error(msg.charAt(0).toUpperCase() + msg.substr(1));
                    return;
                }
                
                if (!workspace) {
                    var last;
                    paths.forEach(function(info){
                        var path = info.type == "directory"
                            ? info.path : PATH.dirname(info.path);
                        if (!last) {
                            last = path;
                        }
                        else {
                            var one = last.split(PATH.sep);
                            var two = path.split(PATH.sep);
                            for (var i = 0; i < one.length; i++) {
                                if (one[i] != two[i]) {
                                    last = one.slice(0, i).join(PATH.sep);
                                    return;
                                }
                            }
                        }
                    });
                    cwd = last || process.cwd();
                }
                else if (workspace == ".")
                    cwd = process.cwd();
                else
                    cwd = PATH.resolve(workspace);
                
                var message = {
                    type      : "open",
                    workspace : "local",
                    cwd       : cwd,
                    paths     : paths
                };
                
                bridge.send(message, function cb(err){
                    if (err) {
                        if (err.code == "ECONNREFUSED") {
                            // Seems Cloud9 is not running, lets start it up
                            startCloud9Local(cwd, function(success){
                                if (success)
                                    bridge.send(message, cb);
                                else {
                                    console.log("Could not start Cloud9. "
                                        + "Please check your configuration.");
                                    callback(err);
                                }
                            });
                            return;
                        }
                        else
                            console.log(err.message);
                    }
                    
                    process.exit(); // I don't get why this is needed
                });
            }
        }
        
        function startCloud9Local(cwd, callback){
            if (options.platform == "darwin") {
                var args    = ["-w", cwd];
                var appPath = process.env.HOME 
                    + "/Applications/cloud9.app/Contents/MacOS/node-webkit";

                fs.stat(appPath, function(err, stat){
                    var exists = !err && stat;
                    if (!exists)
                        return callback(false);
                    
                    proc.spawn(appPath, {
                        args     : args,
                        detached : true
                    }, function(err, process){
                        if (err)
                            return callback(false);
    
                        // required so the parent can exit
                        process.unref && process.unref();
                        
                        var timed = Date.now();
                        (function retry(){
                            bridge.send({ type: "ping" }, function(err){
                                if (!err) 
                                    return callback(true);
                                
                                if (Date.now() - timed > 10000)
                                    return callback(false);
                                
                                setTimeout(retry, 100);
                            });
                        })();
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
            open : open
        });
        
        register(null, {
            open: plugin
        });
    }
});