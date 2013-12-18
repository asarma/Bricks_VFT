"use strict";

module.exports = function(methods, vfsHome, vfsWorkspace) {
    var proxy    = {};
    var homeDir  = vfsHome.root;
    
    var absoluteWrap = {
        spawn: true,
        pty: true,
        execFile: true
    };
        
    var noWrap = {
        connect: true,
        on: true,
        off: true,
        emit: true,
        extend: true,
        unextend: true,
        use: true
    };
    
    methods.forEach(function(name) {
        var vfsMethod = vfsWorkspace[name];
        if (typeof vfsMethod !== "function") 
            return;
        
        proxy[name] = wrap(name, noWrap[name]);
    });
    
    function wrap(name, excluded) {
        if (excluded) {
            return function(){
                vfsWorkspace[name].apply(vfsWorkspace, arguments);
            };
        }
        
        return function(path) {
            if (path.charAt(0) == "~") {
                var args = Array.prototype.slice.call(arguments);
                if (absoluteWrap[name])
                    args[0] = path.replace("~", homeDir);
                else 
                    args[0] = path.replace("~", "");
                    
                vfsHome[name].apply(vfsHome, args);
            }
            else if (path.indexOf(homeDir) === 0) {
                vfsHome[name].apply(vfsHome, arguments);
            }
            else
                vfsWorkspace[name].apply(vfsWorkspace, arguments);
        };
    }
    
    proxy.readonly = vfsWorkspace.readonly;
    proxy.root     = vfsWorkspace.root;

    return proxy;
};