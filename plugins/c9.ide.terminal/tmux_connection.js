/**
 * Terminal for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {

module.exports = function(c9, proc, TMUX, shell) {
    function reconnectTimed(session, force){
        if (session.killed) // Session has been killed
            return;
        
        setTimeout(function(){
            reconnect(session, force);
        }, session.reconnecting === 0 ? 0 : 
            (session.reconnecting < 10 ? 100 : 1000));
    }
    
    function reconnect(session, force){
        // Make sure we have process control
        if (!c9.has(c9.PROCESS))
            // We'll let the stateChange handler retry
            return;
        
        if ((session.connecting || session.connected) && !force) {
            console.error("Reconnecting while already connected/connecting. Abort.");
            return false;
        }
        
        // A little counter for debugging purpose
        if (!session.reconnecting)
            session.reconnecting = 0;
        session.reconnecting++;
        
        // Make sure the pty is no longer active
        session.disregard && session.disregard(true);
        
        // Lets get our TMUX process
        getTMUX(session, function(err){
            if (err)
                reconnectTimed(session, true);
        });
    }
    
    function getTMUX(session, callback){
        var disregard, args;
        
        // Output Mode
        if (session.output) {
            if (session.create) {
                args = [
                    "new", "-s", session.id, "echo '\n[Idle]'\n",
                    ";", "set-option", "-g", "status", "off",
                    ";", "set-option", "destroy-unattached", "off",
                    //";", "set-option", "mouse-resize-pane", "on",
                    ";", "set-option", "mouse-select-pane", "on",
                    //";", "set-option", "mouse-select-window", "on",
                    //";", "set-option", "mouse-utf8", "on",
                    ";", "set-option", "set-titles", "on",
                    ";", "set-option", "remain-on-exit", "on",
                    ";", "set-option", "-g", "terminal-overrides", "'xterm:colors=256'"
                ];
            }
            else {
                args = ["attach", "-t", session.id];
            }
        }
        // Terminal Mode
        else {
            var create = session.id ? false : true;
            
            if (create)
                session.id = c9.workspaceId.split("/", 2).join("@") 
                    + "." + Math.round(Math.random() * 1000);
    
            if (create) {
                args = [
                    "new", "-s", session.id,
                    ";", "set-option", "-g", "status", "off",
                    ";", "set-option", "destroy-unattached", "off",
                    //";", "set-option", "mouse-resize-pane", "on",
                    ";", "set-option", "mouse-select-pane", "on",
                    //";", "set-option", "mouse-select-window", "on",
                    //";", "set-option", "mouse-utf8", "on",
                    ";", "set-option", "set-titles", "on"
                ];
                if (shell)
                    args.push(";", "set-option", "default-shell", shell);
            }
            else {
                args = ["attach", "-t", session.id];
            }
        }
        
        // Connect to backend and start tmux session
        session.connecting     = true;
        session.connected      = false;
        session.setState("connecting");
        
        // @todo make sure ~/.env exists on OS systems
        proc.pty(TMUX, {
            args : args,
            cwd  : session.cwd || "~",
            cols : session.cols || 80,
            rows : session.rows || 24,
            name: "xterm-color",
        }, function(err, pty){
            // Document was unloaded before connection was made
            if (!session.connecting) {
                if (!err) {
                    session.pty = pty;
                    session.kill();
                }
                return callback(new Error("Session was not connecting"));
            }
            
            // Handle a possible error
            if (err) {
                session.setState("error");
                return callback(err);
            }
            
            // A session with this name might already exist
            // Or no sessions might exist, while joining an existing one
            // This would come in the first data packet
            pty.on("data", function dplcheck(data){
                if (typeof data == "object")
                    return;
                if (data.match(/duplicate session|no sessions|session not found/)) {
                    session.disregard();
                    
                    if (session.output)
                        session.create = !session.create;
                    
                    console.warn("RECONNECTING:", data)
                    reconnectTimed(session, true);
                }
                else {
                    start();
                }
                
                pty.removeListener("data", dplcheck);
            });
            
            session.pty            = pty;
            session.reconnecting   = 0;
            
            session.disregard = function(keepId){
                if (!keepId && !session.output)
                    delete session.id;
                disregard = true;
                pty.kill();
                delete session.pty;
            };
            
            session.pty.on("exit", function(){
                if (!disregard) {
                    session.connected  = false;
                    session.connecting = false;
                    reconnect(session);
                }
            });
            
            session.pty.on("data", function(data){
                if (!disregard) {
                    if (typeof data == "object")
                        return session.setSize(data);
                        
                    if (session.filter)
                        data = session.filter(data);
                    if (data)
                        session.write(data);
                }
            });
            
            // Success
            function start(){
                session.connecting     = false;
                session.connected      = true;
                session.setState("connected");
                
                // Resize the terminal to the size of the container
                session.updatePtySize();
                
                callback();
                session.getEmitter()("connected");
            }
        });
    }
    
    return {
        init: function(session, cb) {
            getTMUX(session, function(err){
                if (err) {
                    // util.alert(
                    //     "Error opening Terminal",
                    //     "Error opening Terminal",
                    //     "Could not open terminal with the following reason:"
                    //         + err);
                    console.error("Error opening Terminal: " + err.message);
                    
                    session.setState("error");
                    
                    if (err.code != "EACCESS")
                        reconnectTimed(session, true);
                }
                else {
                    // Lets wait until we get process control back
                    c9.on("stateChange", function wait(e){
                        if (e.state & c9.PROCESS) { // && !(e.last & c9.PROCESS)) {
                            reconnect(session);
                            c9.off("state.change", wait);
                        }
                    }, session);
                }
                
                cb && cb(err, session);
            });
        },
        kill: function(session){
            if (session.id) {
                proc.execFile(TMUX, {
                    args : ["kill-session", "-t", session.id]
                }, function(err){
                    // Ignore errors for now
                    if (err)
                        return console.error(err);
                });
            }
            
            console.warn("Killed tmux session: ", session.id);
            
            // If we're still connecting disregard will not be set yet
            // The callback of the connection process will check 
            // the connecting property and terminate the connection
            // then.
            if (session && session.disregard)
                session.disregard();
            
            delete session.id;
            //doc.terminal.onResize(); ??
            
            session.killed     = true;
            session.connecting = false;
            session.connected  = false;
            session.setState("killed");
        }
    };
};
    
});