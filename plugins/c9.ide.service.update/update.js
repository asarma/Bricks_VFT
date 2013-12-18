define(function(require, exports, module) {
    main.consumes = ["Plugin", "static", "connect"];
    main.provides = ["update-service"];
    return main;

    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var connect  = imports.connect;
        
        var url  = require("url");
        var fs   = require("fs");
        var PATH = require("path");
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit   = plugin.getEmitter();
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            connect.useStart(function(req, res, next) {
                var path = url.parse(req.url).pathname;
                if (path == "/update") {
                    res.writeHead(200, {
                        "Content-Type": "text/javascript", 
                        "Access-Control-Allow-Origin": "*"
                    });
                    path = PATH.resolve(__dirname 
                        + "/../../build/output/latest.tar.gz");
                    fs.readlink(path, function(err, target){
                        res.end((target || "").split(".")[0]);
                    });
                }
                else if (path.substr(0, 8) == "/update/") {
                    var filename = path.substr(8);
                    path = PATH.resolve(__dirname + "/../../build/output/" + filename);
                    
                    res.writeHead(200, {"Content-Type": "application/octet-stream"});
                    var stream = fs.createReadStream(path);
                    stream.pipe(res);
                }
                else {
                    next();
                }
            });
        }
        
        /***** Methods *****/
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("enable", function(){
            
        });
        plugin.on("disable", function(){
            
        });
        plugin.on("unload", function(){
            loaded = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * The Update Service responsible for providing a REST api to update Cloud9
         **/
        plugin.freezePublicAPI({
            
        });
        
        register(null, {
            "update-service": plugin
        });
    }
});