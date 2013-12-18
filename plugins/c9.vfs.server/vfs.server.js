"use strict";

plugin.consumes = [
    "api",
    "passport",
    "connect",
    "connect.cors",
    "connect.render",
    "connect.render.ejs",
    "vfs.cache",
    "vfs.ping"
];
plugin.provides = [
    "vfs.server"
];

module.exports = plugin;

/**
 * VFS session:
 * - unique vfsid
 * - bound to the client sessionId
 * - either readonly or read/write
 * - auto disposes after N seconds of idle time
 * - keeps:
 *  - vfs-ssh instance
 *  - engine.io instance (only one socket connected at a time)
 *  - vfs rest API instance
 *     
 * - authentication using tokens or auth headers (no cookies)
 */
function plugin(options, imports, register) {
    var api = imports.api;
    var cache = imports["vfs.cache"];
    var ping = imports["vfs.ping"].ping;
    var connect = imports.connect;
    var passport = imports.passport;
    var cors = imports["connect.cors"];
    var render  = imports["connect.render"];
    
    var Types = require("frontdoor").Types;
    var error = require("http-error");

    var section = api.section("vfs");

    connect.useStart(cors.cors("*", {
        methods: "GET, OPTIONS, PUT, POST, DELETE, HEAD, PROPFIND",
        headers: ["Content-Type"]
    }));

    section.registerType("vfsid", new Types.RegExp(/[a-zA-Z0-9]{16}/));
    section.registerType("pid", new Types.Number(0));
    
    // used for determining the load of a VFS server
    // section.get("/status", [
    
    // admin interface
    api.use(render.setTemplatePath(__dirname + "/views"));
    api.get("/:status", {
        params: {
            status: {
                type: /^vfs(:?\.(:?json|html))?$/,
                source: "url"
            }
        }
    }, [
        api.ensureAdmin(),
        function(req, res, next) {
            
            var type = req.params.status.split(".")[1] || "html";
            
            var entries = cache.getAll();
            var data = {
                entries: []
            };
            for (var key in entries) {
                var entry = entries[key];
                
                data.entries.push({
                    vfsid: entry.vfsid,
                    pid: entry.pid,
                    uid: entry.user.uid,
                    ttl: entry.ttl,
                    readonly: entry.vfs ? entry.vfs.readonly : "",
                    state: entry.vfs ? "connected" : "connecting",
                    startTime: entry.startTime,
                    connectTime: entry.connectTime || -1
                });
            }
            
            if (type == "json")
                res.json(data);
            else
                res.render("status.html.ejs", data, next);
        }
    ]);
    
    // creates a new connection for the specified project
    section.post("/:pid", {
        params: {
            "pid": {
                type: "pid"
            }
        }
    }, [
        api.authenticate(),
        function(req, res, next) {
            var pid = req.params.pid;
            var user = req.user;
            
            var done = false;
            var cancel = cache.create(pid, user, function(err, entry) {
                if (done) return;
                if (err) return next(err);
            
                res.json({
                    pid: pid,
                    vfsid: entry.vfsid
                }, null, 201);
            });

            // if the clients aborts the request we have to kill the ssh process
            req.on("close", function() {
                done = true;
                cancel();
                res.json({}, 0, 500);
            });
        }
    ]);
    
    // ping the ssh server
    // don't authenticate. We want to hit the db as little as possible
    section.get("/:pid/ping", {
        params: {
            "pid": {
                type: "pid"
            }
        }
    }, function(req, res, next) {
        var pid = req.params.pid;
        ping(pid, function(err, result) {
            if (err) return next(err);
            
            res.json(result);
        });
    });
    
    // checks if the connection exists and returns connection meta data
    section.get("/:pid/:vfsid", {
        params: {
            "pid": {
                type: "pid"
            },
            "vfsid": {
                type: "vfsid"
            }
        }
    }, function(req, res, next) {
        var pid = req.params.pid;
        var vfsid = req.params.vfsid;
        
        var entry = cache.get(vfsid);
        if (!entry)
            return next(new error.NotFound("VFS connection does not exist"));
        
        res.json({
            pid: pid,
            vfsid: vfsid,
            uid: entry.user.uid
        });
    });
    
    // read only rest interface
    section.get("/:pid/preview/:path*", {
        "pid": {
            type: "pid"
        },
        "path": {
            type: "string"
        }
    }, [
        function(req, res, next) {
            passport.authenticate("bearer", { session: false }, function(err, user) {
                if (err) return next(err);
                
                req.user = user || { uid: -1};
                next();
            })(req, res, next);
        },
        function(req, res, next) {
            var pid = req.params.pid;
            var path = req.params.path;
            var user = req.user;

            cache.readonlyRest(pid, user, path, req, res, next);
        }
    ]);
    
    // disconnects VFS connection
    section.delete("/:pid/:vfsid", {
        params: {
            "pid": {
                type: "pid"
            },
            "vfsid": {
                type: "vfsid"
            }
        }
    }, function(req, res, next) {
        var vfsid = req.params.vfsid;
        
        cache.remove(vfsid);
        res.json({}, null, 201);
    });
    
    // returns the ping time between workspace and VFS server (optional)
    //section.post("/:pid/ping");
    
    // REST API
    // serves all files with mime type "text/plain"
    // real mime type will be in "X-C9-ContentType"
    section.all("/:pid/:vfsid/:scope/:path*", {
        params: {
            "pid": {
                type: "pid"
            },
            "vfsid": {
                type: "vfsid"
            },
            "scope": {
                type: /^(home|workspace)$/
            },
            "path": {
                type: "string"
            }
        }
    }, function(req, res, next) {
        var vfsid = req.params.vfsid;
        var scope = req.params.scope;
        var path = req.params.path;

        var entry = cache.get(vfsid);
        if (!entry)
            return next(new error.NotFound("VFS connection does not exist"));

        entry.vfs.handleRest(scope, path, req, res, next);
    });
    
    // engine.io endpoint of the VFS server
    section.all("/:pid/:vfsid/socket/:path*", {
        params: {
            "pid": {
                type: "pid"
            },
            "vfsid": {
                type: "vfsid"
            },
            "path": {
                type: "string"
            }
        }
    }, function handleEngine(req, res, next) {
        var vfsid = req.params.vfsid;
        
        var entry = cache.get(vfsid);
        if (!entry)
            return next(new error.NotFound("VFS connection does not exist"));
            
        entry.vfs.handleEngine(req, res, next);
    });

    register(null, {
        "vfs.server": {}
    });
}
