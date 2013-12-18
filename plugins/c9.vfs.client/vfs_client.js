/**
 * Smith.io client
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function(require, exports, module) {
    "use strict";
    
    main.consumes = ["Plugin", "auth", "vfs.endpoint"];
    main.provides = ["vfs"];
    return main;


/**
 * login flow
 * 
 * init:
 *  - receive list of VFS servers
 *  - choose one of the servers (based on some metric)
 *  - create VFS connection to that VFS server and remember the ID in sessionStorage
 * 
 * offline:
 *  - ping a stable URL to detect if it is a network error
 *  - if it is a network error try to reconnect to the same VFS server with the same ID
 *  - if it is not a network error pick another server
 */

    function main(options, imports, register) {
        var Plugin      = imports.Plugin;
        var auth        = imports.auth;
        var vfsEndpoint = imports["vfs.endpoint"];
        
        var eio             = require("engine.io");
        var Consumer        = require("vfs-socket/consumer").Consumer;
        var connectClient   = require("kaefer");
        var smith           = require("smith");
        var URL             = require("url");

        /***** Initialization *****/
        
        var plugin  = new Plugin("Ajax.org", main.consumes);
        var emit    = plugin.getEmitter();
        
        var homeUrl;
        var projectUrl;
        var pingUrl;
        var eioOptions;
        var connection;
        var consumer;
        var vfs;
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            smith.debug = options.debug;
            
            connection = connectClient(connectEngine, {
                preConnectCheck: preConnectCheck,
                debug: options.debug
            });
            
            connection.on("away", emit.bind(null, "away"));
            connection.on("back", emit.bind(null, "back"));
            
            connection.on("disconnect", onDisconnect);
            connection.on("connect", onConnect);

            reconnect(function(err) {
                if (err) return console.log(err);
                connection.connect();
            });
            
            function connectEngine() {
                if (auth.accessToken) {
                    eioOptions.query = {
                        access_token: auth.accessToken
                    };
                }
                return eio(eioOptions);
            }
    
            function preConnectCheck(callback) {
                if (!eioOptions)
                    return callback(null, false);
                    
                vfsEndpoint.isOnline(function(err, isOnline) {
                    if (err || !isOnline) return callback(null, false);
                    
                    if (!pingUrl) return callback(null, true);
                    
                    vfsEndpoint.isServerAlive(pingUrl, function(err, isAlive) {
                        if (!err && isAlive) return callback(null, true);
                        
                        reconnect(function(err) {
                            callback(err, !err);
                        });
                    });
                });
            }
        }
        
        /***** Methods *****/
        
        function join(a, b) {
            return a.replace(/\/?$/, "/") + b.replace(/^\//, "");
        }
        
        function vfsUrl(path) {
            // resolve home and project url
            return path.charAt(0) == "~"
                ? join(homeUrl, escape(path.slice(1)))
                : join(projectUrl, escape(path));
        }
        
        function rest(path, options, callback) {
            // TODO buffer if not connected
            // if (!connection || connection.readyState != "open")
            //     return callback(new Error("Client is offline or not connected to the VFS server"));
            
            // resolve home and project url
            var url = vfsUrl(path);

            options.overrideMimeType = "text/plain";
            options.contentType = "text/plain";

            auth.request(url, options, function(err, data, res) {
                var reErrorCode = /(ENOENT|EISDIR|ENOTDIR|EEXIST|EACCESS|ENOTCONNECTED)/;
                
                if (err) {
                    if (!res) return callback(err);
                    
                    var message = (res.body || "").replace(/^Error:\s+/, "");
                    var code = res.status === 0
                        ? "ENOTCONNECTED"
                        : message.match(reErrorCode) && RegExp.$1;
                    
                    err = new Error(res.body);
                    err.code = code || undefined;
                    err.status = res.status;
                    return callback(err);
                }
                callback(null, data);
            });
        }
        
        function download(path, filename) {
            window.open(join(projectUrl, path) + "?download" + (filename ? "=" + encodeURIComponent(filename) : ""));
        }

        function reconnect(callback) {
            connection.socket.setSocket(null);
            
            vfsEndpoint.get(function(err, urls) {
                if (err) return callback(err);
                
                homeUrl = urls.home;
                projectUrl = urls.project;
                pingUrl = urls.ping;
                
                var parsedSocket = URL.parse(urls.socket);
                eioOptions = {
                    path: parsedSocket.path,
                    host: parsedSocket.host,
                    port: parsedSocket.port || "443",
                    secure: parsedSocket.protocol ? parsedSocket.protocol == "https:" : true
                };
                callback();
            });
        }

        function onDisconnect() {
            vfs = null;
            emit("disconnect");
        }
        
        function onConnect() {
            var transport = new smith.EngineIoTransport(connection); 
            
            if (consumer)
                consumer.disconnect();
            
            consumer = new Consumer();
            consumer.connectionTimeout = 5000;
            consumer.connect(transport, function(err, _vfs) {
                // TODO
                if (err) {
                    console.error("error connecting to VFS", err);
                    return;
                }
                
                vfs = _vfs;
                
                bufferedVfsCalls.forEach(vfsCall);
                bufferedVfsCalls = [];
                emit("connect");
            });
            
            consumer.on("error", function(err) {
                connection.disconnect();
            });
        }
        
        var bufferedVfsCalls = [];
        function vfsCall(method, path, options, callback) {
            if (Array.isArray(method))
                return vfsCall.apply(null, method);
                
            if (vfs)
                return vfs[method](path, options, callback);
            else
                bufferedVfsCalls.push([method, path, options, callback]);
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("unload", function(){
            loaded = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * @event connect Fires ...
         * @event disconnect Fires ...
         * @event message Fires ...
         * @event away Fires ...
         * @event back Fires ...
         * @event error Fires ...
         */
        plugin.freezePublicAPI({
            
            get connection(){ return connection; },
            get connecting(){ return connection ? connection.readyState == "reconnecting" : true; },
            get connected(){ return vfs ? connection.readyState == "open" : false; },
            
            get previewUrl(){ throw new Error("gone") },
            
            /**
             * Performs a VFS REST API call
             * @param path      {String} Path of the resource. Can be prefixed 
             *                           with '~' to resolve the path relative 
             *                           to the user's home dir
             * @param options   {Object} Same format as 'http.request'
             * @param callback(err, data) {Function}
             */
            rest: rest,
            download: download,
            url: vfsUrl,

            // File management
            resolve: vfsCall.bind(null, "resolve"),
            stat: vfsCall.bind(null, "stat"),
            readfile: vfsCall.bind(null, "readfile"),
            readdir: vfsCall.bind(null, "readdir"),
            mkfile: vfsCall.bind(null, "mkfile"),
            mkdir: vfsCall.bind(null, "mkdir"),
            mkdirP: vfsCall.bind(null, "mkdirP"),
            rmfile: vfsCall.bind(null, "rmfile"),
            rmdir: vfsCall.bind(null, "rmdir"),
            rename: vfsCall.bind(null, "rename"),
            copy: vfsCall.bind(null, "copy"),
            symlink: vfsCall.bind(null, "symlink"),

            // Retrieve Metadata
            metadata: vfsCall.bind(null, "metadata"),

            // Wrapper around fs.watch or fs.watchFile
            watch: vfsCall.bind(null, "watch"),

            // Network connection
            connect: vfsCall.bind(null, "connect"),

            // Process Management
            spawn: vfsCall.bind(null, "spawn"),
            pty: vfsCall.bind(null, "pty"),
            execFile: vfsCall.bind(null, "execFile"),

            // Extending the API
            use: vfsCall.bind(null, "use"),
            extend: vfsCall.bind(null, "extend"),
            unextend: vfsCall.bind(null, "unextend")
        });
        
        register(null, {
            "vfs": plugin
        });
    }
});