/**
 * Provides core functionality to Cloud9. This module sets up the plugin
 * system, event system and settings.
 *
 * @module c9.core
 * @main c9.core
 */
define(function(require, module, exports) {
    main.consumes = ["Plugin", "ext", "http", "vfs"];
    main.provides = ["c9"];
    return main;

    function main(options, imports, register) {
        var Plugin  = imports.Plugin;
        var http    = imports.http;
        var vfs     = imports.vfs;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit = plugin.getEmitter();
        emit.setMaxListeners(500);
        
        imports.ext.vfs  = imports.vfs;
        imports.http.vfs = imports.vfs;

        var loaded     = false;
        var loggedIn   = false;
        var state      = 0;
        
        var STORAGE    = 1 << 1;
        var NETWORK    = 1 << 2;
        var PROCESS    = 1 << 3;
        var LOCAL      = 1 << 4;
        
        // Copy configuration settings - To Be Deprecated!
        var skipProps  = { "consumes": 1, "provides": 1, "install": 1 };
        for (var prop in options) {
            if (!skipProps[prop])
                plugin[prop] = options[prop];
        }
        
        function load() {
            if (loaded) return false;
            loaded = true;
            
            loggedIn = parseInt(plugin.uid, 10) > 0;
            
            if (vfs.connection)
                setStatus(state | STORAGE | PROCESS);
            if (vfs.connected)
                setStatus(state | NETWORK);
            if (plugin.local)
                setStatus(state | LOCAL);
    
            vfs.on("connecting", function() {
                emit("connecting");
            }, plugin);
            
            vfs.on("disconnect", function(reason) {
                setStatus(status & ~STORAGE & ~PROCESS & ~NETWORK);
                emit("disconnect");
            }, plugin);
        
            vfs.on("connect", function() {
                setStatus(state | NETWORK | STORAGE | PROCESS);
                emit("connect");
            }, plugin);
            
            vfs.on("error", function(message) {
                setStatus(status & ~STORAGE & ~PROCESS);
                // TODO: Don't display all errors?
                if (emit("showerrormessage", message) !== false) {
                    console.error(
                        "Error on server",
                        "Received following error from server:",
                        JSON.stringify(message.message)
                    );
                }
            }, plugin);
            
            vfs.on("message", function(message) {
                emit("message", message);
            }, plugin);
        
            vfs.on("away", function() {
                emit("away");
            }, plugin);
            
            vfs.on("back", function() {
                emit("back");
            }, plugin);
        
            // Error Handler
    
            if (
                location.protocol !== "file:"
                && location.href.indexOf("dev") === -1
                && (location.href.indexOf("c9.io") > -1))
            {
                var oldOnError = window.onerror;
                window.onerror = function(m, u, l) {
                    var errorInfo = {
                        agent       : navigator.userAgent,
                        type        : "General Javascript Error",
                        e           : [m, u, l],
                        workspaceId : plugin.workspaceId
                    };
                    
                    emit("error", errorInfo);
                    
                    http.request("/api/debug", {
                        method      : "POST",
                        contentType : "application/json",
                        body        : errorInfo
                    }, function(err) {
                        if (err) console.error(err);
                    });
                    if (oldOnError)
                        oldOnError.apply(this, arguments);
                };
    
                //Catch all APF Routed errors
//                ui.addEventListener("error", function(e){
//                    var errorInfo = {
//                        agent       : navigator.userAgent,
//                        type        : "APF Error",
//                        message     : e.message,
//                        tgt         : e.currentTarget && e.currentTarget.serialize(),
//                        url         : e.url,
//                        state       : e.state,
//                        e           : e.error,
//                        workspaceId : plugin.workspaceId
//                    };
//                    
//                    emit("error", errorInfo);
//                    
//                    http.request("/api/debug", {
//                        method      : "POST",
//                        contentType : "application/json",
//                        body        : errorInfo
//                    }, function(err) {
//                        if (err) console.error(err);
//                    });
//                });
            }
        }
        
        /***** Methods *****/

        function setStatus(s){
            state = s;
            emit("stateChange", {state: s, last: state});
        }
        
        function has(check){
            return (state & check) ? true : false;
        }

        function ready(){
            emit("ready", null, true);
        }

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
         * Main c9 object for Cloud9 IDE which holds error handlers
         * of the entire application as well as the state for availability of resources
         * @singleton
         **/
        plugin.freezePublicAPI({
             /**
              * use this constant to see if storage capabilities are currently 
              * available. This is relevant for {@link fs}.
              * 
              *   c9.has(c9.STORAGE); // Will return true if storage is available
              * 
              * @property {Number} STORAGE 
              * @readonly
              */
            STORAGE : STORAGE,
             /**
              * use this constant to see if network capabilities are currently 
              * available. This is relevant for {@link net#connect}.
              * 
              *   c9.has(c9.NETWORK); // Will return true if storage is available
              * 
              * @property {Number} NETWORK
              * @readonly
              */
            NETWORK : NETWORK,
             /**
              * use this constant to see if process control capabilities are 
              * currently available. This is relevant for {@link proc#spawn}, 
              * {@link proc#execFile} and {@link proc#pty}.
              * 
              *   c9.has(c9.PROCESS); // Will return true if storage is available
              * 
              * @property {Number} PROCESS
              * @readonly
              */
            PROCESS : PROCESS,
             /**
              * use this constant to see if Cloud9 is running locally and the 
              * local runtime is available.
              * 
              *   c9.has(c9.LOCAL); // Will return true if storage is available
              * 
              * @property {Number} LOCAL
              * @readonly
              */
            LOCAL   : LOCAL,
            
            /**
             * @property {String}  workspaceDir
             * @readonly
             */
            /**
             * @property {Boolean} debug        
             * @readonly
             */
            /**
             * @property {Number}  sessionId    
             * @readonly
             */
            /**
             * @property {String}  workspaceId  
             * @readonly
             */
            /**
             * @property {Boolean} readonly     
             * @readonly
             */
            /**
             * @property {String}  projectName  
             * @readonly
             */
            /**
             * @property {String}  version      
             * @readonly
             */
            /**
             * @property {Boolean} hosted       
             * @readonly
             */
            /**
             * @property {Boolean} local        
             * @readonly
             */
            
            /**
             * Specifies whether the user is logged in to Cloud9.
             * @property {Boolean} loggedIn 
             * @readonly
             */
            get loggedIn(){ return loggedIn; },
            /**
             * the connection object that manages the connection between Cloud9
             * and the workspace server. Cloud9 uses Engine.IO to manage this
             * connection.
             * @property {Object} connection 
             * @readonly
             */
            get connection(){ return vfs.connection; },
            /**
             * Specifies whether Cloud9 is connceted to the workspace server
             * @property {Boolean} connected
             * @readonly
             */
            get connected(){ return vfs.connected; },
            /**
             * a bitmask of the constants {@link c9#NETWORK}, {@link c9#STORAGE},
             * {@link c9#PROCESS}, {@link c9#LOCAL}. Use this for complex 
             * queries. 
             * See also: {@link c9#has}
             * 
             * @property {Number} status
             * @readonly
             */
            get status(){ return state; },
            /**
             * the URL from which Cloud9 is loaded.
             * @property {String} location
             * @readonly
             */
            get location(){ return location && location.href || ""; },
            
            _events : [
                /**
                 * Fires when a javascript exception occurs.
                 * @event error 
                 * @param {Object} e
                 * @param {String} e.oldpath
                 */
                "error",
                /**
                 * Fires when Cloud9 starts connecting to the workspace server.
                 * @event connecting
                 */
                "connecting",
                /**
                 * Fires when Cloud9 is connected to the workspace server.
                 * @event connect
                 */
                "connect",
                /**
                 * Fires when Cloud9 is permanently disconnected from the 
                 * workspace server.
                 * 
                 * @event disconnect
                 */
                "disconnect",
                /**
                 * Fires when Cloud9 receives a message from the workspace server.
                 * @event message
                 * @param {String} message the message that is received
                 */
                "message",
                /**
                 * Fires when Cloud9 is disconnected from the workspace server.
                 * Cloud9 will try to re-establish the connection with the server
                 * for a few minutes. When that doesn't happen the disconnect 
                 * event is fired.
                 * @event away
                 */
                "away",
                /**
                 * Fires when Cloud9 is reconnected to a pre-existing session 
                 * from which it was temporarily disconnected.
                 * @event back
                 */
                "back",
                /**
                 * Fires when there is a connection error
                 * @event showerrormessage
                 * @param {String} message the error message to display
                 */
                "showerrormessage",
                /**
                 * Fires when all plugins have loaded
                 * @event ready
                 */
                "ready"
            ],
            
            /**
             * Send a message to the statefull server
             * @param {Object} msg the JSON to send to the client
             */
            send : vfs.send,
            
            /**
             * Sets the availability of resources. Use bitwise operations to
             * set availability of different resources. The default 
             * resources are {@link c9#NETWORK}, {@link c9#STORAGE}, 
             * {@link c9#PROCESS}, {@link c9#LOCAL}
             * @param {Number} status a bitwised & of {@link c9#NETWORK}, 
             *   {@link c9#STORAGE}, {@link c9#PROCESS}, {@link c9#LOCAL}
             */
            setStatus : setStatus,
            
            /**
             * Checks the availability of resources. Use the following constants 
             * {@link c9#NETWORK}, {@link c9#STORAGE}, {@link c9#PROCESS}, 
             * {@link c9#LOCAL}
             * @param {Number} test one of {@link c9#NETWORK}, {@link c9#STORAGE}, 
             *   {@link c9#PROCESS}, {@link c9#LOCAL}
             */
            has : has,

            /**
             * This method is called by the boot loader, it triggers the ready 
             * event.
             * 
             * @private
             */
            ready : ready
        });
        
        register(null, {
            c9: plugin
        });
    }
});
