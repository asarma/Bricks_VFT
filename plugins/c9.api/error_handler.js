"use strict";

plugin.consumes = [
    "connect"
];
plugin.provides = [
    "connect.error"
];

module.exports = plugin;

function plugin(options, imports, register) {
    var connect = imports.connect;
    var error = require("http-error");
    
    var scope = options.scope;

    connect.useError(function(err, req, res, next) {
        var code = 500;
        var msg = err + "";
        
        if (err instanceof error.HttpError) {
            code = err.code;
            msg = err.message;
        }
        
        res.writeHead(code, { "Content-Type": "application/json" });
        msg = {
            code: code,
            msg: msg
        };
        if (err.defaultMsg)
            msg.defaultMsg = err.defaultMsg;
            
        if (scope)
            msg.scope = scope;
        
        res.end(JSON.stringify(msg));
    });
    
    register(null, {
        "connect.error": {}
    });
}