"use strict";

/**
 * Serves the index.html for the VFS app
 */

main.consumes = [
    "Plugin",
    "db",
    "session",
    "connect.render",
    "connect.render.ejs",
    "connect.static",
    "connect.redirect",
    "connect.ensure-login",
    "c9.static.configs",
    "c9.login"
];
main.provides = ["ide.app"];

module.exports = main;

function main(options, imports, register) {
    var db             = imports.db;
    var Plugin         = imports.Plugin;
    var session        = imports.session;
    var render         = imports["connect.render"];
    var getConfig      = imports["c9.static.configs"].getConfig;
    var ensureLoggedIn = imports["connect.ensure-login"].ensureLoggedIn;
    
    var error          = require("http-error");
    var frontdoor      = require("frontdoor");
    var userFilter     = require("./user_filter");
    var request        = require("request");
    
    /***** Initialization *****/
    
    var plugin  = new Plugin("Ajax.org", main.consumes);
    
    var api = frontdoor();
    session.use(api);

    api.use(render.setTemplatePath(__dirname + "/views"));
    
    /**
     * the client uses this URL to detect if there is a network connection
     */
    api.get("/_ping", function(params, callback) {
        return callback(null, {"ping": "pong"}); 
    });
    
    /**
     * Forward worker requests to the CDN
     */
    api.get("/_worker/:path*", function(req, res, next) {
        var url = options.workerPrefix + req.params.path.replace(/(\.js)*$/, ".js");
        request.get(url, {
            headers: {
                "Accept-Encoding": req.headers["accept-encoding"]
            }
        }).pipe(res);
    });
    
    api.get("/:username/:projectname", {
        params: {
            username: {
                type: /^[a-z]{1}[0-9a-z_]{3,19}$/
            },
            projectname: {
                type: "string"
            }
        }
    }, [
        ensureLoggedIn(),
        function(req, res, next) {
            db.User.findOne({
                username: req.params.username
            }, function(err, user) {
                if (err) return next(err);
                
                db.Project.findOne({
                    owner: user,
                    name: req.params.projectname
                }, function(err, project) {
                    if (err) return next(err);
    
                    if (!userFilter(user, project))
                        return next(new error.Forbidden());
    
                    var oldClient = options.ideBaseUrl + "/" + req.params.username + "/" + req.params.projectname;
                    if (project.state !== db.Project.STATE_READY)
                        return res.redirect(oldClient);
                        
                    if (project.scm == "ftp")
                        return res.redirect(oldClient);

                    getConfig(project, user, function(err, architectConfig) {
                        if (err) return next(err);
                        
                        var configName = architectConfig.filter(function(c) {
                            return c.packagePath && c.packagePath.match(/\/c9\.core\/c9$/);
                        })[0].configName;
                        
                        res.setHeader("X-Frame-Options", "DENY");
                        res.render("ide.html.ejs", {
                            architectConfig: architectConfig,
                            configName: configName,
                            name: project.name,
                            pid: project.pid,
                            ideBaseUrl: options.ideBaseUrl,
                            appId: options.appId + "_postmessage" || "ide_postmessage",
                            packed: options.packed
                        }, next);
                    });
                });
            });
        }
    ]);
    
    /***** Register and define API *****/
    
    plugin.freezePublicAPI({});
    
    register(null, {
        "ide.app": plugin
    });
}