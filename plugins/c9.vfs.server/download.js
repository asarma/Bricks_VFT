define(function(require, exports, module) {
    "use strict";

    main.consumes = ["Plugin", "vfs.cache"];
    main.provides = ["vfs.download"];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var cache = imports["vfs.cache"];
        
        var error = require("http-error");
        var Path = require("path");

        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);

        cache.registerExtension(function(vfs, callback) {
            
            var restful = vfs.restful.workspace;
            
            vfs.restful.workspace = function(req, res, next) {
                if (req.method == "GET" && "download" in req.uri.query)
                    download(vfs.vfs, vfs.workspaceDir, req, res, next);
                else
                    restful(req, res, next);
            };
            
            callback();
        });
        
        function download(vfs, root, req, res, next) {
            var path = Path.join(root, Path.normalize(req.uri.pathname.replace(/^(\/?\.\.)?\/?/, "")));
            var dir = Path.dirname(path);
            var name = Path.basename(path).replace(/\/*$/, "");
            
            var filename;
            if (req.uri.query.download)
                filename = req.uri.query.download;
            else
                filename = name + ".zip";
            
            var process;

            req.on("close", function() {
                if (process) process.kill();
            });

            vfs.spawn("zip", {
                args: ["-r", "-", name],
                cwd: dir
            }, function (err, meta) {
                if (err)
                    return next(err);
                    
                process = meta.process;

                // once we receive data on stdout pipe it to the response        
                process.stdout.once("data", function (data) {
                    if (res.headerSent)
                        return;
                        
                    res.writeHead(200, {
                        "Content-Type": "application/zip",
                        "Content-Disposition": "attachment; filename=" + filename
                    });
                    res.write(data);
                    process.stdout.pipe(res);
                });
        
                var stderr = "";
                process.stderr.on("data", function (data) {
                    stderr += data;
                });
                
                process.on("exit", function(code, signal) {
                    if (res.headerSent)
                        return;
                        
                    var err;
                    if (code == 127) {
                        err = new error.PreconditionFailed(
                            "Your instance seems to be missing the 'zip' utility\n" + 
                            "If you are using an SSH workspace, please do:\n" +
                            "    'sudo apt-get install zip'");
                    } else if (code) {
                        err = new error.InternalServerError(
                            "'zip' utility failed with exit code " + code + 
                            " and stderr:/n'" + stderr + "'");
                    } else if (signal) {
                        err = new error.InternalServerError(
                            "'zip' utility was terminated by signal " + signal
                        );
                    }
                    
                    if (err) {
                        console.error(err);
                        next(err);
                    }
                });
            });
        }

        plugin.freezePublicAPI({
            // for testing only
            download: download
        });
        
        register(null, { "vfs.download" : plugin });
    }
});