"use strict";

var EventEmitter = require("events").EventEmitter;
var util = require("util");
var kaefer = require("kaefer");
var smith = require("smith");
var eio = require("engine.io");
var restful = require("vfs-http-adapter");
var VfsWorker = require('vfs-socket/worker').Worker;
var wrapVfs = require("./vfs_wrapper");
var proxyVfs = require("./vfs_proxy");
var urlParse = require('url').parse;

module.exports = Vfs;

function Vfs(vfs, master, options) {
    EventEmitter.call(this);
    
    this.vfs      = vfs;
    this.master   = master;
    this.debug    = options.debug || false;
    this.readonly = options.readonly || false;
    this.public = options.public || false;

    this.homeDir      = options.homeDir;
    this.workspaceDir = options.projectDir;
    
    this.vfsHome = wrapVfs(vfs, {
        root     : this.homeDir,
        readonly : this.readonly
    });
    this.vfsWorkspace = wrapVfs(vfs, {
        root     : this.workspaceDir,
        readonly : this.readonly
    });
    
    var vfsProxy = proxyVfs(Object.keys(this.vfsHome), this.vfsHome, this.vfsWorkspace);
    this.engine = this._createEngine(vfsProxy);

    this.restful = {
        home: restful("/", this.vfsHome, {
            autoIndex : false,
            noMime    : true,
            readOnly  : this.readonly
        }),
        workspace: restful("/", this.vfsWorkspace, {
            autoIndex: true,
            noMime: false,
            readOnly: this.readonly
        })
    };
    
    this._watchConnection();
}

util.inherits(Vfs, EventEmitter);

Vfs.prototype.handleRest = function(scope, path, req, res, next) {
    this.emit("keepalive");
    
    if (!req.uri) { req.uri = urlParse(req.url, true); }
    var proto = req.headers["x-forwarded-proto"] || (req.socket.encrypted ? "https" : "http");
    req.restBase = proto + "://" + req.headers.host + req.uri.pathname;
    req.uri.pathname = path;

    this.restful[scope](req, res, next);
};

Vfs.prototype.handleEngine = function(req, res, next) {
    if (req.ws) {
        req.method = "GET";
        this.engine.handleUpgrade(req, req.ws.socket, req.ws.head);
        
        // default node behavior is to disconnect when no handlers
        // but by adding a handler, we prevent that
        // and if no eio thing handles the upgrade
        // then the socket needs to die!
        setTimeout(function() {
            var socket = req.ws.socket;
            if (socket.writable && socket.bytesWritten <= 0) {
                return socket.end();
            }
        }, 1000);
    }
    else {
        this.engine.handleRequest(req, res);
    }
};

Vfs.prototype.destroy = function(err) {
    if (err) {
        console.error("VFS error", err);
        console.trace();
    }

    if (this.master)
        this.master.destroy();

    if (this.socket)
        this.socket.disconnect();

    clearInterval(this.keepAliveTimer);
    
    this.master = null;
    this.emit("destroy", err);
};

Vfs.prototype._watchConnection = function() {
    var master = this.master;
    var that = this;
    
    function onDisconnect(err) {
        that.emit("disconnect");
        if (err)
            return that.destroy(err);
        else
            reconnect();
    }
    function onError(err) {
        that.destroy(err);
    }
    function onStderr(data) {
        // @todo
        console.error("VFS stderr [" + "ID" + "]: " + data); 
    }
    
    master.on("disconnect", onDisconnect);
    master.on("error", onError);
    master.on("stderr", onStderr);
    
    master.destroy = function() {
        master.removeListener("disconnect", onDisconnect);
        master.removeListener("error", onError);
        master.removeListener("stderr", onStderr);
        master.disconnect();
    };
    
    var reconnect = exponentialBackup(10, 16000, function(callback) {
        master.connect(function(err) {
            if (err) {
                console.error("Connect error", err);
                return callback(err);
            }
            
            that.emit("connect");
            if (that.socket)
                that.socket.disconnect();
                
            callback();
        });
    });
    
    function exponentialBackup(initialTimeout, maxTimeout, connect) {
        var timeout = initialTimeout;
        return function retry() {
            setTimeout(function() {
                connect(function(err) {
                    if (err) {
                        timeout = Math.max(timeout + timeout, maxTimeout);
                        retry();
                    }
                    else {
                        timeout = initialTimeout;
                    }
                });
            }, timeout);
        };
    }

};

Vfs.prototype._createEngine = function(vfs) {
    var that = this;
    
    var engine = new eio.Server({
        pingTimeout   : 3000,
        pingInterval  : 15000,
        transports    : ["polling", "websocket"],
        allowUpgrades : true,
        cookie        : false
    });
    
    this.keepAliveTimer = null;
    
    var server = new kaefer.Server(engine, { debug: false });
    server.on("connection", function (socket) {
        clearInterval(that.keepAliveTimer);
        that.keepAliveTimer = setInterval(function() {
            that.emit("keepalive");
        }, 2000);
        
        if (that.socket)
            that.socket.disconnect();
        
        that.socket = socket;
        
        var transport = new smith.EngineIoTransport(socket, true);
        var worker    = new VfsWorker(vfs);
        worker.connectionTimeout = 30000;
        worker.connect(transport);
    
        worker.on("error", function (err) {
            console.error(err.stack);
        });

        // Fires once after reconnect attempts have failed and a timeout has passed.
        worker.once("disconnect", function() {
            clearInterval(that.keepAliveTimer);
            that.socket = null;
        });
    });

    return engine;
};