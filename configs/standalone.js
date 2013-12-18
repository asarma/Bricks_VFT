module.exports = function(options, optimist) {
    
    var path = require("path");
    
    if (!optimist.local) {
        optimist
            .boolean("t")
            .describe("t", "Start in test mode")
            .describe("k", "Don't kill tmux server in test mode")
            .default("w", options.workspaceDir)
            .describe("w", "Workspace directory")
            .alias("p", "port")
            .default("port", process.env.PORT || options.port)
            .describe("port", "Port")
            .alias("d", "debug")
            .default("debug", false)
            .describe("debug", "Turn debugging on")
            .alias("l", "listen")
            .default("listen", process.env.IP || options.host)
            .describe("listen", "IP address of the server")
            .boolean("help")
            .describe("workspacetype")
            .alias("ws", "workspacetype")
            .describe("readonly", "Run in read only mode")
            .alias("ro", "readonly");
    }
    
    var argv = optimist.argv;
    if (argv.help)
        return null;
    
    options.port    = argv.port;
    options.host    = argv.listen;
    
    var testing     = argv.t;
    var baseProc    = path.resolve(testing
        ? __dirname + "/../plugins/c9.fs/mock"
        : argv.w || __dirname + "/../");
    var port        = argv.p;
    var host        = argv.l;
    var debug       = argv.d;
    var readonly    = argv.readonly;
    
    var workspaceType = argv.workspacetype || null;
    
    options.workspaceDir = baseProc;
    options.testing = testing;
    options.debug = debug;
        
    if (testing && argv.k)
        require("child_process").exec("tmux kill-server", function(){});
        
    return [
        {
            packagePath : "connect-architect/connect",
            port        : port,
            host        : host,
            websocket   : true
        },
        {
            packagePath : "connect-architect/connect.static",
            prefix      : "/static"
        },
        {
            packagePath: "./c9.api/error_handler",
            scope: "vfs"
        },
        "connect-architect/connect.render",
        "connect-architect/connect.render.ejs",
        "connect-architect/connect.redirect",
        "connect-architect/connect.cors",
        "./c9.connect.favicon/favicon",
        //"connect-architect/connect.logger",
        
        "./c9.core/ext",
        
        {
            packagePath: "./c9.ide.server/plugins",
            // allow everything in standalone mode
            whitelist: "*" 
        },

        "./c9.nodeapi/nodeapi",
        {
            packagePath   : "./c9.vfs.standalone/standalone",
            local         : options.local,
            options       : options,
            debug         : debug,
            workspaceDir  : baseProc,
            projectUrl    : options.projectUrl,
            homeUrl       : options.homeUrl,
            workspaceType : workspaceType,
            readonly      : readonly
        },
        "./c9.vfs.server/vfs.server",
        "./c9.preview/preview.handler",
        "./c9.vfs.server/cache",
        "./c9.vfs.server/download",
        "./c9.vfs.server/statics",
        {
            packagePath  : "./c9.vfs.server/vfs.connect.standalone",
            workspaceDir : baseProc,
            readonly     : readonly,
            vfs          : {
                defaultEnv  : { CUSTOM: 43 },
                local       : options.local,
                debug       : debug,
            }
        }
    ];
};

if (!module.parent) require("../server")([__filename].concat(process.argv.slice(2)));
