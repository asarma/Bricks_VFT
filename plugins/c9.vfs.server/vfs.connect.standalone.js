/**
 * Keeps a Cache of VFS instances
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function(require, exports, module) {
    main.consumes = ["Plugin"];
    main.provides = ["vfs.connect"];
    return main;


    function main(options, imports, register) {
        var Plugin  = imports.Plugin;
    
        var Vfs     = require("./vfs");
        var Parent  = require('vfs-child').Parent;

        /***** Initialization *****/
        
        var plugin  = new Plugin("Ajax.org", main.consumes);
        
        /***** Methods *****/
        
        function connect(user, pid, callback) {
            
            var vfsOptions = {
                root        : "/",
                metapath    : "/.c9/metadata",
                wsmetapath  : "/.c9/metadata/workspace",
                local       : false,
                readOnly    : false,
                debug       : options.debug,
                homeDir     : process.env.HOME,
                projectDir  : options.workspaceDir
            };
            for (var key in options.vfs)
                vfsOptions[key] = options.vfs[key];
                
            var master = new Parent(vfsOptions);
            master.connect(function(err, vfs) {
                if (err) return callback(err);
                
                callback(null, new Vfs(vfs, master, {
                    debug: options.debug || false,
                    homeDir: vfsOptions.homeDir,
                    projectDir: vfsOptions.projectDir,
                    public: true
                }));
            });
            
            return function cancel() {};
        }
        
        /***** Register and define API *****/
        
        plugin.freezePublicAPI({
            connect: connect
        });
        
        register(null, {
            "vfs.connect": plugin
        });
    }
});