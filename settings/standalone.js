module.exports = function(manifest) {
    if (!manifest) {
        manifest = require(__dirname + "/../package.json");
        manifest.revision = 
            manifest.revision ||
            require("c9/git").getHeadRevisionSync(__dirname + "/..");
    }
    
    var path = require("path");
    var runners = require("../plugins/c9.ide.run/runners_list");
    var builders = require("../plugins/c9.ide.run.build/builders_list");
    
    return {
        manifest: manifest,
        workspaceDir: path.resolve(__dirname + "/../"),
        workspaceId: "devel",
        workspaceName: "devel",
        tmpdir: "/tmp",
        home: process.env.HOME,
        uid: "1",
        pid: process.pid,
        port: process.env.PORT || 8181,
        host: process.env.IP || "0.0.0.0",
        testing: false,
        platform: process.platform,
        tmux: path.join(process.env.HOME, ".c9/bin/tmux"),
        nakBin: path.join(__dirname, "../node_modules") + (process.platform == "win32" ? "/.bin/nak.cmd" : "/nak/bin/nak"),
        staticPrefix: "/static",
        projectUrl: "/workspace",
        ideBaseUrl: "http://c9.io",
        previewUrl: "/preview",
        dashboardUrl: "#",
        homeUrl: "/home",
        installed: true,
        runners: runners,
        builders: builders,
        logicblox: {
            bloxWebURL: process.env.LB_SERVER || "http://lbdemo.c9.io:8088",
            username: "user1",
            password: "password",
            fileServerURL: process.env.LB_FILE_SERVER || process.env.LB_SERVER || "http://lbdemo.c9.io:8081",
            application: "logicblox-ide",
            devel: true
        },
        feedback: {
            userSnapApiKey: "a83fc136-1bc4-4ab8-8158-e750c30873b5"
        },
        user: {
            uid: 1,
            name: "username",
            fullname: "fullname",
            email: "",
            pubkey: null
        },
        project: {
            pid: 1,
            name: "projectname",
            contents: null,
            descr: "descr"
        }
    };
};
