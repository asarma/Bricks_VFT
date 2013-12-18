define(function(require, exports, module) {
    "use strict";
    
    main.consumes = [
        "connect.render",
        "connect.render.ejs",
        "connect.redirect"
    ];
    main.provides = ["preview.handler"];
    return main;


    function main(options, imports, register) {
        var error = require("http-error");
        var https = require("https");
        var http = require("http");
        
        function getProjectSession() {
            return function(req, res, next) {
                var session = req.session;
    
                req.user = req.user || { uid: -1 };
    
                var username = req.params.username;
                var projectname = req.params.projectname;
    
                var ws = req.ws = username + "/" + projectname;
                
                if (!session.ws)
                    session.ws = {};
    
                req.projectSession = session.ws[ws];
                if (!req.projectSession)
                    req.projectSession = session.ws[ws] = {};
                    
                next();
            };
        }
        
        function getRole(db) {
            return function(req, res, next) {
                if (req.projectSession.role)
                    return next();
                    
                db.Project.findOne({
                    username: req.params.username,
                    name: req.params.projectname
                }, function(err, project) {
                    if (err && err.code == 404)
                        return next(new error.NotFound("Project '" + req.ws + "' doest not exist."));
                        
                    if (err) return next(err);
                    
                    project.getRole(req.user, function(err, role) {
                        if (err) return next(err);
                        
                        if (role == db.Project.ROLE_NONE) {
                            if (req.user.uid == -1)
                                return next(new error.Unauthorized());
                            else
                                return next(new error.Forbidden("You don't have access rights to preview this workspace"));
                        }
                        req.projectSession.role = role;
                        req.projectSession.pid = project.pid;
                        
                        next();
                    });
                });
            };
        }

        function proxyCall(getServer) {
            return function(req, res, next) {
                var server = req.projectSession.vfsServer;
                if (!server)
                    server = req.projectSession.vfsServer = getServer().url;
                        
                var path = req.params.path;
                
                var url = server + "/" + req.projectSession.pid + "/preview" + req.params.path;
                if (req.session.token)
                    url += "?access_token=" + req.session.token;
                
                var httpModule = url.indexOf("https") === 0 ? https : http;
                httpModule.get(url, function(request) {
                    if (request.statusCode >= 400)
                        handleError(request);
                    else if (path[path.length-1] == "/")
                        serveListing(request);
                    else
                        serveFile(request);
                }).on("error", function(err) {
                    next(err); 
                });
                
                function handleError(request) {
                    var body = "";
                    
                    if (request.statusCode == 401)
                        return next(new error.Unauthorized());
                    
                    request.on("data", function(data) {
                        body += data;
                    });
                    request.on("end", function(data) {
                        if (data)
                            body += data;

                        if (body.indexOf("EISDIR") !== -1) {
                            res.redirect(req.url + "/");
                        } else if (body.indexOf("ENOENT") !== -1) {
                            next(new error.NotFound("File '" + path + "' could not be found!"));
                        } else {
                            next(new error.HttpError(body.split("\n")[0], request.statusCode));
                        }
                    });                          
                }
                
                function serveListing(request) {
                    var body = "";
                    request.on("data", function(data) {
                        body += data;
                    });
                    request.on("end", function(data) {
                        if (data)
                            body += data;
                        
                        try {
                            body = JSON.parse(body);
                        } catch(e) {
                            return next(e);
                        }
                        
                        var entries = body
                            .filter(function(entry) {
                                return entry.name[0] !== ".";
                            })
                            .sort(function(a, b) {
                                if (a.mime === "inode/directory" && b.mime !== "inode/directory")
                                    return -1;
                                else if (a.mime !== "inode/directory" && b.mime === "inode/directory")
                                    return 1;
                                else if (a.name.toLowerCase() == b.name.toLowerCase())
                                    return 0;
                                else if (a.name.toLowerCase() < b.name.toLowerCase())
                                    return -1;
                                else
                                    return 1;
                            });
                        
                        res.render(__dirname + "/views/listing.html.ejs", {
                            isRoot: path == "/",
                            entries: entries
                        }, next);
                    });
                }
                
                function serveFile(request) {
                    res.writeHead(200, {
                        "content-length": request.headers["content-length"],
                        "content-type": request.headers["content-type"],
                        "etag": request.headers.etag,
                        "date": request.headers.data
                    });
                    request.pipe(res);
                }
                
            };
        }
        
        register(null, {
            "preview.handler": {
                getProjectSession: getProjectSession,
                getRole: getRole,
                proxyCall: proxyCall
            }
        });
    }
});