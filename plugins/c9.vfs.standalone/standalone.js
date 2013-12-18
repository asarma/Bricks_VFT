"use strict";

plugin.consumes = [
    "connect.static", 
    "connect",
    "preview.handler"
];
plugin.provides = ["api", "vfs.ping", "passport"];

module.exports = plugin;
    
var fs = require("fs");
var assert = require("assert");
var frontdoor = require("frontdoor");
var resolve = require("path").resolve;
var build = require("architect-build/build");
var pathConfig = require("architect-build/path_config");
var execFile = require("child_process").execFile;

function plugin(options, imports, register) {
    var previewHandler = imports["preview.handler"];
    
    assert(options.workspaceDir, "Option 'workspaceDir' is required");
    assert(options.options, "Option 'options' is required");
    
    var statics = imports["connect.static"];

    // serve index.html
    statics.addStatics([{
        path: __dirname + "/www",
        mount: "/"
    }]);
    
    statics.addStatics([{
        path: __dirname + "/../../configs",
        mount: "/configs"
    }]);

    statics.addStatics([{
        path: __dirname + "/../../test/resources",
        mount: "/test"
    }]);

    var api = frontdoor();
    imports.connect.use(api);
    
    api.get("/", function(req, res, next) {
        res.writeHead(302, {"Location": "/static/places.html"});
        res.end();
    });
    
    api.get("/_ping", function(params, callback) {
        return callback(null, {"ping": "pong"}); 
    });
    
    api.get("/preview/:path*", [
        function(req, res, next) {
            req.projectSession = {
                pid: 1
            };
            req.session = {};
            next();
        },
        previewHandler.proxyCall(function() {
            return {
                url: "http://localhost:" + options.options.port + "/vfs"
            };
        })
    ]);
    
    api.get("/preview", function(req, res, next) {
        res.redirect(req.url + "/");
    });

    api.get("/vfs-root", function(req, res, next) {
        if (!options.options.testing)
            return next();
            
        res.writeHead(200, {"Content-Type": "application/javascript"});
        res.end("define(function(require, exports, module) { return '" 
            + options.workspaceDir + "'; });");
    });

    api.get("/update", function(req, res, next) {
        res.writeHead(200, {
            "Content-Type": "application/javascript", 
            "Access-Control-Allow-Origin": "*"
        });
        var path = resolve(__dirname + "/../../build/output/latest.tar.gz");
        fs.readlink(path, function(err, target){
            res.end((target || "").split(".")[0]);
        });
    });
    
    api.get("/update/:path*", function(req, res, next) {
        var filename = req.params.path;
        var path = resolve(__dirname + "/../../build/output/" + filename);
        
        res.writeHead(200, {"Content-Type": "application/octet-stream"});
        var stream = fs.createReadStream(path);
        stream.pipe(res);
    });
    
    api.get("/configs/:type", {
        params: {
            type: {
                type: /^(devel|client|workspace-\w+)\.js$/
            }
        }
    }, function(req, res, next) {
        var architectConfig = getConfig("/configs/" + req.params.type, options);
        res.writeHead(200, {"Content-Type": "application/javascript"});
        res.end("require.plugins = " + JSON.stringify(architectConfig));
    });
    
    api.get("/configs/require_config.js", function(req, res, next) {
        var config = res.getOptions().requirejsConfig || {};
        config.waitSeconds = 60;
        
        res.writeHead(200, {"Content-Type": "application/javascript"});
        res.end("requirejs.config(" + JSON.stringify(config) + ");");
    });
    
    api.get("/build", {
        params: {
            conf: {
                type: "json",
                required: true,
                source: "query"
            }
        }
    }, function(req, res, next) {
        var architectConfig = req.params.conf;
        build(architectConfig, {
            pathConfig    : pathConfig,
            enableBrowser : true,
            includeConfig : true,
            debug         : true,  
        }, function(err, result) {
            res.writeHead(200, {"Content-Type": "application/javascript"});
            res.end(result && result.code || "");
        });
    });
    
    api.get("/build/:config", function(req, res, next) {
        var configPath = "/configs/" + req.params.config;
        var architectConfig = getConfig(configPath, options);
    
        build(architectConfig, {
            pathConfig    : pathConfig,
            enableBrowser : true,
            includeConfig : true,
            debug         : true,  
            additonal     : ["../architect-build/build_support/mini_require"],
        }, function(err, result) {
            res.writeHead(200, {"Content-Type": "application/javascript"});
            res.end(result && result.code || "");
        });
    });
    
    api.get("/test/all.json", function(req, res, next) {
        
        var result = {};
        
        fs.readFile(__dirname + "/../../test/blacklist.txt", "utf8", function(err, blacklist) {
            if (err) return next(err);
            
            result.blacklist = blacklist.split("\n")
                .map(function(line) {
                    return line.replace(/#.*$/, "").trim();
                })
                .filter(function(line) {
                    return line && line.charAt(0) !== "#";
                })
                .reduce(function(res, file) {
                    res[file] = 1;
                    return res;
                }, {});
                
            execFile("find", ["plugins", "-name", "*_test.js"], { cwd: __dirname + "/../.." }, function(err, stdout, stderr) {
                if (err) return next(err);
                
                result.all = stdout.split("\n")
                    .map(function(line) {
                        return line.trim();
                    })
                    .filter(function(line) {
                        return !!line;
                    });
                    
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(JSON.stringify(result, null, 2));
            });
            
        });
        
    });

    // fake authentication
    api.authenticate = function() {
        return function(req, res, next) { 
            req.user = {
                uid: 1
            };
            next(); 
        };
    };
    api.ensureAdmin = function() {
        return function(req, res, next) { 
            next(); 
        };
    };
    imports.connect.setGlobalOption("apiBaseUrl", "");

    register(null, {
        "api": api,
        "vfs.ping": {
            ping: function(pid, callback) {
                return callback(null, {ping: 0, db: 0});
            }
        },
        "passport": {
            authenticate: function() {
                return function(req, res, next) {
                    req.user = {
                        uid: 1
                    };
                    next();
                };
            }
        }
    });
}

function getConfig(requested, options) {
    var path;
    if (requested == "/configs/devel.js") {
        path = "/../../configs/client-devel.js";
    }
    else if (requested && requested.lastIndexOf("/configs/workspace-", 0) === 0) {
        path = "/../../configs/client-" + requested.substr(requested.lastIndexOf("/") + 1);
    }
    else if (options.workspaceType) {
        path = "/../../configs/client-workspace-" + options.workspaceType + ".js";
    }
    else if (options.local) {
        path = "/../../configs/client-local.js";
    }
    else if (options.readonly) {
        path = "/../../configs/client-default-ro.js";
    }
    else {
        path = "/../../configs/client-default.js";
    }
    
    var filename = __dirname + path;

    try {
        options.options.installed = 
            require("fs").readFileSync(process.env.HOME + "/.c9/installed") == "1";
    }
    catch(e) {}

    return require(filename)(options.options);
}
