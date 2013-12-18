define(function(require, exports, module) {
    main.consumes = [
        "Editor", "editors", "commands", "menus", "layout", "fs", "util",
        "settings", "ui", "proc", "c9", "preferences", "tabManager"
    ];
    main.provides = ["terminal"];
    return main;

    function main(options, imports, register) {
        var c9       = imports.c9;
        var Editor   = imports.Editor;
        var editors  = imports.editors;
        var layout   = imports.layout;
        var proc     = imports.proc;
        var util     = imports.util;
        var ui       = imports.ui;
        var fs       = imports.fs;
        var commands = imports.commands;
        var prefs    = imports.preferences;
        var menus    = imports.menus;
        var tabs     = imports.tabManager;
        var settings = imports.settings;
        
        // var Monitor        = require("./monitor.js");
        var markup         = require("text!./terminal.xml");
        var markupMenu     = require("text!./menu.xml");
        var cssString      = require("text!./style.css");
        var Aceterm        = require("./aceterm/aceterm");
        var libterm        = require("./aceterm/libterm");
        
        var installScript  = require("text!./install-tmux.sh");
        
        // Needed to clear ace
        var EditSession  = require("ace/edit_session").EditSession;
        var dummySession = new EditSession("");
        
        var extensions = [];
        
        // Set up the generic handle
        var handle = editors.register("terminal", "Terminal", 
                                       Terminal, extensions);
        var handleEmit = handle.getEmitter();
        handleEmit.setMaxListeners(1000);

        var TMUX    = options.tmux || "~/.c9/bin/tmux";
        var VFSROOT = options.root || "~";
        var TMPDIR  = options.tmpdir;
        
        var tmuxConnection = require("./tmux_connection")(c9, proc, TMUX, options.shell);
        var mnuTerminal;
        
        var defaults = {
            "white" : ["#F8F8F8", "#333333", "#89c1ff", false], 
            "dark"  : ["#153649", "#FFFFFF", "#515D77", true]
        };

        // Import the CSS
        ui.insertCss(cssString, handle);
        
        handle.on("install", function(e){
            // Detect tmux
            proc.execFile("~/.c9/bin/tmux", {
                args: ["--help"]
            }, function(err, stdout) {
                if (err && err.message.indexOf("usage:") > -1)
                    return e.next();
                
                // Check for an already installed tmux
                proc.execFile("bash", {
                    args: ["-c", "type tmux"] 
                }, function(err, stdout) {
                    if (!err) {
                        var loc = stdout.split("is ")[1].trim();
                        fs.unlink("~/.c9/bin/tmux", function(){
                            proc.execFile("ln", {
                                args: ["-s", loc, c9.home + "/.c9/bin/tmux"]
                            }, function(err){
                                e.next(err);
                            });
                        });
                        return;
                    }
                
                    fs.writeFile("/.install-tmux.sh", installScript, function(err){
                        if (err) return e.next(err);
                        
                        // Install tmux
                        e.progress("Installing tmux");
                        
                        proc.execFile("mv", {
                            args : [VFSROOT + "/.install-tmux.sh", 
                                    TMPDIR + "/install-tmux.sh"]
                        }, function(err, stdout, stderr){
                            if (err || stderr) return e.next(err || stderr);
                            
                            proc.spawn("bash", {
                                args : [TMPDIR + "/install-tmux.sh"],
                                cwd  : TMPDIR
                            }, function(err, process){
                                if (err) return e.next(err);
                                
                                var buffer = "";
                                process.stderr.on("data", function(chunk){
                                    buffer += chunk;
                                });
                                
                                process.stdout.on("data", function(chunk){
                                    e.progress(chunk, true);
                                });
                                
                                process.stdout.on("end", function(){
                                    fs.exists("~/.c9/bin/tmux", function(exists){
                                        if (!exists)
                                            return e.next(new Error(
                                                "Could not install tmux: " + buffer));
                                        e.next();
                                    })
                                });
                            })
                        });
                    });
                });
            });
            
            return false;
        });
        
        handle.on("load", function(){
            commands.addCommand({
                name    : "openterminal",
                group   : "Terminal",
                hint    : "Opens a new terminal window",
                msg     : "opening terminal.",
                bindKey : { mac: "Option-T", win: "Alt-T" },
                exec    : function (editor) {
                    var pane = tabs.focussedTab && tabs.focussedTab.pane;
                    if (tabs.getTabs(tabs.container).length === 0)
                        pane = null;
                    
                    tabs.open({
                        editorType : "terminal", 
                        active     : true,
                        pane       : pane
                    }, function(){});
                }
            }, handle);
            
            commands.addCommand({
                name    : "clearterm",
                group   : "Terminal",
                hint    : "Clears the terminal buffer",
                isAvailable : function(editor){
                    return editor && editor.type == "terminal";
                },
                exec    : function (editor) {
                    tabs.focussedTab.editor.clear();
                }
            }, handle);
            
            var meta = '\x1b';
            [
                ["close_term_pane", "x", "x"],
                ["split_term_pane", '"', '"'],
                ["layout_term_hor_even", "Meta-1", meta + "1"],
                ["layout_term_ver_even", "Meta-2", meta + "2"],
                ["layout_term_hor_main", "Meta-3", meta + "3"],
                ["layout_term_ver_main", "Meta-4", meta + "4"],
                ["move_term_paneup", "Up", '\x1b[A'],
                ["move_term_panedown", "Down", '\x1b[B'],
                ["move_term_paneright", "Right", '\x1b[C'],
                ["move_term_paneleft", "Left", '\x1b[D'],
                ["term_help", "?", '?'],
                ["toggle_term_status", "", ":set-option status on\r"]
            ].forEach(function(iter){
                commands.addCommand({
                    name    : iter[0],
                    group   : "Terminal",
                    bindKey : {
                        mac: "", //Ctrl-B " + iter[1].replace(/Meta/, "Command"), 
                        win: "" //Ctrl-B " + iter[1]
                    },
                    isAvailable : function(editor, e){
                        return editor.type == "terminal" && e.source == "click";
                    },
                    exec    : function (editor) {
                        if (iter[0] == "toggle_term_status") {
                            var session = editor.activeDocument.getSession();
                            session.status = !(session.status || 0);
                            editor.write(String.fromCharCode(2) 
                                + iter[2].replace(/on\r/, 
                                    session.status ? "on\r" : "off\r"));
                        }
                        else {
                            editor.write(String.fromCharCode(2) + iter[2]);
                        }
                    }
                }, handle);
            });
            
            var menu    = tabs.getElement("mnuEditors");
            var ctxItem = menus.addItemToMenu(menu, 
                new ui.item({
                    caption : "New Terminal",
                    hotkey  : "{commands.commandManager.openterminal}",
                    onclick : function(e){
                        tabs.open({
                            active     : true,
                            pane        : this.parentNode.pane,
                            editorType : "terminal"
                        }, function(){});
                    }
                }), 200, handle);

            menus.addItemByPath("Window/New Terminal", new ui.item({
                command : "openterminal"
            }), 30, handle);
            
            function setSettings(){
                libterm.cursorBlink = settings.getBool("user/terminal/@blinking");
                libterm.scrollback = 
                    settings.getNumber("user/terminal/@scrollback") || 1000;
                
                var cname  = ".c9terminal .c9terminalcontainer .terminal";
                var sname  = ".c9terminal .c9terminalcontainer";
                var fsize  = settings.getNumber("user/terminal/@fontsize");
                var fstyle = settings.getBool("user/terminal/@antialiasedfonts");
                var fcolor = settings.get("user/terminal/@foregroundColor");
                var bcolor = settings.get("user/terminal/@backgroundColor");
                var scolor = settings.get("user/terminal/@selectionColor");
                [
                    [cname, "fontFamily", settings.get("user/terminal/@fontfamily")
                        || "Ubuntu Mono, Menlo, Consolas, monospace"],
                    [cname, "fontSize", fsize ? fsize + "px" : "10px"],
                    [cname, "WebkitFontSmoothing", fstyle ? "antialiased" : "auto"],
                    [cname, "MozOSXFontSmoothing", fstyle ? "grayscale" : "auto"],
                    [cname, "color", fcolor || "rgb(255,255,255)"],
                    [sname, "backgroundColor", bcolor || "rgb(25, 34, 39)"],
                    [cname + " .ace_selection", "backgroundColor", scolor || "rgb(81, 93, 119)"]
                ].forEach(function(i){
                    ui.setStyleRule(i[0], i[1], i[2]);
                });
                
                libterm.setColors(fcolor, bcolor);
                
                handleEmit("settingsUpdate");
            }
            
            // Terminal
            
            settings.on("read", function(e) {
                var skin = settings.get("user/general/@skin") || "dark";
                
                settings.setDefaults("user/terminal", [
                    ["backgroundColor", defaults[skin][0]],
                    ["foregroundColor", defaults[skin][1]],
                    ["selectionColor", defaults[skin][2]],
                    ["antialiasedfonts", defaults[skin][3]],
                    ["fontfamily", "Ubuntu Mono, Menlo, Consolas, monospace"], //Monaco, 
                    ["fontsize", "12"],
                    ["blinking", "false"],
                    ["scrollback", "1000"]
                ]);
                
                setSettings();
            }, handle);

            settings.on("user/terminal", setSettings);
    
            // Settings UI
            
            prefs.add({
                "Editors" : {
                    "Terminal" : {
                        position : 100,
                        "Text Color" : {
                           type     : "colorbox",
                           path     : "user/terminal/@foregroundColor",
                           position : 10100
                        },
                        "Background Color" : {
                           type     : "colorbox",
                           path     : "user/terminal/@backgroundColor",
                           position : 10200
                        },
                        "Selection Color" : {
                           type     : "colorbox",
                           path     : "user/terminal/@selectionColor",
                           position : 10250
                        },
                        "Font Family" : {
                           type     : "textbox",
                           path     : "user/terminal/@fontfamily",
                           position : 10300
                        },
                        "Font Size" : {
                           type     : "spinner",
                           path     : "user/terminal/@fontsize",
                           min      : "1",
                           max      : "72",
                           position : 11000
                        },
                        "Antialiased Fonts" : {
                           type     : "checkbox",
                           path     : "user/terminal/@antialiasedfonts",
                           position : 12000
                        },
                        "Blinking Cursor" : {
                           type     : "checkbox",
                           path     : "user/terminal/@blinking",
                           position : 12000
                        },
                        "Scrollback" : {
                           type     : "spinner",
                           path     : "user/terminal/@scrollback",
                           min      : "1",
                           max      : "100000",
                           position : 13000
                        }
                    }
                }
            }, handle);
            
            // Offline
            c9.on("stateChange", function(e){
                // Online
                if (e.state & c9.NETWORK) {
                    ctxItem && ctxItem.enable();
                    ui.setStyleRule(".terminal .ace_content", "opacity", "");
                }
                // Offline
                else {
                    ctxItem && ctxItem.disable();
                    ui.setStyleRule(".terminal .ace_content", "opacity", "0.5");
                }
            });
        });
        
        handle.draw = function(){
            ui.insertMarkup(null, markupMenu, handle);
            mnuTerminal = handle.getElement("mnuTerminal");
            
            handle.draw = function(){};
        };
        
        handle.Terminal = Terminal;
        
        var counter  = 0;
        
        /***** Initialization *****/
        
        function Terminal(isOutputTerminal){
            var deps   = main.consumes.splice(0, main.consumes.length - 1);
            var plugin = new Editor("Ajax.org", deps, extensions);
            var emit   = plugin.getEmitter();
            
            var container, barTerminal, currentSession, currentDocument, aceterm;
            
            plugin.on("draw", function(e){
                // Create UI elements
                ui.insertMarkup(e.tab, markup, plugin);
                barTerminal = plugin.getElement("barTerminal");
                
                // Draw menu
                handle.draw();
                
                // Set context menu
                barTerminal.setAttribute("contextmenu", mnuTerminal);
                
                // Fetch Reference to the HTML Element
                container = barTerminal.firstChild.$ext;
                
                // todo do we need barTerminal or e.htmlNode
                aceterm = Aceterm.createEditor(null, "ace/theme/idle_fingers");
                aceterm.container.style.position = "absolute";
                aceterm.container.style.left    = "0px";
                aceterm.container.style.right   = "0px";
                aceterm.container.style.top     = "0px";
                aceterm.container.style.bottom  = "0px";
                // e.htmlNode
                container.appendChild(aceterm.container);
                
                aceterm.on("focus", function() {
                    barTerminal.setAttribute("class", "c9terminal c9terminalFocus");
                });
                aceterm.on("blur", function() {
                    barTerminal.setAttribute("class", "c9terminal");
                });
                
                handle.on("settingsUpdate", function(){
                    aceterm.renderer.updateFull();
                }, plugin);
                
                var cm = commands;
                // TODO find better way for terminal and ace commands to coexist
                aceterm.commands.addCommands([{
                        bindKey: {win: "F12", mac: "F12|Cmd-`|Cmd-R"},
                        name:"passKeysToBrowser",
                        passEvent: true,
                        exec:function(){}
                    },
                    cm.commands.find,
                    cm.commands.openterminal,
                    cm.commands.navigate,
                    cm.commands.searchinfiles,
                    cm.commands.searchinfiles,
                    cm.commands.close_term_pane,
                    cm.commands.closeallbutme,
                    cm.commands.closealltabs,
                    cm.commands.closealltotheleft,
                    cm.commands.closealltotheright,
                    cm.commands.closepane,
                    cm.commands.closetab,
                    cm.commands.gototabright,
                    cm.commands.gototableft,
                    cm.commands.movetabright,
                    cm.commands.movetableft,
                    cm.commands.movetabup,
                    cm.commands.movetabdown,
                    cm.commands.nexttab,
                    cm.commands.previoustab,
                    cm.commands.nextpane,
                    cm.commands.previouspane,
                    cm.commands.hidesearchreplace || {},
                    cm.commands.hidesearchinfiles || {},
                    cm.commands.toggleconsole || {}
                ]);
                
                aceterm.commands.exec = function(command) {
                    return cm.exec(command);
                };
                
                plugin.on("unload", function(){
                    aceterm.destroy();
                    container.innerHTML = "";
                    
                    aceterm   = null;
                    container = null;
                });
            });
            
            /***** Methods *****/
            
            function write(data){
                if (currentSession) {
                    if (currentSession.connected)
                        currentSession.pty.write(data);
                    else {
                        var session = currentSession;
                        plugin.on("connect", function wait(e){
                            if (e.tab == session.tab) {
                                currentSession.pty.write(data);
                                plugin.off("connect", wait);
                            }
                        });
                    }
                }
            }
            
            function focus(){
                if (aceterm)
                    aceterm.focus();
            }
            
            function blur(){
                // var cursor = barTerminal.$ext.querySelector(".terminal .reverse-video");
                // if (cursor && settings.getBool("user/terminal/blinking"))
                //     cursor.parentNode.removeChild(cursor);
                barTerminal.setAttribute("class", "c9terminal");
                if (aceterm)
                    aceterm.blur();
            }
            
            function resize(e){
                var renderer = aceterm && aceterm.renderer;
                if (!renderer) return;
                
                if (e.type == "anim") {
                    var htmlNode = aceterm.container;
                    if (!htmlNode)
                        return;
                    
                    if (e.vertical) {
                        var size = e.current === 0
                          ? Math.abs(e.delta) - 5
                            - currentDocument.tab.pane.aml.$buttons.offsetHeight
                          : htmlNode.offsetHeight + e.delta;
                        
                        renderer.onResize(false, null, null, size);
                    }
                    else {
                        renderer.onResize(false, null, 
                            htmlNode.offsetWidth + e.delta);
                    }
                }
                else {
                    renderer.onResize();
                }
            }
            
            function createTerminal(session, state) {
                function send(data) {
                    if (!(c9.status & c9.NETWORK))
                        return;
                    
                    if (!session.connected) {
                        layout.showError("Dropping input " + JSON.stringify(data));
                        return;
                    }
                    
                    // Send data to stdin of tmux process
                    session.pty.write(data);
                }
                
                // Create the terminal renderer and monitor
                var terminal = new Aceterm(0, 0, send);
                session.terminal = terminal;
                // session.monitor = new Monitor(session.terminal, c9.workspaceId);
                session.aceSession = terminal.aceSession;
            
                // Add method to write to terminal
                session.write = function(data) {
                    session.terminal.write(data);
                    // session.monitor.onData(data);
                };
                
                // Create a container and initialize the terminal in it.
                session.attach();
                
                // Update the terminal title
                terminal.on("title", function(title){
                    if (!session.output) {
                        session.doc.title   = 
                        session.doc.tooltip = title.replace(/^.+?:\d+:/, "");
                    }
                });
                session.aceSession.resize = session.resize.bind(session);
                
                // delay a little until we have correct size
                aceterm.renderer.once("afterRender", function start(){
                    if (session.resize() === false)
                        return aceterm.renderer.once("afterRender", start);
                    // Lets get our TMUX process
                    tmuxConnection.init(session, function(err, session){
                        if (err)
                            emit("connectError", { error: err });
                        else {
                            emit("connect", { 
                                id   : session.id, 
                                tab : session.tab 
                            });
                        }
                    });
                });
            }
            
            /***** Lifecycle *****/
            
            plugin.on("documentLoad", function(e){
                var doc     = e.doc;
                var session = doc.getSession();
                
                session.cwd = VFSROOT;
                
                session.__defineGetter__("tab", function(){ return doc.tab });
                session.__defineGetter__("doc", function(){ return doc });
                
                session.attach = function(){
                    if (session.aceSession)
                        aceterm.setSession(session.aceSession);
                };
                
                session.detach = function(){
                    // if (session.aceSession)
                    //     aceterm.setSession(session.aceSession);
                };
                
                session.kill = function(){
                    tmuxConnection.kill(this);
                };
                
                session.setState = function(state){
                    console.warn(state);
                    
                    if (session == currentSession) {
                        var el = container.querySelector(".ace_content");
                        el.style.opacity = state == "connected" ? "" : "0.5";
                    }
                    
                    if (state == "connecting") {
                        session.tab.className.add("connecting");
                    }
                    else if (state == "error" || state == "killed") {
                        doc.tab.className.add("error");
                    }
                    else {
                        doc.tab.className.remove("error");
                        session.tab.className.remove("connecting");
                    }
                };
                
                var sizeChanged = null;
                var waitForServer = null;
                session.setSize = function(size) {
                    if (size) {
                        clearTimeout(waitForServer);
                        waitForServer = null;
                        this.terminal.setSize(size.cols, size.rows);
                        
                        if (sizeChanged) {
                            sizeChanged = false;
                            this.updatePtySize();
                        }
                    }
                };
                
                session.updatePtySize = function() {
                    // todo check tab.visible
                    if (this.pty && this.cols > 1 && this.rows > 1 && !waitForServer) {
                        this.pty.resize(this.cols, this.rows);
                        clearTimeout(waitForServer);
                        waitForServer = setTimeout(function() {
                            waitForServer = null;
                        }, 1000);
                    } else
                        sizeChanged = true;
                };
                
                session.resize = function(force) {
                    var terminal = this.terminal;
                    var ace      = this.aceSession.ace;

                    if (!terminal || !ace) return;
                    
                    var size   = ace.renderer.$size;
                    var config = ace.renderer.layerConfig;
                    
                    var h = size.scrollerHeight;
                    var w = size.scrollerWidth - 2 * config.padding;
                    
                    if (!h || config.lineHeight <= 1)
                        return false;

                    // top 1px is for cursor outline
                    var rows = Math.floor((h - 1) / config.lineHeight);
                    var cols = Math.floor(w / config.characterWidth);
                    
                    if (!cols || !rows)
                        return;

                    // Don't do anything if the size remains the same
                    if (!force && cols == terminal.cols && rows == terminal.rows)
                        return;
                        
                    // do not resize terminal to very small heights during initialization
                    if (force && rows < 3) 
                        rows = terminal.rows;

                    terminal.resize(cols, rows);

                    session.cols = cols;
                    session.rows = rows;
                    
                    this.updatePtySize();
                };
                
                function setTabColor(){
                    var bg    = settings.get("user/terminal/@backgroundColor");
                    var shade = util.shadeColor(bg, 0.75);
                    doc.tab.backgroundColor = shade.isLight ? bg : shade.color;
                    
                    if (shade.isLight) {
                        doc.tab.className.remove("dark");
                        container.className = "c9terminalcontainer";
                    }
                    else {
                        doc.tab.className.add("dark");
                        container.className = "c9terminalcontainer dark";
                    }
                }
                if (!isOutputTerminal)
                    setTabColor();
                
                // Prevent existing session from being reset
                if (session.terminal) {
                    if (session.connecting)
                        session.tab.className.add("connecting");
                    
                    return;
                }
                
                // Set id of previous session if applicable
                session.id = e.state && e.state.id || session.id
                    || isOutputTerminal && "output";
                session.output = isOutputTerminal;

                // When document gets unloaded everything should be cleaned up
                doc.on("unload", function(){
                    // Stop the shell process at the remote machine
                    if (!options.testing)
                        session.kill();
                    
                    // Destroy the terminal
                    session.terminal.destroy();
                }, doc);
                
                doc.on("setTitle", function(e){
                    if (session.mnuItem)
                        session.mnuItem.setAttribute("caption", e.title);
                }, doc);
                
                if (!isOutputTerminal)
                    handle.on("settingsUpdate", setTabColor, doc);
                
                // Some terminals won't set the title, lets set a default
                if (!isOutputTerminal && !doc.title)
                    doc.title = "Terminal";
                
                // Connect to a new or attach to an existing tmux session
                createTerminal(session, e.state);
            });
            
            plugin.on("documentActivate", function(e){
                // Remove the previously visible terminal
                if (currentSession)
                    currentSession.detach();
                
                // Set the current terminal as visible terminal
                currentDocument = e.doc;
                currentSession  = e.doc.getSession();
                currentSession.attach();
                currentSession.resize();
                
                var el = container.querySelector(".ace_content");
                el.style.transition = "opacity 150ms";
                el.style.transitionDelay = "50ms";
                el.style.opacity = currentSession.connected ? "" : "0.5";
                
                // Focus
                // plugin.focus();
            });
            
            plugin.on("documentUnload", function(e){
                var session = e.doc.getSession();

                // Remove the element from the container
                session.detach();
                
                // Clear current session
                if (currentSession == session) {
                    currentSession  = null;
                    currentDocument = null;
                    aceterm && aceterm.setSession(dummySession);
                }
            });
            
            plugin.on("getState", function(e){
                var session = e.doc.getSession();
                if (!session.id)
                    return;
        
                e.state.id        = session.id;
                e.state.width     = barTerminal.lastWidth || barTerminal.getWidth();
                e.state.height    = barTerminal.lastHeight || barTerminal.getHeight();
                
                // @todo scrollback log
                if (!e.filter) {
                    var aceSession = session.aceSession;
                    
                    e.state.scrollTop = aceSession.getScrollTop();
                    if (!aceSession.selection.isEmpty() || aceSession.selection.rangeCount > 1)
                        e.state.selection = aceSession.selection.toJSON();
                }
            });
            
            plugin.on("setState", function(e){
                var session   = e.doc.getSession();
                session.id    = e.state.id; 
                
                // @todo scrollback log
                var aceSession = session.aceSession;
                if (e.state.scrollTop)
                    aceSession.setScrollTop(e.state.scrollTop);
                if (e.state.selection)
                    aceSession.selection.fromJSON(e.state.selection);
            });
            
            plugin.on("clear", function(){
                if (currentSession) {
                    var t   = currentSession.terminal;
                    t.ybase = 0;
                    t.lines = t.lines.slice(-(t.ybase + t.rows));
                }
            });
            
            plugin.on("copy", function(e){
                if (e.native) return; // Ace handles this herself
                
                var data = aceterm.getCopyText();
                e.clipboardData.setData("text/plain", data);
            });
            plugin.on("paste", function(e){
                if (e.native) return; // Ace handles this herself
                
                var data = e.clipboardData.getData("text/plain");
                if (data !== false)
                    aceterm.onPaste(data);
            });
            
            plugin.on("focus", function(e){
                if (e.lost) blur();
                else focus();
            });
            
            plugin.on("blur", function(){
                blur();
            });
            
            plugin.on("resize", function(e){
                resize(e);
            });
            
            plugin.on("enable", function(){
                
            });
            
            plugin.on("disable", function(){
                
            });
            
            plugin.on("unload", function(){
                
            });
            
            /***** Register and define API *****/
            
            if (isOutputTerminal)
                plugin.freezePublicAPI.baseclass();
            
            /**
             * The output handle, responsible for events that involve all 
             * output instances. This is the object you get when you request 
             * the output service in your plugin.
             * 
             * Example:
             * 
             *     define(function(require, exports, module) {
             *         main.consumes = ["output"];
             *         main.provides = ["myplugin"];
             *         return main;
             *     
             *         function main(options, imports, register) {
             *             var outputHandle = imports.output;
             *         });
             *     });
             * 
             * 
             * @class output
             * @extends Plugin
             * @singleton
             */
            /**
             * The terminal handle, responsible for events that involve all 
             * terminal instances. This is the object you get when you request 
             * the terminal service in your plugin.
             * 
             * Example:
             * 
             *     define(function(require, exports, module) {
             *         main.consumes = ["terminal"];
             *         main.provides = ["myplugin"];
             *         return main;
             *     
             *         function main(options, imports, register) {
             *             var terminalHandle = imports.terminal;
             *         });
             *     });
             * 
             * 
             * @class terminal
             * @extends Plugin
             * @singleton
             */
            /**
             * Output Editor for Cloud9 IDE. This editor does not allow 
             * editing content. Instead it displays the output of a PTY in the
             * workspace. This editor is similar to terminal, except that it
             * doesn't start the default, instead it connects to an existing
             * TMUX session in which a process can be started using the 
             * {@link run#run run} plugin.
             * 
             * Example of instantiating a new output pane:
             * 
             *     tabManager.open({
             *         editorType : "output", 
             *         active     : true,
             *         document   : {
             *             title  : "My Process Name",
             *             output : {
             *                 id : "name_of_process"
             *             }
             *         }
             *     }, function(){});
             * 
             * @class output.Output
             * @extends Terminal
             */
            /**
             * The type of editor. Use this to create the output using
             * {@link tabManager#openEditor} or {@link editors#createEditor}.
             * @property {"output"} type
             * @readonly
             */
            /**
             * Terminal Editor for Cloud9 IDE. This editor does not allow 
             * editing content. Instead it displays the output of a PTY in the
             * workspace.
             * 
             * Example of instantiating a new terminal:
             * 
             *     tabManager.openEditor("terminal", true, function(err, tab){
             *         if (err) throw err;
             * 
             *         var terminal = tab.editor;
             *         terminal.write("ls\n");
             *     });
             * 
             * @class terminal.Terminal
             * @extends Editor
             */
            /**
             * The type of editor. Use this to create the terminal using
             * {@link tabManager#openEditor} or {@link editors#createEditor}.
             * @property {"terminal"} type
             * @readonly
             */
            /**
             * Retrieves the state of a document in relation to this editor
             * @param {Document} doc the document for which to return the state
             * @method getState
             * @return {Object}
             * @return {String} return.id         The unique id of the terminal session.
             * @return {Number} return.width      The width of the terminal in pixels.
             * @return {Number} return.height     The height of the terminal in pixels.
             * @return {Number} return.scrollTop  The amount of pixels scrolled.
             * @return {Object} return.selection  Describing the current state 
             *   of the selection. This can become a complex object when 
             *   there are multiple selections.
             */
            plugin.freezePublicAPI({
                /**
                 * Reference to the ace instance used by this terminal for 
                 * rendering the output of the terminal.
                 * @property {Ace.Editor} ace
                 * @readonly
                 */
                get ace(){ return aceterm; },
                
                /**
                 * The HTMLElement containing the termainl.
                 * @property {HTMLElement} container
                 * @readonly
                 */
                get container(){ return container; },
                
                _events : [
                    /**
                     * Fires when a connection attempt has failed
                     * @event connectError
                     * @param {Object} e
                     * @param {Error}  e.error describes the error that has occured.
                     */
                    "connectError",
                    /**
                     * Fires when a connection with the PTY on the server is
                     * established. From this moment on data can be received
                     * by the terminal and data can be written to the terminal.
                     * @event connect
                     * @param {Object} e
                     * @param {Tab}   e.tab  the tab of the terminal that got connected
                     * @param {String} e.id    the session id of the terminal
                     */
                    "connect"
                ],
                
                /**
                 * Writes a string to the terminal. The message is send to the 
                 * server and interpreted as if it was typed by the user. You 
                 * can send modifier keys by using their hex representation.
                 * @param {String} message the message to write to the terminal.
                 */
                write : write

                // toggleMouse : toggleMouse,
                // toggleStatus : toggleStatus,
                // closeActivePane : closeActivePane,
                // splitPaneH : splitPaneH,
                // splitPaneV : splitPaneV,
                // moveUp : moveUp,
                // moveDown : moveDown,
                // moveLeft : moveLeft,
                // moveRight : moveRight
            });
            
            plugin.load((isOutputTerminal ? "output" : "terminal") + counter++);
            
            return plugin;
        }
        
        register(null, {
            terminal: handle
        });
    }
});
