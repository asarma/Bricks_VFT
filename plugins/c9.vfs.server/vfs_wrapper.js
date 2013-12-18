"use strict";

module.exports = function(vfs, options) {
    var root = options.root || "";
    var methods = options.methods || Object.keys(vfs);
    var readonly = "readonly" in options ? options.readonly : false;

    var roMethods = {
        resolve: 1,
        stat: 1,
        readfile: 1,
        readdir: 1,
        watch: 1,
        on: 1,
        off: 1
    };
    
    var noWrap = {
        connect: true,
        spawn: true,
        pty: true,
        execFile: true,
        on: true,
        off: true,
        emit: true,
        extend: true,
        unextend: true,
        use: true
    };
    
    var wrapper = methods.reduce(function(wrapper, method) {
        var vfsMethod = vfs[method];
        if (typeof vfsMethod !== "function") return wrapper;
        
        if (readonly && !roMethods[method])
            wrapper[method] = wrapReadOnly(vfsMethod);
        else if (noWrap[method] || !root)
            wrapper[method] = vfsMethod.bind(vfs);
        else
            wrapper[method] = wrapSandbox(vfsMethod);
            
        return wrapper;
    }, {});
    
    function wrapSandbox(vfsMethod) {
        return function(path, options, callback) {
            options.sandbox = root;
            vfsMethod.call(vfs, path, options, callback);
        };
    }
    
    function wrapReadOnly(vfsMethod) {
        return function(path, options, callback) {
            return callback(new Error("VFS method " + vfsMethod + " is blocked in read only mode"));
        };
    }
    
    wrapper.readonly = readonly;
    wrapper.root     = root;

    return wrapper;
};