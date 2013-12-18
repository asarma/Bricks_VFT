define(function(require, exports, module) {
    main.consumes = ["Plugin", "auth", "http"];
    main.provides = ["vfs.endpoint"];
    return main;

    function main(options, imports, register) {
        var Plugin  = imports.Plugin;
        var auth    = imports.auth;
        var http    = imports.http;

        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        
        var urlServers;
        var query = require("url").parse(document.location.href, true).query;
        if (query.vfs) {
            urlServers = [{
                url: query.vfs,
                dc: "url"
            }];
        }
        if (query.vfs || query.dc) {
            var vfs = recallVfs();
            if (vfs) {
                if (query.vfs && query.vfs !== vfs.url)
                    deleteOldVfs();
                else if (query.dc && query.dc !== vfs.dc)
                    deleteOldVfs();
            }
        }
        var datacenter = query.dc || options.datacenter;
        
        var loc = document.location;
        var defaultServers = [{
            url: loc.protocol + "//" + loc.hostname + (loc.port ? ":" + loc.port : "") + "/vfs",
            dc: "default"
        }];
        var servers = (urlServers || options.servers || defaultServers).map(function(server) {
            server.url = server.url.replace(/\/*$/, "");
            return server;
        });
        
        
        options.projectId = options.projectId || 1;
        
        /***** Methods *****/
        
        function getVfsEndpoint(callback) {
            getVfsUrl(servers, function(err, url) {
                if (err) return callback(err);
                
                callback(null, {
                    home: url + "/home",
                    project: url + "/workspace",
                    socket: url + "/socket",
                    ping: url
                });
            });
        }
        
        function isOnline(callback) {
            http.request("/_ping", {
                timeout : 2000,
                force   : true
            }, function(err, data, res) {
                callback(err, !err);
            });
        }
        
        function isServerAlive(url, callback) {
            auth.request(url, { force: true }, function(err, data, res) {
                if (err)
                    deleteOldVfs();
                     
                callback(err, !err);
            });
        }
        
        function getVfsUrl(vfsServers, callback) {
            var vfs = recallVfs();
                
            if (vfs && vfs.vfsid) 
                return callback(null, vfs.vfsid);
            
            var servers = shuffleServers(vfsServers);
            
            // just take the first server that doesn't return an error
            (function tryNext(i) {
                if (i >= servers.length)
                    return callback(new Error("No VFS server found"));
                
                var server = servers[i];
                
                auth.request(server.url + "/" + options.projectId, {
                    method  : "POST",
                    timeout : 120000,
                    force   : true
                }, function(err, res) {
                    if (err) return tryNext(i+1);
                    
                    var vfs = rememberVfs(server, res.vfsid);
                    callback(null, vfs.vfsid);
                });
            })(0);
        }
        
        function shuffleServers(servers) {
            return servers.concat().sort(function(a, b) {
                if (a.datacenter == b.datacenter)
                    return (0.5 - Math.random());
                else if (a.datacenter == datacenter)
                    return -1;
                else if (b.datacenter == datacenter)
                    return 1;
                else
                    return 0;
            });
        }
        
        function rememberVfs(server, vfsid) {
            var vfs ={
                url: server.url,
                dc: server.datacenter,
                pid: options.projectId,
                vfsid: server.url + "/" + options.projectId + "/" + vfsid
            };
            
            var data = JSON.stringify(vfs);
            var oldData = window.sessionStorage.getItem("vfsid");
            if (oldData && oldData !== data)
                deleteOldVfs();
                
            window.sessionStorage.setItem("vfsid", data);
            return vfs;
        }
        
        function recallVfs() {
            var vfs;
            try {
                vfs = JSON.parse(window.sessionStorage.getItem("vfsid"));
            } catch(e) {}
            
            if (!vfs)
                return null;
            
            if (vfs.pid !== options.projectId) {
                deleteOldVfs();
                return null;
            }
            
            return vfs;
        }
        
        function deleteOldVfs() {
            var vfs;
            try {
                vfs = JSON.parse(window.sessionStorage.getItem("vfsid"));
            } catch(e) {}

            window.sessionStorage.removeItem("vfsid");
            if (!vfs) return;
            
            auth.request(vfs.vfsid, {
                method : "DELETE",
                force  : true
            }, function(err) {
                if (err) console.error(vfs.vfsid, "deleted", err); 
            });
        }
        
        /***** Register and define API *****/
        
        /**
         **/
        plugin.freezePublicAPI({
            /**
             * Returns the URLs for the home and project REST API and the socket 
             */
            get: getVfsEndpoint,
            
            /**
             * Checks if the client has a network connection
             */
             
            isOnline: isOnline,
            
            /**
             * Checks if the current VFS server is still alive
             */
            isServerAlive: isServerAlive 
        });
        
        register(null, {
            "vfs.endpoint": plugin
        });
    }
});