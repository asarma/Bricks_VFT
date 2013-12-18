define(function (require, exports, module) {
"use strict";

return function(_request) {
    
    function request(method, path, body, callback, progress, sync){
        _request(path, {
            method   : method,
            body     : body,
            progress : progress,
            sync     : sync,
            timeout  : 60000
        }, callback);
    }
    
    function readFile(path, encoding, callback, progress) {
        if (typeof encoding == "function") {
            progress = callback;
            callback = encoding;
            encoding = null;
        }
    
        if (path == "/") {
            var err = new Error("Cannot read root as file");
            err.code = "EISDIR";
            return callback(err);
        }
        
        // Make sure the path doesn't have a trailing /
        // It would then be interpreted as a directory
        if (path.substr(-1) == "/")
            path = path.substr(0, path.length - 1);
    
        request("GET", path, "", callback, progress);
    }
    
    function writeFile(path, data, sync, callback, progress) {
        if (typeof sync == "function") {
            progress = callback;
            callback = sync;
            sync     = false;
        }
        
        // Make sure the path doesn't have a trailing /
        // It would then be interpreted as a directory
        if (path.substr(-1) == "/")
            path = path.substr(0, path.length - 1);
    
        request("PUT", path, data, callback, progress, sync);
    }
    
    function readdir(path, callback, progress) {
        // Make sure the path has a trailing /
        // It would otherwise be interpreted as a file
        if (path.substr(-1) != "/")
            path += "/";
    
        request("GET", path, "", function(err, data){
            if (err) return callback(err);
            
            try { var files = JSON.parse(data); }
            catch(e) { return callback(e); }
            
            callback(null, files, progress);
        });
    }
    
    function exists(path, callback) {
        request("HEAD", path, "", function(err){
            callback(err ? false : true);
        });
    }
    
    function stat(path, callback) {
        callback(new Error("stat is unsupported via XHR"));
    }
    
    function rename(from, to, options, callback) {
        if (typeof options == "function") {
            callback  = options;
            options = {};
        }
        
        request("POST", to, JSON.stringify({
            renameFrom: from, 
            overwrite: options.overwrite
        }), callback);
    }
    
    function mkdirHandler(callback){
        return function(err){
            if (err && err.message.indexOf("exists") > -1)
                callback({"code": "EEXIST", "message": err.message});
            else
                callback();
        };
    }
    
    function mkdirP(path, mode, callback) {
        callback(new Error("mkdirP is unsupported via XHR"));
    }
    
    function mkdir(path, callback) {
        // Make sure the path has a trailing /
        // It would otherwise be interpreted as a file
        if (path.substr(-1) != "/")
            path += "/";
    
        request("PUT", path, "", callback);
    }
    
    function rmfile(path, callback) {
        // Make sure the path doesn't have a trailing /
        // It would then be interpreted as a directory
        if (path.substr(-1) == "/")
            path = path.substr(0, path.length - 1);
    
        request("DELETE", path, "", callback);
    }
    
    function rmdir(path, options, callback) {
        if (typeof options == "function") {
            callback = options;
            options = {};
        }
        
        // Make sure the path doesn't have a trailing /
        // It would then be interpreted as a directory
        if (path.substr(-1) == "/")
            path = path.substr(0, path.length - 1);
    
        request("DELETE", path, JSON.stringify(options), callback);
    }
    
    function copy(path, to, options, callback){
        if (typeof options == "function") {
            callback  = options;
            options = {};
        }
        
        request("POST", to, JSON.stringify({
            copyFrom  : path, 
            overwrite : (options.overwrite !== undefined 
                ? options.overwrite 
                : true),
            recursive : options.recursive
        }), callback);
    }
    
    function symlink(path, target, callback){
        request("POST", path, JSON.stringify({ linkTo: target }), callback);
    }
    
    function metadata(path, data, sync, callback){
        if (typeof sync == "function") {
            callback  = sync;
            sync = false;
        }
        
        request("POST", path, JSON.stringify({metadata: data}), callback, null, sync);
    }
    
    function watch(path, callback) {
        callback(new Error("watch is unsupported via XHR"));
    }
    
    function unwatch(path, callback) {
        callback(new Error("unwatch is unsupported via XHR"));
    }
    
    return {
        readFile: readFile,
        writeFile: writeFile,
        readdir: readdir,
        exists: exists,
        stat: stat,
        rename: rename,
        mkdirP: mkdirP,
        mkdir: mkdir,
        unlink: rmfile,
        rmfile: rmfile,
        rmdir: rmdir,
        copy: copy,
        symlink: symlink,
        watch: watch,
        unwatch: unwatch,
        metadata: metadata
    };
};

});