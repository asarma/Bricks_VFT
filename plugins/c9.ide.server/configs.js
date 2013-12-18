/**
 * Serve client configs
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function(require, exports, module) {
    "use strict";

    main.consumes = [
        "Plugin",
        "connect",
        "api",
        "db"
    ];
    main.provides = ["c9.static.configs"];
    return main;


    function main(options, imports, register) {
        var Plugin      = imports.Plugin;
        var connect     = imports.connect;
        var api         = imports.api;
        var db          = imports.db;

        var fs          = require("fs");
        var path        = require("path");
        var error       = require("http-error");
        var runners     = require("../c9.ide.run/runners_list");
        var builders    = require("../c9.ide.run.build/builders_list");

        /***** Initialization *****/
        
        var plugin  = new Plugin("Ajax.org", main.consumes);

        var section = api.section("config");

        section.get("/require_config.js", {}, function(req, res, next) {
            var config = res.getOptions().requirejsConfig || {};
            config.waitSeconds = 60;
            
            res.writeHead(200, {"Content-Type": "text/javascript"});
            res.end("requirejs.config(" + JSON.stringify(config) + ");");
        });
        
        section.get("/:pid", {
            params: {
                pid: {
                    type: /^[0-9]+(:?\.(:?js|json))?$/,
                    source: "url"
                },
                callback: {
                    type: "string",
                    source: "query",
                    optional: true
                }
            }
        }, [
            api.authenticate(),
            function(req, res, next) {
                var params = req.params;
                
                var ext = params.pid.split(".")[1] || "json";
                var pid = params.pid.split(".")[0];
                var type = ext == "js" || params.callback
                    ? "text/javascript"
                    : "application/json";
                    
                var user = req.user;
                getConfigForProject(pid, user, function(err, architectConfig) {
                    if (err) return next(err);
                    
                    res.writeHead(200, {"Content-Type": type});
                    
                    if (ext == "js")
                        res.end("require.plugins = " + JSON.stringify(architectConfig));
                    else if (params.callback)
                        res.end(params.callback + "(" + JSON.stringify(architectConfig) + ");");
                    else 
                        res.end(JSON.stringify(architectConfig));
                });
            }
        ]);
        
        function getConfigForProject(pid, user, callback) {
            db.Project
                .findOne({project: pid})
                .populate("owner")
                .populate("remote")
                .exec(function(err, project) {
                    if (err) return callback(err);

                    if (project.remote.type != "openshift" && project.remote.type != "ssh")
                        return callback(new error.BadRequest("Only non 'ftp' projects are currently supported by the new client."));
                        
                    project.getRole(user, function(err, role) {
                        if (err) return callback(err);
                        
                        var workspaceId = project.owner.name + "/" + project.name;
                        var readonly;
                        
                        switch(role) {
                            case db.Project.ROLE_NONE:
                                return callback(new error.Forbidden("User '"+ user.name +"' is not allowed to access workspace '" + workspaceId + "'"));
                                
                            case db.Project.ROLE_VISITOR:
                                readonly = true;
                                break;
                                
                            case db.Project.ROLE_COLLABORATOR:
                            case db.Project.ROLE_ADMIN:
                                readonly = false;
                                break;
                        }                            
                        
                        getClientConfig(project, readonly, function(err, path) {
                            if (err) return callback(err);

                            getClientOptions(project, path, function(err, clientOptions) {
                                if (err) return callback(err);

                                clientOptions.user = user;
                                clientOptions.project = project;
        
                                var architectConfig;
                                try {
                                    architectConfig = require(path)(clientOptions);
                                } 
                                catch (e) {
                                    return callback(e);
                                }
                                
                                callback(null, architectConfig);                                
                            });
                        });
                    });
                });
        }
        
        function getClientConfig(project, readonly, callback) {
            var path = __dirname + "/../../configs/client-" + 
                project.getClientConfigName() + (readonly ? "-ro.js" : ".js");
            
            fs.exists(path, function(exists) {
                if (!exists && readonly) {
                    path = __dirname + "/../../configs/client-default-ro.js";
                    fs.exists(path, done);
                    return;
                }
                done(exists);
            });
            
            function done(exists) {
                if (!exists)
                    return callback(new error.NotFound("Client config '" + path + "' not found"));
                
                callback(null, path);  
            }
        }
        
        function getClientOptions(project, configPath, callback) {
            project.remote.getClientOptions(function(err, remoteOptions) {
                if (err) return callback(err);
                
                db.Vfs.findAllAndPurge(20 * 1000, function(err, servers) {
                    if (err) return callback(err);

                    var clientOptions = {};
                    
                    for (var key in options.options) {
                        clientOptions[key] = options.options[key];
                    }
                    
                    for (var key in remoteOptions)
                        clientOptions[key] = remoteOptions[key];
                        
                    clientOptions.vfsServers = servers;
                    clientOptions.projectId = project.pid;
                    clientOptions.workspaceId = project.owner.name + "/" + project.name;
                    clientOptions.workspaceName = project.name;
                    clientOptions.projectName = project.name;
                    clientOptions.runners = runners;
                    clientOptions.builders = builders;
                    clientOptions.previewUrl = options.previewBaseUrl + "/" + clientOptions.workspaceId;

                    clientOptions.local = false;
                    
                    clientOptions.staticPrefix = connect.getGlobalOption("staticPrefix");
                    clientOptions.workerPrefix = connect.getGlobalOption("workerPrefix");
                    
                    var configName = path.basename(configPath, ".js").replace(/^client-/, "");
                    clientOptions.configName = configName;
                    clientOptions.themePrefix = clientOptions.staticPrefix + "/../skin/" + configName,
                    
                    callback(null, clientOptions);
                });
            });
        }
        
        /***** Register and define API *****/
        
        plugin.freezePublicAPI({
            getConfig: getConfigForProject
        });
        
        register(null, {
            "c9.static.configs": plugin
        });
    }
});