var architect = require("architect");
var fs        = require("fs");
var proc      = require("child_process");
var server    = require("../server");

module.exports = {
    writePIDFile : function(){
        function write(pid){
            fs.writeFile(process.env.HOME + "/.c9/pid", pid + "", 
                function(err){});
        }
        
        // In OSX the pid is not the nw process, but a child
        // We'll look up the parent
        if (process.platform == "darwin") {
            proc.execFile("ps", ["-axf"], function(err, stdout, stderr){
                if (err) return console.log("Could not write PID file: ", 
                    (err.message || err) );
                
                var re = new RegExp("[ \\d]*?\\s" + process.pid 
                    + "\\s+(\\d+)\\s+.*Contents\\/Frameworks\\/node\\-webkit");
                
                var m = stdout.match(re);
                if (!m) return console.log("Could not write PID file");
                
                write(m[1]);
            });
        }
        else
            write(process.pid);
    },
    
    start : function(port, path, argv, callback){
        console.log("Starting Cloud9 IDE...");
        
        // Write PID file
        this.writePIDFile();
        
        // Listen for exit signals
        // process.on("exit", function(){
        //     console.log("terminating1...");
        //     @TODO Clean up PID file
        // });
        
        // var argv = process.argv.slice(2);
        argv.push("-s", "local", "-w", 
            path || process.env.HOME || "/", "-p", port);
        
        server(argv, "local", callback);
    }
}