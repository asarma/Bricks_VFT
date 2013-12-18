define(function(require, exports, module) {
    "use strict";
    main.consumes = [
        "Editor", "editors", "commands", "menus", "Menu", "MenuItem", "Divider",
        "settings", "c9", "preferences", "ui", "tabManager"
    ];
    main.provides = ["ace"];
    return main;

    function main(options, imports, register) {
        var Editor   = imports.Editor;
        var editors  = imports.editors;
        var commands = imports.commands;
        var menus    = imports.menus;
        var settings = imports.settings;
        var c9       = imports.c9;
        var ui       = imports.ui;
        var tabs     = imports.tabManager;
        var prefs    = imports.preferences;
        var Menu     = imports.Menu;
        var MenuItem = imports.MenuItem;
        var Divider  = imports.Divider;
        
        // Markup & Modes
        var cssString   = require("text!./style.css");
        var themes      = JSON.parse(require("text!./themes.json"));
        var modes       = require("./modes");
        
        var extensions     = Object.keys(modes.extensions);
        
        // bearable scrollbars on windows
        require("./scrollbar");
        
        // Ace
        var lang                = require("ace/lib/lang");
        var Range               = require("ace/range").Range;
        var config              = require("ace/config");
        var AceEditor           = require("ace/editor").Editor;
        var Document            = require("ace/document").Document;
        var EditSession         = require("ace/edit_session").EditSession;
        var MultiSelect         = require("ace/multi_select").MultiSelect;
        var defaultCommands     = require("ace/commands/default_commands").commands;
        var VirtualRenderer     = require("ace/virtual_renderer").VirtualRenderer;
        var multiSelectCommands = require("ace/multi_select").commands;
        var whitespaceUtil      = require("ace/ext/whitespace");
        
        // Needed to clear ace
        var dummySession = new EditSession("");
        
        // We don't use ace workers
        config.setDefaultValue("session", "useWorker", false);
        
        // experiment
        config.setDefaultValue("editor", "fixedWidthGutter", true);
        
        require("ace/lib/fixoldbrowsers");
        
        if (ui.packed) {
            // tell the worker client to load workers from /_worker
            var moduleUrl = config.moduleUrl;
            config.moduleUrl = function(name, component) {
                if (component !== "worker")
                    return moduleUrl.apply(this, arguments);
                    
                return "/_worker/" + name;      
            };
        }
        
        /***** Global API *****/
        
        // Set up the generic handle
        var handle     = editors.register("ace", "Ace", Ace, extensions);
        var handleEmit = handle.getEmitter();
        handleEmit.setMaxListeners(1000);
        
        var mnuAce, mnuGutter;
        
        var isMinimal    = options.minimal;
        var themeLoaded  = {};
        var lastTheme, grpSyntax; 
        
        var theme;
        var skin = settings.get("user/general/@skin") || "dark";
        var defaultTheme    = skin == "light"
            ? "ace/theme/textmate"
            : "ace/theme/tomorrow_night_bright"; // Default Theme
        var defConsoleTheme = "ace/theme/idle_fingers";
        if (isMinimal) {
            defaultTheme = defConsoleTheme = "ace/theme/textmate";
        } else {
            require([defaultTheme, defConsoleTheme], function(){}); // Preload Themes
        }
        handle.__defineGetter__("theme", function(){ return theme; });
        
        function setTheme(path, noChangeEvent, fromServer, $err){
            // Get Theme or wait for theme to load
            try{
                theme = fromServer || require(path);
                
                // fixes a problem with Ace architect loading /lib/ace
                // creating a conflict with themes
                if (theme.isDark === undefined)
                    throw new Error();
            }
            catch(e){
                // not checking this can create infinite loop in build
                $err || require([path], function(){
                    setTheme(path, noChangeEvent, fromServer, true);
                });
                return;
            }
            
            if (lastTheme == theme)
                return;
            
            if (isMinimal) {
                if (!themeLoaded[path]) {
                    themeLoaded[path] = true;
                    handleEmit("themeInit", {theme: theme, path: path});
                }
                return;
            }
            else {
                if (!themeLoaded[path]) {
                    themeLoaded[path] = true;
                    
                    var cssClass = theme.cssClass;
                    
                    var bg = ui.getStyleRule("." + cssClass + " .ace_gutter", "backgroundColor");
                    var fg = ui.getStyleRule("." + cssClass + " .ace_gutter", "color");
                    
                    theme.bg   = bg;
                    theme.fg   = fg;
                    theme.path = path;
                
                    // Init Theme Event
                    handleEmit("themeInit", {theme: theme, path: path});
                }
                
                if (theme.isDark)
                    ui.setStyleClass(tabs.containers[0], "dark");
                else
                    ui.setStyleClass(tabs.containers[0], "", ["dark"]);
            }
            
            var lTheme = lastTheme;
            lastTheme = theme;
            
            // Emit theme change event
            if (!noChangeEvent) {
                handleEmit("themeChange", {
                    lastTheme : lTheme, 
                    theme     : theme, 
                    path      : path
                });
            }
        }
        
        // Theme passed in from the server
        if (options.theme) {
            ui.insertCss(options.theme.cssText, handle);
            define(options.theme.path, [], options.theme);
            // require([options.theme.path], function(){});
            setTheme(options.theme.path, null, options.theme);
        }
        
        /***** Default Settings *****/
        
        var BOOL   = "getBool";
        var STRING = "get";
        var NUMBER = "getNumber";
        
        // Name, Default Value, Type, Old Name, Store in Project Settings
        var font        = "Monaco, Menlo, Ubuntu Mono, Consolas, source-code-pro, monospace";
        var aceSettings = [
            // Per document
            ["newLineMode",           "auto",   STRING, "newlinemode", 1],
            ["tabSize",               "4",      NUMBER, "tabsize", 1],
            ["useSoftTabs",           "true",   BOOL,   "softtabs", 1],
            ["useWrapMode",           "false",  BOOL,   "wrapmode"],
            ["wrapToView",            "true",   BOOL,   "wrapmodeViewport"],
            
            // Ace
            ["fontSize",              "12",     NUMBER, "fontsize"],
            ["fontFamily",            font,     STRING, "fontfamily"],
            ["overwrite",             "false",  BOOL,   "overwrite"],
            ["selectionStyle",        "line",   STRING, "selectstyle"],
            ["cursorStyle",           "ace",    STRING, "cursorstyle"],
            ["highlightActiveLine",   "true",   BOOL,   "activeline"],
            ["highlightGutterLine",   "true",   BOOL,   "gutterline"],
            ["showInvisibles",        "false",  BOOL,   "showinvisibles"],
            ["showPrintMargin",       "true",   BOOL,   "showprintmargin"],
            ["displayIndentGuides",   "true",   BOOL,   "showindentguides"],
            ["printMarginColumn",     "80",     NUMBER, "printmargincolumn"],
            ["behavioursEnabled",     "true",   BOOL,   "behaviors"],
            ["wrapBehavioursEnabled", "false",  BOOL,   "wrapbehaviors"],
            ["scrollSpeed",           "2",      NUMBER, "scrollspeed"],
            ["showGutter",            "true",   BOOL,   "gutter"],
            ["showFoldWidgets",       "true",   BOOL,   "folding"],
            ["fadeFoldWidgets",       "true",   BOOL,   "fadefoldwidgets"],
            ["highlightSelectedWord", "true",   BOOL,   "highlightselectedword"],
            ["animatedScroll",        "true",   BOOL,   "animatedscroll"],
            ["scrollPastEnd",         "0.5",    NUMBER],
            ["mergeUndoDeltas",       "off",    STRING],
            ["theme",                 defaultTheme, STRING, "theme"]
        ];
        var docSettings     = aceSettings.slice(0, 5);
        var editorSettings  = aceSettings.slice(5);
        var projectSettings = aceSettings.slice(0, 3);
        var userSettings    = aceSettings.slice(3);
        var docLut = {}; docSettings.forEach(function(x){ docLut[x[0]] = x });
        
        /***** Undo Manager *****/
        
        function AceUndoManager(undoManager, session){
            this.$session = session;
            this.$undo    = undoManager;
            var _self = this;
            var Item = this.Item;
            this.$undo.on("itemFind", function(e){
                return Item(_self, e.state);
            });
        }
        AceUndoManager.prototype = {
            Item : function(_self, deltas){
                return {
                    undo : function(){
                        _self.$session.session.undoChanges(deltas, _self.dontSelect);
                    },
                    redo : function(){
                        _self.$session.session.redoChanges(deltas, _self.dontSelect);
                    },
                    getState : function(){ 
                        return deltas.filter(function (d) {
                            return d.group != "fold";
                        });
                    }
                };
            },
            
            execute : function(options) {
                this.$undo.add(this.Item(this, options.args[0]));
            },

            undo : function(dontSelect) {
                this.dontSelect = dontSelect;
                this.$undo.undo();
            },
            redo : function(dontSelect) {
                this.dontSelect = dontSelect;
                this.$undo.redo();
            },
            reset : function(){
                this.$undo.reset();
            },
            hasUndo : function() {
                return this.$undo.length > this.$undo.position + 1;
            },
            hasRedo : function() {
                return this.$undo.length <= this.$undo.position + 1;
            },
            get $undoStack() {
                return this.$undo.stack.slice(0, this.$undo.position + 1)
                    .map(function(e){return e.getState()});
            }
        };
        
        /***** Generic Load *****/
        
        handle.on("load", function(){
            if (!isMinimal) {
                // Preferences
                setPreferences();
                
                // Menus
                setMenus();
                
                // State Management
                c9.on("stateChange", function(e){
                    if (e.state & c9.NETWORK)
                        menus.enableItem("View/Themes");
                    else
                        menus.disableItem("View/Themes");
                }, handle);
            }
            
            // Commands
            setCommands();
            
            // Settings
            var lastSettings;
            function updateSettings(e, list, prefix){
                var options = {};
                (list || aceSettings).forEach(function(setting){
                    options[setting[0]] 
                        = settings[setting[2]](prefix + "/ace/@" + setting[0]);
                });
                
                handleEmit("settingsUpdate", {
                    options: options
                });
                
                if (options.theme)
                    setTheme(options.theme);

                lastSettings = options;
            }
            
            settings.on("read", function(e) {
                settings.setDefaults("user/ace", userSettings);
                settings.setDefaults("project/ace", projectSettings);
    
                // pre load custom mime types
                loadCustomExtensions();
                
                // When loading from settings only set editor settings
                updateSettings(null, editorSettings, "user");
            }, handle);
            
            // Listen to changes in the settings
            settings.on("user/ace", function(e){ 
                updateSettings(e, userSettings, "user"); 
            });
            settings.on("project/ace", function(e){ 
                updateSettings(e, projectSettings, "project"); 
            });
            
            handle.on("newListener", function(event, listener){
                if (event == "settingsUpdate") 
                    listener({options: lastSettings});
            });
            
            // CSS
            ui.insertCss(cssString, options.staticPrefix, handle);
        });
        handle.on("unload", function(){
            drawn = false;
        });
        
        var drawn;
        function draw(){
            if (drawn) return;
            drawn = true;
            
            mnuAce = new Menu({ 
                id    : "menu",
                items : [
                    new MenuItem({ position: 1000, command: "cut", caption: "Cut"}, handle),
                    new MenuItem({ position: 1200, command: "copy", caption: "Copy" }, handle),
                    new MenuItem({ position: 1300, command: "paste", caption: "Paste" }, handle),
                    new Divider({ position: 1400 }, handle),
                    new MenuItem({ position: 1500, command: "selectall", caption: "Select All" }, handle),
                ]
            }, handle);
            
            mnuGutter = new Menu({ id: "menuGutter" }, handle);
            mnuGutter.on("show", function(e){
                var ace       = tabs.focussedTab.editor.ace;
                var region    = ace.renderer.$gutterLayer.getRegion(e);
                var line      = ace.renderer.screenToTextCoordinates(e.x, e.y).row;
                var className = ace.session.getBreakpoints()[line] || "";
            
                mnuGutter.meta.ace       = ace;
                mnuGutter.meta.line      = line;
                mnuGutter.meta.region    = region;
                mnuGutter.meta.className = className;
            });
        
            handleEmit("draw");
        }
        
        /***** Commands *****/
        
        function setCommands() {
            function fnWrap(command){
                command.group = "Code Editor (Ace)";
                command.readOnly = command.readOnly || false;
                command.focusContext = true;
    
                var isAvailable = command.isAvailable;
                command.isAvailable = function(editor, args, event) {
                    if (!editor || !editor.ace) return false;
                    
                    // using this instead of editor.type == "ace" to make 
                    // commands avaliable in editors inheriting from ace
                    if (event instanceof KeyboardEvent && (!editor.ace.isFocused()))
                        return false;
                    
                    return isAvailable ? isAvailable(editor.ace) : true;
                };
    
                command.findEditor = function(editor) {
                    if (editor && editor.ace)
                        return editor.ace;
                    return editor;
                };
                
                return command;
            }

            if (!defaultCommands.wrapped) {
                defaultCommands.push.apply(defaultCommands, whitespaceUtil.commands);
                defaultCommands.forEach(fnWrap, defaultCommands);
                defaultCommands.wrapped = true;
            }
            if (!multiSelectCommands.wrapped) {
                multiSelectCommands.forEach(fnWrap, multiSelectCommands);
                multiSelectCommands.wrapped = true;
            }

            commands.addCommands(defaultCommands, handle, true);
            commands.addCommands(multiSelectCommands, handle, true);
    
            // Override ACE key bindings (conflict with goto definition)
            commands.commands.togglerecording.bindKey = { 
                mac: "Command-Shift-R", 
                win: "Alt-Shift-R" 
            };
            commands.commands.replaymacro.bindKey = { 
                mac: "Command-Ctrl-R", 
                win: "Alt-R" 
            };
            
            commands.commands["findnext"].hint = 
                "search for the next occurrence of the search query your entered last";
            commands.commands["findnext"].msg = "Navigating to next match.";
            commands.commands["findprevious"].hint = 
                "search for the previous occurrence of the search query your entered last";
                
            commands.commands["findprevious"].msg = "Navigating to previous match.";
            commands.addCommand(commands.commands.togglerecording, handle);
            commands.addCommand(commands.commands.replaymacro, handle);
            
            commands.addCommand(fnWrap({
                name  : "syntax",
                exec  : function(_, syntax) {
                    if (typeof syntax == "object")
                        syntax = syntax.argv && syntax.argv[1] || "";

                    syntax = modes.caption[syntax] 
                        || modes.extensions[syntax] || syntax;
                    
                    var tab = tabs.focussedTab;
                    tab && tab.editor.setOption("syntax", syntax);
                },
                commands: modes.caption
            }), handle);
            
            commands.addCommand(fnWrap({
                name    : "largerfont",
                bindKey : { mac : "Ctrl-Shift-.", win : "Ctrl-Shift-." },
                exec    : function(e){
                    var currSize = settings.get("user/ace/@fontSize");
                    settings.set("user/ace/@fontSize", ++currSize > 72 ? 72 : currSize);
                }
            }), handle);
    
            commands.addCommand(fnWrap({
                name    : "smallerfont",
                bindKey : { mac : "Ctrl-Shift-,", win : "Ctrl-Shift-," },
                exec    : function(e) {
                    var currSize = settings.get("user/ace/@fontSize");
                    settings.set("user/ace/@fontSize", --currSize < 1 ? 1 : currSize);
                }
            }), handle);
        }
        
        /***** Preferences *****/
         
        function setPreferences(){
            prefs.add({
                "Project" : {
                    position : 10,
                    "Code Editor (Ace)" : {
                        position : 100,
                        "Soft Tabs" : {
                            type         : "checked-spinner",
                            checkboxPath : "project/ace/@useSoftTabs",
                            path         : "project/ace/@tabSize",
                            min          : "1",
                            max          : "64",
                            position     : 100
                        },
                        "Newline Mode" : {
                           type     : "dropdown",
                           path     : "project/ace/@newlineMode",
                           width    : 130,
                           items    : [
                               { caption : "Auto", value : "auto" },
                               { caption : "Windows (CRLF)", value : "windows" },
                               { caption : "Unix (LF)", value : "unix" }
                           ],
                           position : 200
                        }
                    }
                }
            }, handle);
            
            prefs.add({
                "Editors" : {
                    position : 400,
                    "Code Editor (Ace)" : {
                        position : 200,
                        "Auto-pair Brackets, Quotes, etc." : {
                            type     : "checkbox",
                            position : 1000,
                            path     : "user/ace/@behavioursEnabled"
                        },
                        "Wrap Selection with Brackets, Quotes, etc." : {
                            type     : "checkbox",
                            position : 1001,
                            path     : "user/ace/@wrapBehavioursEnabled"
                        },
                        "Code Folding" : {
                            type     : "checkbox",
                            position : 2000,
                            path     : "user/ace/@showFoldWidgets"
                        },
                        "Fade Fold Widgets" : {
                            type     : "checkbox",
                            position : 2500,
                            path     : "user/ace/@fadeFoldWidgets"
                        },
                        "Full Line Selection" : {
                            type     : "checkbox",
                            position : 3000,
                            path     : "user/ace/@selectionStyle",
                            values   : "line|text"
                        },
                        "Highlight Active Line" : {
                            type     : "checkbox",
                            position : 4000,
                            path     : "user/ace/@highlightActiveLine"
                        },
                        "Highlight Gutter Line" : {
                            type     : "checkbox",
                            position : 4000,
                            path     : "user/ace/@highlightGutterLine"
                        },
                        "Show Invisible Characters" : {
                            type     : "checkbox",
                            position : 5000,
                            path     : "user/ace/@showInvisibles"
                        },
                        "Show Gutter" : {
                            type     : "checkbox",
                            position : 6000,
                            path     : "user/ace/@showGutter"
                        },
                        "Show Indent Guides" : {
                            type     : "checkbox",
                            position : 6500,
                            path     : "user/ace/@displayIndentGuides"
                        },
                        "Highlight Selected Word" : {
                            type     : "checkbox",
                            position : 7000,
                            path     : "user/ace/@highlightSelectedWord"
                        },
                        "Scroll Paste the End of the Document" : {
                            type : "dropdown",
                            path : "user/ace/@scrollPastEnd",
                            items    : [
                               { caption : "Off",       value : "0" },
                               { caption : "Full Tab", value : "1" },
                               { caption : "Half Tab", value : "0.5" },
                           ],
                            position : 8000
                        },
                        "Animate Scrolling" : {
                            type : "checkbox",
                            path : "user/ace/@animatedScroll",
                            position : 9000
                        },
                        
                        "Font Family" : {
                           type     : "textbox",
                           path     : "user/ace/@fontFamily",
                           position : 10000
                        },
                        "Font Size" : {
                            type : "spinner",
                            path : "user/ace/@fontSize",
                            min  : "1",
                            max  : "72",
                            position : 10500
                        },
                        "Show Print Margin" : {
                            type         : "checked-spinner",
                            checkboxPath : "user/ace/@showPrintMargin",
                            path         : "user/ace/@printMarginColumn",
                            min          : "1",
                            max          : "200",
                            position     : 11000
                        },
                        "Mouse Scroll Speed" : {
                            type : "spinner",
                            path : "user/ace/@scrollSpeed",
                            min  : "1",
                            max  : "8",
                            position : 13000,
                        },
                        "Cursor Style" : {
                           type     : "dropdown",
                           path     : "user/ace/@cursorStyle",
                           items    : [
                               { caption : "Ace",    value : "ace" },
                               { caption : "Slim",   value : "slim" },
                               { caption : "Smooth", value : "smooth" },
                               { caption : "Wide",   value : "wide" }
                           ],
                           position : 13500
                        },
                        "Merge Undo Deltas" : {
                           type     : "dropdown",
                           path     : "user/ace/@mergeUndoDeltas",
                           items    : [
                               { caption : "Always", value : "always" },
                               { caption : "Never",  value : "off" },
                               { caption : "Timed",  value : "true" }
                           ],
                           position : 14000
                        }
                    }
                }
            }, handle);
        }
        
        /***** Menus *****/
        
        function setMenus() {
            function addEditorMenu(path, commandName) {
                return menus.addItemByPath(path, new ui.item({
                    command : commandName
                }), c += 100, handle);
            }
            
            var c = 20000;

            addEditorMenu("Tools/Toggle Macro Recording", "togglerecording"); //@todo this needs some more work
            addEditorMenu("Tools/Play Macro", "replaymacro"); //@todo this needs some more work
    
            c = 600;

            menus.addItemByPath("Edit/~", new ui.divider(), c += 100, handle);
            menus.addItemByPath("Edit/Selection/", null, c += 100, handle);
            menus.addItemByPath("Edit/Line/", null, c += 100, handle);
            menus.addItemByPath("Edit/Comment/", null, c += 100, handle);
            menus.addItemByPath("Edit/Text/", null, c += 100, handle);
            menus.addItemByPath("Edit/Code Folding/", null, c += 100, handle);
            menus.addItemByPath("Edit/Convert Case/", null, c += 100, handle);
            addEditorMenu("Edit/Align", "alignCursors");
    
            c = 0;

            addEditorMenu("Edit/Line/Indent", "indent"),
            addEditorMenu("Edit/Line/Outdent", "outdent"),
            addEditorMenu("Edit/Line/Move Line Up", "movelinesup"),
            addEditorMenu("Edit/Line/Move Line Down", "movelinesdown"),

            menus.addItemByPath("Edit/Line/~", new ui.divider(), c += 100, handle);
            addEditorMenu("Edit/Line/Copy Lines Up", "copylinesup"),
            addEditorMenu("Edit/Line/Copy Lines Down", "copylinesdown"),

            menus.addItemByPath("Edit/Line/~", new ui.divider(), c += 100, handle);
            addEditorMenu("Edit/Line/Remove Line", "removeline"),
            addEditorMenu("Edit/Line/Remove to Line End", "removetolineend"),
            addEditorMenu("Edit/Line/Remove to Line Start", "removetolinestart"),

            menus.addItemByPath("Edit/Line/~", new ui.divider(), c += 100, handle);
            addEditorMenu("Edit/Line/Split Line", "splitline");
    
            c = 0;

            addEditorMenu("Edit/Comment/Toggle Comment", "togglecomment");
    
            c = 0;

            addEditorMenu("Edit/Text/Remove Word Right", "removewordright"),
            addEditorMenu("Edit/Text/Remove Word Left", "removewordleft"),

            menus.addItemByPath("Edit/Text/~", new ui.divider(), c += 100, handle);
            addEditorMenu("Edit/Text/Transpose Letters", "transposeletters");
    
            c = 0;

            addEditorMenu("Edit/Code Folding/Fold", "fold"),
            addEditorMenu("Edit/Code Folding/Unfold", "unfold"),

            menus.addItemByPath("Edit/Code Folding/~", new ui.divider(), c += 100, handle);
            addEditorMenu("Edit/Code Folding/Fold All", "foldall"),
            addEditorMenu("Edit/Code Folding/Unfold All", "unfoldall");
    
            c = 0;

            addEditorMenu("Edit/Convert Case/Upper Case", "touppercase"),
            addEditorMenu("Edit/Convert Case/Lower Case", "tolowercase");
            
            c = 0;
            
            addEditorMenu("Edit/Selection/Select All", "selectall"),
            addEditorMenu("Edit/Selection/Split Into Lines", "splitIntoLines"),
            addEditorMenu("Edit/Selection/Single Selection", "singleSelection"),
            
            menus.addItemByPath("Edit/Selection/~", new ui.divider(), c += 100, handle);
            menus.addItemByPath("Edit/Selection/Multiple Selections/", null, c += 100, handle);
            
            menus.addItemByPath("Edit/Selection/~", new ui.divider(), c += 100, handle);
            addEditorMenu("Edit/Selection/Select Word Right", "selectwordright"),
            addEditorMenu("Edit/Selection/Select Word Left", "selectwordleft"),
            
            menus.addItemByPath("Edit/Selection/~", new ui.divider(), c += 100, handle);
            addEditorMenu("Edit/Selection/Select to Line End", "selecttolineend"),
            addEditorMenu("Edit/Selection/Select to Line Start", "selecttolinestart"),
            
            menus.addItemByPath("Edit/Selection/~", new ui.divider(), c += 100, handle);
            addEditorMenu("Edit/Selection/Select to Document End", "selecttoend"),
            addEditorMenu("Edit/Selection/Select to Document Start", "selecttostart")
            
            c = 0;
            
            addEditorMenu("Edit/Selection/Multiple Selections/Add Cursor Up", "addCursorAbove"),
            addEditorMenu("Edit/Selection/Multiple Selections/Add Cursor Down", "addCursorBelow"),
            addEditorMenu("Edit/Selection/Multiple Selections/Move Active Cursor Up", "addCursorAboveSkipCurrent"),
            addEditorMenu("Edit/Selection/Multiple Selections/Move Active Cursor Down", "addCursorBelowSkipCurrent"),
            
            menus.addItemByPath("Edit/Selection/Multiple Selections/~", new ui.divider(), c += 100, handle);
            addEditorMenu("Edit/Selection/Multiple Selections/Add Next Selection Match", "selectMoreAfter"),
            addEditorMenu("Edit/Selection/Multiple Selections/Add Previous Selection Match", "selectMoreBefore"),
            
            menus.addItemByPath("Edit/Selection/Multiple Selections/~", new ui.divider(), c += 100, handle);
            addEditorMenu("Edit/Selection/Multiple Selections/Merge Selection Range", "splitIntoLines");
    
            /**** View ****/
            
            menus.addItemByPath("View/~", new ui.divider(), 290000, handle);
            menus.addItemByPath("View/Font Size/", null, 290001, handle);
    
            c = 0;
    
            addEditorMenu("View/Font Size/Increase Font Size", "largerfont");
            addEditorMenu("View/Font Size/Decrease Font Size", "smallerfont");
    
            menus.addItemByPath("View/Gutter", new ui.item({
                type    : "check",
                checked : "[{settings.model}::user/ace/@showGutter]"
            }), 500, handle);

            var grpNewline = new ui.group();

            menus.addItemByPath("View/Newline Mode/", new ui.menu({
                "onprop.visible" : function(e){
                    if (e.value) {
                        grpNewline.setValue(
                            settings.get("user/ace/@newlineMode"));
                    }
                },
                "onitemclick" : function(e){
                    settings.set("user/ace/@newlineMode", e.relatedNode.value);
                }
            }), 310000, handle);

            menus.addItemByPath("View/Newline Mode/Auto", new ui.item({
                type    : "radio",
                value   : "auto",
                group   : grpNewline
            }), 100, handle);

            menus.addItemByPath("View/Newline Mode/~", new ui.divider(), 110, handle),

            menus.addItemByPath("View/Newline Mode/Windows (CRLF)", new ui.item({
                type    : "radio",
                value   : "windows",
                group   : grpNewline
            }), 200, handle);

            menus.addItemByPath("View/Newline Mode/Unix (LF)", new ui.item({
                type    : "radio",
                value   : "unix",
                group   : grpNewline
            }), 300, handle);

            rebuildSyntaxMenu();
            
            menus.addItemByPath("View/~", new ui.divider(), 400000, handle);

            var wrapToggle = function(){
                var tab = tabs.focussedTab;
                var editor = tab && tab.editor;
                
                var mnuWrap     = handle.getElement("mnuWrap");
                var mnuWrapView = handle.getElement("mnuWrapView");
                
                mnuWrapView.setAttribute("disabled", !mnuWrap.checked);
                
                editor.setOption("wrap", mnuWrap.checked
                    ? mnuWrapView.checked || "printMargin"
                    : false);
            };

            menus.addItemByPath("View/Wrap Lines", new ui.item({
                id          : "mnuWrap",
                type        : "check",
                onclick     : wrapToggle,
                isAvailable : function(editor){
                    if (!editor || editor.type != "ace")
                        return false;
                    
                    var mnuWrap     = handle.getElement("mnuWrap");
                    var mnuWrapView = handle.getElement("mnuWrapView");
                        
                    var wrap = editor.getOption("wrap");
                    mnuWrap.setAttribute("checked", !ui.isFalse(wrap));
                    mnuWrapView.setAttribute("checked", wrap != "printMargin");
                    mnuWrapView.setAttribute("disabled", !mnuWrap.checked);
                    
                    return true;
                }
            }), 500000, handle),

            menus.addItemByPath("View/Wrap To Viewport", new ui.item({
                id          : "mnuWrapView",
                type        : "check",
                onclick     : wrapToggle,
                isAvailable : function(editor){
                    return editor && editor.type == "ace";
                }
            }), 600000, handle);
    
            c = 0;

            /**** Goto ****/

            menus.addItemByPath("Goto/~", new ui.divider(), c = 399, handle),

            addEditorMenu("Goto/Word Right", "gotowordright"),
            addEditorMenu("Goto/Word Left", "gotowordleft"),
            menus.addItemByPath("Goto/~", new ui.divider(), 600, handle),

            addEditorMenu("Goto/Line End", "gotolineend"),
            addEditorMenu("Goto/Line Start", "gotolinestart"),
            menus.addItemByPath("Goto/~", new ui.divider(), c += 100, handle);

            addEditorMenu("Goto/Jump to Matching Brace", "jumptomatching"),
            menus.addItemByPath("Goto/~", new ui.divider(), c += 100, handle);

            addEditorMenu("Goto/Scroll to Selection", "centerselection");
    
            tabs.on("focus", function(e) {
                var action = e.tab.editor.type != "ace" ? "disable" : "enable";
                
                ["Edit/Comment", "Edit/Text", "Edit/Code Folding", 
                 "Edit/Convert Case", "Edit/Line", "Edit/Selection", 
                 "View/Syntax", "View/Font Size",
                 "View/Syntax/Other", "View/Syntax", "View/Newline Mode"
                ].forEach(function(path){
                    var menu = menus.get(path).menu;
                    if (menu) menu[action]();
                });
            });
            
            /**** Themes ****/
            
            var grpThemes = new ui.group();
            
            var mnuThemes = menus.addItemByPath("View/Themes/", new ui.menu({
                "onprop.visible" : function(e){
                    if (e.value)
                        mnuThemes.select(null, settings.get("user/ace/@theme"));
                }
            }), 350000, handle);
            
            var preview;
            var setMenuThemeDelayed = lang.delayedCall(function(){
                setMenuTheme(preview, true);
            }, 150);
            function setMenuTheme(path, isPreview){
                setTheme(path || settings.get("user/ace/@theme"));
                
                if (!isPreview)
                    settings.set("user/ace/@theme", path);
            }
            
            function addThemeMenu(name, path) {
                menus.addItemByPath("View/Themes/" + name, new ui.item({
                    type    : "radio",
                    value   : path || themes[name],
                    group   : grpThemes,
                    
                    onmouseover: function(e) {
                        preview = this.value;
                        setMenuThemeDelayed.schedule();
                    },
                    
                    onmouseout: function(e) {
                        preview = null;
                        setMenuThemeDelayed.schedule();
                    },
    
                    onclick : function(e) {
                        setMenuTheme(e.currentTarget.value);
                    }
                }), handle);
            }
        
            // Create Theme Menus
            for (var name in themes) {
                if (themes[name] instanceof Array) {
                    
                    // Add Menu Item (for submenu)
                    menus.addItemByPath("View/Themes/" + name, new ui.item(), handle);
                    
                    themes[name].forEach(function (n) {
                        // Add Menu Item
                        var themeprop = Object.keys(n)[0];
                        addThemeMenu(name + "/" + themeprop, n[themeprop]);
                    });
                }
                else {
                    // Add Menu Item
                    addThemeMenu(name);
                }
            }
            
            grpSyntax = new ui.group();
            handle.addElement(grpNewline, grpSyntax, grpThemes);
        }
        
        function rebuildSyntaxMenu() {
            if (menus.get("View/Syntax").menu)
                menus.remove("View/Syntax");

            menus.addItemByPath("View/Syntax/", new ui.menu({
                "onprop.visible" : function(e){
                    if (e.value) {
                        var tab = tabs.focussedTab;
                        var c9Session = tab && tab.editor && tab.document.getSession();
                        
                        if (!c9Session || !c9Session.session) {
                            this.disable();
                        } else {
                            this.enable();
                            var val = c9Session.session.syntax || c9Session.session.customSyntax || "auto";
                            this.select(undefined, val);
                            // TODO move to menus
                            if (this.opener.tagName == "item") {
                                var maxHeight = window.innerHeight - 60;
                                this.$ext.style.marginTop = "0px";
                            } else {
                                maxHeight = this.opener.$ext.getBoundingClientRect().top - 30;
                                this.$ext.style.marginTop = "-15px";
                            }
                            
                            this.$ext.style.maxHeight = maxHeight + "px";
                            this.$ext.style.overflowY = "auto";
                            // workaround for a chrome bug where clicking on shadow clciks on contents of overflown element
                            if (!this.mouseupFix) {
                                this.mouseupFix = true;
                                this.$ext.addEventListener("mouseup", function(e) {
                                    var rect = this.getBoundingClientRect();
                                    if (e.clientY > rect.bottom) {
                                        e.stopPropagation();
                                        e.preventDefault();
                                    }
                                }, true);
                            }
                        }
                    }
                },
                "onitemclick" : function(e) {
                    var tab = tabs.focussedTab;
                    if (tab) {
                        var session = tab.document.getSession();
                        var syntax = e.relatedNode.getAttribute("value");
                        setSyntax(session, syntax);
                    }
                }
            }), 300000, handle);
            
            var c = 0;

            menus.addItemByPath("View/Syntax/Auto-Select", new ui.item({
                type: "radio",
                value: "auto",
                group : grpSyntax
            }), c += 100, handle);

            menus.addItemByPath("View/Syntax/Plain Text", new ui.item({
                type: "radio",
                value: "text",
                group : grpSyntax
            }), c += 100, handle);

            menus.addItemByPath("View/Syntax/~", new ui.divider(), c += 100, handle);
    
            var modeList = Object.keys(modes.byName).map(function(x) {
                return modes.byName[x];
            }).sort(function(m1, m2) {
                return m2.order - m1.order || m1.caption.localeCompare(m2.caption);
            });
            
            var groupNum = modeList[0] && modeList[0].order;
            for (var i = 0; i < modeList.length; i++) {
                var mode = modeList[i];
                if (mode.order < 0)
                    break;
                if (mode.order < groupNum) {
                    groupNum = Math.min(mode.order, groupNum / 1000);
                    menus.addItemByPath("View/Syntax/~", new ui.divider(), c += 100, handle);
                }
                menus.addItemByPath("View/Syntax/" + mode.caption, new ui.item({
                    type    : "radio",
                    value   : mode.name,
                    group   : grpSyntax,
                   //onclick : onModeClick
                }), c += 100, handle);
            }
        }
        
        var updateSyntaxMenu = lang.delayedCall(rebuildSyntaxMenu, 50);
        
        /***** Syntax *****/
        
        function defineSyntax(opts) {
            if (!opts.name || !opts.caption)
                throw new Error("malformed syntax definition");
            var name = opts.name;
            modes.byCaption[opts.caption] = opts;
            modes.byName[name] = opts;
            
            if (!opts.extensions)
                opts.extensions = "";
            opts.extensions.split("|").forEach(function(ext) {
                modes.extensions[ext] = name;
            });
            updateSyntaxMenu.schedule();
        }
        
        function getExtOrName(path) {
            var fileName = path.substr(path.lastIndexOf("/") + 1);
            var extPos   = fileName.lastIndexOf(".") + 1;
            if (extPos)
                return fileName.substr(extPos).toLowerCase();
            // special case for new files
            if (/^Untitled\d+$/.test(fileName))
                fileName = fileName.replace(/\d+/, "");
            return "^" + fileName;
        }
        
        function getSyntaxForPath(path) {
            var ext = getExtOrName(path);
            var modeName = modes.customExtensions[ext] || modes.extensions[ext];
            return modes.byName[modeName] ? modeName : "";
        }
    
        function setSyntaxForPath(path, syntax, noOverwrite) {
            if (!path)
                return false;
            syntax = modes.byName[syntax] ? syntax : "";
    
            var ext = getExtOrName(path);
            var changed;
            if (syntax) {
                if (!modes.extensions[ext] || !noOverwrite) {
                    modes.customExtensions[ext] = syntax;
                    changed = true;
                }
            } else if (modes.customExtensions[ext]) {
                delete modes.customExtensions[ext];
                changed = true;
            }
            
            if (changed)
                settings.setJson("user/ace/custom-types", modes.customExtensions);
            return changed;
        }
        
        function getMode(syntax) {
            syntax = (syntax || "text").toLowerCase();
            if (syntax.indexOf("/") == -1)
                syntax = "ace/mode/" + syntax;
    
            return syntax;
        }
    
        function loadCustomExtensions() {
            var custom = settings.getJson("user/ace/custom-types");
            if (!custom) return;
            
            Object.keys(custom).forEach(function(ext) {
                var mode = custom[ext];
                if (modes.byName[mode])
                    modes.customExtensions[ext] = mode;
            });
        }
     
        function detectSyntax(c9Session) {
            if (!c9Session.session || !c9Session.session.getLine)
                return;
            // todo move this into ace mode util
            var firstLine = c9Session.session.getLine(0);
            var syntax;
            if (/^#!/.test(firstLine)) {
                syntax = firstLine.match(/(node|bash|sh)\s*$/);
                switch (syntax && syntax[0]) {
                    case "node": syntax = "javascript"; break;
                    case "sh": // fallthrough
                    case "bash": syntax = "sh"; break;
                    default: syntax = ""; break;
                }
            }
            return syntax;
        }
        
        function getSyntax(c9Session, path) {
            var syntax = c9Session.session.customSyntax
                || path && getSyntaxForPath(path)
                || detectSyntax(c9Session);
            return modes.byName[syntax] ? syntax : "";
        }
    
        function setSyntax(c9Session, syntax, forThisOnly) {
            var c9doc = c9Session.session.c9doc;
            syntax = modes.byName[syntax] ? syntax : "";
            var path = c9doc.tab.path;
            if (!forThisOnly && !setSyntaxForPath(path, syntax, true))
                c9Session.session.customSyntax = syntax;
            
            c9doc.editor.setOption("syntax", syntax || getSyntax(c9Session, path));
        }
        
        /**
         * The ace handle, responsible for events that involve all ace
         * instances. This is the object you get when you request the ace
         * service in your plugin.
         * 
         * Example:
         * 
         *     define(function(require, exports, module) {
         *         main.consumes = ["ace"];
         *         main.provides = ["myplugin"];
         *         return main;
         *     
         *         function main(options, imports, register) {
         *             var aceHandle = imports.ace;
         *             
         *             aceHandle.on("create", function(e){
         *                 // This is an ace editor instance
         *                 var ace = e.editor;
         *             })
         *         });
         *     });
         * 
         * 
         * @class ace
         * @extends Plugin
         * @singleton
         */
        handle.freezePublicAPI({
            /**
             * The context menu that is displayed when right clicked in the ace
             * editing area.
             * @property {Menu} contextMenu
             * @readonly
             */
            get contextMenu(){ draw(); return mnuAce },
            
            /**
             * The context menu that is displayed when right clicked in the ace
             * gutter area.
             * @property {Menu} gutterContextMenu
             * @readonly
             */
            get gutterContextMenu(){ draw(); return mnuGutter },
            
            _events : [
                /**
                 * Fires once for each ace instance that is instantiated.
                 * 
                 * Note that this event does not only fire for each ace instance
                 * that is created, but it also fires for all ace instances that
                 * have been created and are still around.
                 * 
                 * @event create
                 * @param {Object} e
                 * @param {Editor} e.editor
                 */
                "create",
                /**
                 * Fires when a new theme is initialized.
                 * @event themeInit
                 * @param {Object}  e
                 * @param {Object}  e.theme           Describes the theme that is initialized.
                 * @param {String}  e.theme.cssClass  The css class name related to the theme.
                 * @param {String}  e.theme.bg        The background color for this theme.
                 * @param {String}  e.theme.fg        The foreground color for this theme.
                 * @param {String}  e.theme.path      The path of this theme.
                 * @param {Boolean} e.theme.isDark    Specifies whether this is a dark theme or a light theme.
                 * @param {String}  e.path            The path of the theme.
                 */
                "themeInit",
                /**
                 * Fires when the current theme changes to another theme.
                 * 
                 * See also {@link ace#setTheme}.
                 * 
                 * @event themeChange
                 * @param {Object}  e
                 * @param {Object}  e.theme               Describes the theme that is initialized.
                 * @param {String}  e.theme.cssClass      The css class name related to the theme.
                 * @param {String}  e.theme.bg            The background color for this theme.
                 * @param {String}  e.theme.fg            The foreground color for this theme.
                 * @param {String}  e.theme.path          The path of this theme.
                 * @param {Boolean} e.theme.isDark        Specifies whether this is a dark theme or a light theme.
                 * @param {Object}  e.lastTheme           Describes the theme that is initialized.
                 * @param {String}  e.lastTheme.cssClass  The css class name related to the theme.
                 * @param {String}  e.lastTheme.bg        The background color for this theme.
                 * @param {String}  e.lastTheme.fg        The foreground color for this theme.
                 * @param {String}  e.lastTheme.path      The path of this theme.
                 * @param {Boolean} e.lastTheme.isDark    Specifies whether this is a dark theme or a light theme.
                 * @param {String}  e.path                The path of the theme.
                 */
                 "themeChange",
                 /**
                  * Fires when the ace context menus are drawn
                  * @event draw
                  */
                 "draw"
            ],
            
            /**
             * Set the theme for ace.
             * 
             * Here's a list of known themes:
             * 
             * * ace/theme/ambiance
             * * ace/theme/chrome
             * * ace/theme/clouds
             * * ace/theme/clouds_midnight
             * * ace/theme/cobalt
             * * ace/theme/crimson_editor
             * * ace/theme/dawn
             * * ace/theme/dreamweaver
             * * ace/theme/eclipse
             * * ace/theme/github
             * * ace/theme/idle_fingers
             * * ace/theme/kr_theme
             * * ace/theme/merbivore
             * * ace/theme/merbivore_soft
             * * ace/theme/mono_industrial
             * * ace/theme/monokai
             * * ace/theme/pastel_on_dark
             * * ace/theme/solarized_dark
             * * ace/theme/solarized_light
             * * ace/theme/textmate
             * * ace/theme/tomorrow
             * * ace/theme/tomorrow_night
             * * ace/theme/tomorrow_night_blue
             * * ace/theme/tomorrow_night_bright
             * * ace/theme/tomorrow_night_eighties
             * * ace/theme/twilight
             * * ace/theme/vibrant_ink
             * * ace/theme/xcod
             * 
             * @method setTheme
             * @param {String} path  The path of the theme file.
             * @fires themeInit
             * @fires themeChange
             */
            setTheme : setTheme,
            
            /**
             * Add new syntax to the menu
             * 
             * See also {@link ace#setSyntax}.
             * 
             * @param {Object}  syntax
             * @param {Object}  syntax.caption        Caption to display in the menu
             * @param {Number}  syntax.order          order in the menu
             * @param {String}  syntax.id             The path to corresponding ace language mode. (if doesn't contain "/" assumed to be from "ace/mode/<id>")
             * @param {String}  syntax.extensions     file extensions in the form "ext1|ext2|^filename". this is case-insensitive
             */
            defineSyntax : defineSyntax,
            
            /**
             * @ignore this is used by statusbar
             */
            getSyntaxCaption : function(syntax) {
                var mode = modes.byName[syntax];
                return mode && mode.caption || "Text";
            },
            
            /**
             * @ignore
             */
            draw : draw
        });
        
        /***** Initialization *****/
        
        var counter = 0;

        function Ace(isBaseclass, exts){
            if ( !exts) exts = [];
            var deps   = main.consumes.slice(0, main.consumes.length - 1);
            var plugin = new Editor("Ajax.org", deps, 
                exts && exts.concat(extensions) || extensions);
            var emit   = plugin.getEmitter();
            
            if (isBaseclass) plugin.freezePublicAPI.baseclass();
            
            var ace, currentSession, currentDocument, container, progress;
            var immutableSkin;
            
            plugin.on("draw", function(e){
                // Create Ace
                container = e.htmlNode.appendChild(document.createElement("div"));
                container.className      = "codeditorHolder";
                container.style.position = "absolute";
                container.style.left     = "0px";
                container.style.right    = "0px";
                container.style.top      = ui.getStyle(e.htmlNode, "paddingTop");
                container.style.bottom   = "0px";
        
                // Create Ace editor instance
                var theme = settings.get("user/ace/@theme");
                ace = new AceEditor(new VirtualRenderer(container, theme), null);
                if (c9.readonly)
                    ace.setReadOnly(true);
                    
                new MultiSelect(ace);
                
                // Create Menu
                handle.draw();
                
                createProgressIndicator(e.htmlNode);
                
                var tab = e.tab;
                
                tab.on("contextmenu", function(e){ 
                    var target = e.htmlEvent.target;
                    var gutter = ace.container.querySelector(".ace_gutter");
                
                    // Set Gutter Context Menu
                    if (ui.isChildOf(gutter, target, true)) {
                        mnuGutter.show(e.x, e.y);
                    }
                    // Set main Ace Context Menu
                    else {
                        mnuAce.show(e.x, e.y);
                    }
                    return false;
                });
                
                ace.keyBinding.setDefaultHandler(null);
        
                // ace.on("changeOverwrite", function(e) {
                //     setOption("overwrite", e.data);
                // });
            
                // Route gutter events
                ace.on("gutterclick", function(e){ emit("guttermousedown", e); });
                ace.on("gutterdblclick", function(e){ emit("gutterdblclick", e); });

                // use global commandKeyBinding
                // ace.commands.commandKeyBinding = {};

                handle.on("settingsUpdate", function(e){
                    setOptions(e.options);
                }, plugin);
                
                handle.on("themeChange", function(e){
                    ace.setTheme(e.path);
                    changeTheme();
                    
                    emit("themeChange", e);
                }, plugin);
                
                if (handle.theme)
                    ace.setTheme(handle.theme.path);
            });
            
            /***** Methods *****/
            
            function focus(){
                if (container) {
                    ui.addClass(container, "aceFocus");
                    ace.focus();
                }
            }
            function blur(){
                if (container) {
                    ui.removeClass(container, "aceFocus");
                    ace.blur();
                }
            }
            
            function resize(e){
                var renderer = ace && ace.renderer;
                if (!renderer) return;
                
                if (e.type == "anim") {
                    var htmlNode = ace.container;
                    if (!htmlNode)
                        return;
                    
                    if (e.vertical) {
                        var size = e.current === 0
                          ? Math.abs(e.delta) - 5
                            - currentDocument.tab.pane.aml.$buttons.offsetHeight
                          : htmlNode.offsetHeight + e.delta;
                        
                        renderer.onResize(true, null, null, size);
                    }
                    else {
                        renderer.onResize(true, null, 
                            htmlNode.offsetWidth + e.delta);
                    }
                }
                else {
                    renderer.$updateSizeAsync();
                }
            }
            
            function getState(doc, state, filter){
                if (filter) return;
                
                var session = doc.getSession().session;
                if (!session) return;
        
                // Folds
                state.folds = session.getAllFolds().map(function(fold) {
                    return {
                        start       : fold.start,
                        end         : fold.end,
                        placeholder : fold.placeholder
                    };
                });
        
                // Per document options
                var options = {};
                var sessionOptions = session.getOptions();
                docSettings.forEach(function(setting){
                    options[setting[0]] = sessionOptions[setting[0]] || null;
                });
                
                // Custom Type
                if (session.customSyntax)
                    state.customSyntax = session.customSyntax;
                
                // Scroll state
                state.scrolltop  = session.getScrollTop();
                state.scrollleft = session.getScrollLeft();
                
                // Selection & options
                state.selection  = session.selection.toJSON();
                state.options    = options;
                
                var row = doc.editor.ace 
                    ? doc.editor.ace.renderer.getFirstVisibleRow()
                    : 0;
                state.firstLineState = row && session.bgTokenizer && {
                    row: row - 1,
                    state: session.bgTokenizer.states[row - 1],
                    mode: session.$mode.$id
                };
            }
            
            function setState(doc, state){
                var c9Session = doc.getSession();
                var session   = c9Session.session;
                if (!session) return; // Happens when called after tab is closed
                
                if (state.cleansed)
                    state.firstLineState = state.folds = null;
                
                // Set customSyntax
                if (state.customSyntax) {
                    session.customSyntax = state.customSyntax;
                    setSyntax(c9Session, session.customSyntax);
                }
        
                // Set folds
                if (state.folds) {
                    try {
                        state.folds.forEach(function(fold){
                            session.addFold(fold.placeholder, 
                                Range.fromPoints(fold.start, fold.end));
                        });
                    } catch(e) {
                        state.folds = null;
                    }
                }
                
                if (state.firstLineState && session.bgTokenizer) {
                    var updateFirstLineState = function() {
                        session.bgTokenizer.states[state.firstLineState.row]
                            = state.firstLineState.state;
                    }
                    if (session.$mode.$id == state.firstLineState.mode) {
                        updateFirstLineState();
                    } else
                        session.once("changeMode", updateFirstLineState);
                }
                
                function updateSession(){
                    // Set per document options
                    for (var prop in state.options){
                        setOption(prop, state.options[prop], c9Session);
                    }
                    
                    // Jump to
                    if (state.jump) {
                        var row    = state.jump.row;
                        var column = state.jump.column;
            
                        scrollTo(row, column, state.jump.select, session);
                    }
                    // Set selection
                    else if (state.selection)
                        session.selection.fromJSON(state.selection);
                    
                    // Set scroll state
                    if (state.scrolltop)
                        session.setScrollTop(state.scrolltop);
                    if (state.scrollleft)
                        session.setScrollLeft(state.scrollleft);
                }
                
                if (ace.session == session) 
                    updateSession();
                else {
                    var clean = function(){
                        ace.off("changeSession", listen);
                        session.off("unload", clean);
                    };
                    var listen = function(e){
                        if (e.session == session) {
                            updateSession();
                            clean();
                        }
                    };
                    
                    ace.on("changeSession", listen);
                    session.on("unload", clean);
                }
            }
            
            function scrollTo(row, column, select, session){
                (currentSession && currentSession.session || session)
                    .unfold({row: row, column: column || 0});
    
                ace.$blockScrolling += 1;
                ace.selection.clearSelection();
                ace.moveCursorTo(row, column || 0);
                if (select)
                    session.getSelection().selectToPosition(select);
                ace.$blockScrolling -= 1;
                
                var range = ace.selection.getRange();
                var initialScroll = ace.renderer.scrollTop;
                ace.renderer.scrollSelectionIntoView(range.start, range.end, 0.5);
                
                ace.renderer.animateScrolling(initialScroll);
            }
            
            function changeTheme(){
                if (immutableSkin || !currentSession) 
                    return;
                
                var theme = handle.theme;
                if (handle.theme && currentSession.cssClass != theme.cssClass) {
                    var tab = currentDocument.tab;
                    var html = container.parentNode;
                    
                    if (theme.isDark) {
                        tab.className.add("dark");
                        html.style.boxShadow = "";
                    }
                    else {
                        tab.className.remove("dark");
                        html.style.boxShadow = "0 1px 0 0 rgba(255, 255, 255, .8) inset";
                    }
                    
                    html.style.backgroundColor = theme.bg;
                    
                    tab.backgroundColor = theme.bg;
                    // tab.foregroundColor = theme.fg;
                    
                    currentSession.isDark = theme.isDark;
                }
            }
            
            function getOption(name){
                var session = currentSession;
                
                if (name == "synax")
                    return session && session.syntax;
                else if (name == "useWrapMode")
                    return session && session.getOption("wrap") !== "off";
                else if (name == "wrapToView")
                    return session && session.getOption("wrap") !== "printMargin";
                
                return ace.getOption(name);
            }
            
            function setOptions(options){
                for (var prop in options){
                    setOption(prop, options[prop]);
                }
            }
            
            function setOption(name, value, c9Session){
                if (!c9Session)
                    c9Session = currentSession;
                var session = (c9Session || {}).session;
                
                if (docLut[name] && c9Session)
                    c9Session.options[name] = value;
                
                if (ui.isFalse(value))
                    value = false;
                
                // Own Implementations
                switch(name) {
                    case "theme":
                        ace.setTheme(value);
                        return;
                    case "syntax":
                        if (session) {
                            var mode = getMode(value);
                            session.setMode(mode);
                            session.syntax = value;
                        }
                        return;
                    case "useWrapMode":
                    case "wrapToView":
                        var useWrapMode, wrapToView;
                        if (!session) return;
                        
                        if (name != "useWrapMode") {
                            wrapToView  = value;
                            useWrapMode = session.getOption("wrap") != "off";
                        }
                        else {
                            useWrapMode = value;
                            wrapToView = session.getOption("wrap") == "free";
                        }
                        
                        name  = "wrap";
                        value = (useWrapMode ? wrapToView || "printMargin" : false);
                }
                
                ace.setOption(name, value);
            }

            function createProgressIndicator(parent) {
                var background = parent.appendChild(document.createElement("div"));
                background.style.cssText = "background: inherit;"
                    + "position:absolute;top:0;bottom:0;left:0;right:0;";
                    
                background.style.zIndex = 20000;
                background.style.transitionProperty = "opacity";
                
                progress = background.appendChild(document.createElement("div"));
                progress.className = "ace_progress";
                progress.innerHTML = "<div></div>";
                
                progress.background = background;
            }
            
            function hideProgress(){
                var style = progress.background.style;
                style.transitionDelay = 0;
                style.transitionDuration = 0;
                
                if (ace.renderer.$frozen && ace.renderer.$changes) {
                    ace.renderer.unfreeze();
                    ace.renderer.once("afterRender", function() {
                        style.display = "none";
                        style.opacity = 0;
                    });
                } else {
                    style.display = "none";
                    style.opacity = 0;
                }
            }
            
            function showProgress(value, upload, t){
                if (!upload)
                    ace.renderer.freeze();
                    
                var growT = 0;
                if (progress.t && t && progress.t - t) {
                    var vTotal = value / t;
                    var vLast = progress.value / progress.t;
                    var v = 0.6 * vTotal + 0.4 * vLast;
                    growT = (value - progress.value) / v;
                }
                progress.value = value;
                progress.t = t;
                progress.firstChild.style.width = value + "%";
                progress.firstChild.style.transition = "width " + (growT || 0) + "ms";
                
                progress.className = "ace_progress" + (upload ? " upload" : "");
                
                var fadeIn = function() {
                    if (bgStyle.display == "block") {
                        bgStyle.transitionDuration = Math.max(150 - t || 0, 0) + "ms";
                        bgStyle.transitionDelay = Math.max(50 - t || 0, 0) + "ms";
                        bgStyle.opacity = 1;
                    }
                };
                var bgStyle = progress.background.style;
                if (progress.noFadeIn && !upload) {
                    bgStyle.display = "block";
                    bgStyle.opacity = 1;
                }
                else if (bgStyle.display != "block") {
                    bgStyle.display = "block";
                    setTimeout(fadeIn);
                }
                else {
                    fadeIn();
                }
                
                bgStyle.bottom = upload ? "" : 0;
            }
        
            function detectSettingsOnLoad(c9Session) {
                var session = c9Session.session;
                whitespaceUtil.detectIndentation(session);
                if (!session.syntax) {
                    var syntax = detectSyntax(c9Session);
                    if (syntax)
                        setSyntax(c9Session, syntax, true);
                }
            }
            
            /***** Lifecycle *****/
            
            //@todo set selection, scroll and file in header
            
            plugin.on("load", function(){
                
            });
            
            plugin.on("documentLoad", function(e){
                var doc = e.doc;
                var c9Session = doc.getSession();
                
                // if load starts from another editor type
                // tabmanager will show as instantly
                // so we need to show progress bar instantly
                progress.noFadeIn = !currentDocument;
                
                // Value Retrieval
                doc.on("getValue", function get(e){ 
                    return c9Session.session
                        ? c9Session.session.getValue()
                        : e.value;
                }, c9Session);
                
                // Value setting
                doc.on("setValue", function set(e){ 
                    //if (currentDocument != doc)
                    //    return;
                    
                    var aceSession = c9Session.session;
                    if (!aceSession)
                        return; //This is probably a deconstructed document
                    
                    // The first value that is set should clear the undo stack
                    // additional times setting the value should keep it.
                    ace.$blockScrolling = true;
                    if (aceSession.c9doc.hasValue()) {
                        aceSession.doc.setValue(e.value || "");
                    } else {
                        aceSession.setValue(e.value || "");
                        detectSettingsOnLoad(c9Session);
                        hideProgress();
                    }
                    ace.$blockScrolling = false;
                    
                    ace.renderer.unfreeze();
    
                    if (e.state)
                        setState(doc, e.state);
    
                    if (!doc.tab.active)
                        return;
                }, c9Session);
                
                doc.on("progress", function(e){
                    if (e.complete)
                        delete c9Session.progress;
                    else
                        c9Session.progress = ((e.loaded / e.total) * 100);
                    
                    c9Session.upload = e.upload;
                    
                    if (currentSession != c9Session)
                        return;
                    
                    if (e.complete)
                        doc.hasValue() && hideProgress();
                    else
                        showProgress(c9Session.progress, c9Session.upload, e.dt);
                }, c9Session);
                
                // Title & Tooltip
                function setTitle(e){
                    var path = doc.tab.path;
                    if (!path) return;
                    
                    // Caption is the filename
                    doc.title = path.substr(path.lastIndexOf("/") + 1);
                    
                    // Tooltip is the full path
                    doc.tooltip = path;
                }
                setTitle({path: doc.tab.path || ""});
                
                // Changed marker
                function setChanged(e){
                    if (!doc.tab.className)
                        return;
                    if (e.changed || doc.meta.newfile)
                        doc.tab.className.add("changed");
                    else
                        doc.tab.className.remove("changed");
                }
                doc.on("changed", setChanged, c9Session);
                setChanged({ changed: doc.changed });
                
                // Update mode when the filename changes
                doc.tab.on("setPath", function(e){
                    setTitle(e);
                    // This event is triggered also when closing files, 
                    // so session may be gone already.
                    if (c9Session.session) {
                        var syntax = getSyntax(c9Session, doc.tab.path);
                        setOption("syntax", syntax, c9Session);
                    }
                }, c9Session);
                
                // Prevent existing session from being reset
                if (c9Session.session)
                    return;
                
                // Create an ace session
                var acedoc               = new Document(doc.value || "");
                c9Session.session        = new EditSession(acedoc);
                c9Session.session.c9doc  = doc;
                c9Session.options        = {};
                
                if (e.state && e.state.customSyntax)
                    c9Session.session.customSyntax = e.state.customSyntax;
                    
                var syntax = getSyntax(c9Session, doc.tab.path);
                setOption("syntax", syntax, c9Session);
                
                if (e.state)
                    setState(doc, e.state);
                
                // Create the ace like undo manager that proxies to 
                // the Cloud9 undo manager
                c9Session.undoManager = new AceUndoManager(doc.undoManager, c9Session);
                
                // Attach the ace undo manager to the current session
                c9Session.session.setUndoManager(c9Session.undoManager);
    
                doc.on("unload", function(){
                    setTimeout(function() { //@todo is this still needed?
                        if (!c9Session.session)
                            return;
                    
                        var doc = c9Session.session.getDocument();
                        if (doc) {
                            doc.$lines = [];
                            doc._eventRegistry = null;
                            doc._defaultHandlers = null;
                            doc = null;
                        }
                        c9Session.session.$stopWorker();
                        c9Session.session.bgTokenizer.lines = [];
                        c9Session.session.bgTokenizer.tokenizer = null;
                        c9Session.session.bgTokenizer = null;
                        c9Session.session.$rowCache = null;
                        // session.session.$mode = null;
                        c9Session.session.$origMode = null;
                        c9Session.session.$breakpoints = null;
                        c9Session.session.$annotations = null;
                        c9Session.session.languageAnnos = null;
                        c9Session.session = null;
                        c9Session = null;
                    });
                });
            });
            
            plugin.on("documentActivate", function(e){
                //editor.value    = e.doc.value;
                currentDocument = e.doc;
                currentSession  = e.doc.getSession();
                
                var options = currentSession.options;
                docSettings.forEach(function(setting){
                    if (options[setting[2]])
                        setOption(setting[0], options[setting[2]]);
                });
                
                
                if (currentSession.session)
                    ace.setSession(currentSession.session);
                
                if (currentSession.progress)
                    showProgress(currentSession.progress, currentSession.upload);
                else
                    hideProgress();
                    
                if (currentSession.progress)
                    ace.renderer.freeze();
                else
                    ace.renderer.unfreeze();
                
                // Theme support
                changeTheme();
                
                // @todo test switching editor
                // if (doc.editor && doc.editor != this) {
                //     var value = doc.getValue();
                //     if (doc.acesession.getValue() !== value) {
                //         doc.editor = this;
                //         doc.dispatchEvent("prop.value", {value : value});
                //     }
                // }
            });
            plugin.on("documentUnload", function(e){
                var session = e.doc.getSession();

                // Clear current session
                if (currentSession == session) {
                    currentSession  = null;
                    currentDocument = null;
                    
                    if (ace) {
                        ace.setSession(dummySession);
                        ace.renderer.freeze();
                    }
                }
            });
            plugin.on("resize", function(e){
                resize(e);
            });
            plugin.on("getState", function(e){
                getState(e.doc, e.state, e.filter);
            });
            plugin.on("setState", function(e){
                setState(e.doc, e.state);
            });
            plugin.on("clear", function(){
                if (currentSession)
                    currentSession.session.setValue("");
                ace.resize();
            });
            plugin.on("cut", function(e){
                if (e.native) return; // Ace handles this herself
                
                var data = ace.getCopyText();
                ace.onCut();
                e.clipboardData.setData("text/plain", data);
            });
            plugin.on("copy", function(e){
                if (e.native) return; // Ace handles this herself
                
                var data = ace.getCopyText();
                e.clipboardData.setData("text/plain", data);
            });
            plugin.on("paste", function(e){
                if (e.native) return; // Ace handles this herself
                
                var data = e.clipboardData.getData("text/plain");
                if (data !== false)
                    ace.onPaste(data);
            });
            plugin.on("blur", function(){
                blur();
            });
            plugin.on("focus", function(e){
                if (e.lost) blur();
                else focus();
            });
            plugin.on("enable", function(){
                ui.removeClass(container, "aceDisabled");
            });
            plugin.on("disable", function(){
                ui.addClass(container, "aceDisabled");
            });
            plugin.on("unload", function(){
                ace.destroy();
                container.innerHTML = "";
                
                ace       = null;
                container = null;
            });
            
            /***** Register and define API *****/
            
            /**
             * Ace Editor for Cloud9 IDE. Ace is the high performance code 
             * editor for the web, build and maintained by Cloud9 IDE. 
             * It is the main editor for code files and offers syntax 
             * highlighting for over 100 languages and formats. 
             * For more information see [ace's website](http://ace.c9.io). 
             * 
             * The editor exposes the [ace editor object](http://ace.c9.io/#nav=api&api=editor)
             * which in turn exposes many APIs that allow you to manipulate
             * the editor and it's contents. 
             * 
             * Example of instantiating a new terminal:
             * 
             *     tabManager.openFile("/file.js", true, function(err, tab){
             *         if (err) throw err;
             * 
             *         var ace = tab.editor;
             *         ace.setOption("tabSize", 8);
             *     });
             * 
             * @class ace.Ace
             * @extends Editor
             */
            /**
             * The type of editor. Use this to create ace using
             * {@link tabManager#openEditor} or {@link editors#createEditor}.
             * @property {"ace"} type
             * @readonly
             */
            /**
             * Retrieves the state of a document in relation to this editor
             * @param {Document} doc  The document for which to return the state
             * @method getState
             * @return {Object}
             * @return {String}  return.customSyntax  The language mode for this document (if the default mode has been overridden).
             * @return {Number}  return.scrolltop   The amount of pixels scrolled from the top.
             * @return {Number}  return.scrollleft  The amount of pixels scrolled from the left.
             * @return {Array}   return.folds       Describing the current state
             *   of the folded code in the document.
             * @return {Object}  return.selection   Describing the current state 
             *   of the selection. This can become a complex object when 
             *   there are multiple selections.
             * @return {Object}  return.options
             * @return {String}  return.options.newlineMode            One of three values: "windows", "unix", "auto".
             * @return {Number}  return.options.tabSize                The number of spaces that is used to render a tab.
             * @return {Boolean} return.options.useSoftTabs            When set to true the tab button inserts spaces.
             * @return {Boolean} return.options.useWrapMode            Specifies whether the text is wrapped
             * @return {Boolean} return.options.wrapToView             Specifies whether the text is wrapped to the viewport, or to the print margin.
             * @return {Boolean} return.options.wrapBehavioursEnabled  Specifies whether selection wraps with Brackets, Quotes, etc.
             */
            /**
             * Sets the state of a document in relation to this editor
             * @method setState
             * @param {Document} doc    The document for which to set the state
             * @param {Object}   state  The state to set
             * @param {String}   [state.customSyntax]  The language mode for this document (if the default mode has been overridden).
             * @param {Number}   [state.scrolltop]   The amount of pixels scrolled from the top.
             * @param {Number}   [state.scrollleft]  The amount of pixels scrolled from the left.
             * @param {Array}    [state.folds]       Describing the current state
             *   of the folded code in the document.
             * @param {Object}   [state.selection]   Describing the current state 
             *   of the selection. This can become a complex object when 
             *   there are multiple selections.
             * @param {Object}   [state.options]
             * @param {String}   [state.options.newlineMode]            One of three values: "windows", "unix", "auto".
             * @param {Number}   [state.options.tabSize]                The number of spaces that is used to render a tab.
             * @param {Boolean}  [state.options.useSoftTabs]            When set to true the tab button inserts spaces.
             * @param {Boolean}  [state.options.useWrapMode]            Specifies whether the text is wrapped
             * @param {Boolean}  [state.options.wrapToView]             Specifies whether the text is wrapped to the viewport, or to the print margin.
             * @param {Boolean}  [state.options.wrapBehavioursEnabled]  Specifies whether selection wraps with Brackets, Quotes, etc.
             * @param {Object}   [state.jump]                           Scrolls the document (with an animation) to the specified location (and optionally selection).
             * @param {Number}   [state.jump.row]                       The row to jump to (0 based)
             * @param {Number}   [state.jump.column]                    The column to jump to (0 based)
             * @param {Object}   [state.jump.select]
             * @param {Number}   [state.jump.select.row]                The row to select to (0 based)
             * @param {Number}   [state.jump.select.column]             The column to select to (0 based)
             */
            plugin.freezePublicAPI({
                /**
                 * Reference to the ace editor object as described 
                 * [here](http://ace.c9.io/#nav=api&api=editor)
                 * @property {Ace.Editor} ace
                 * @readonly
                 */
                get ace(){ return ace; },
            
                /**
                 * The theme object currently used in this ace instance
                 * @property {Object}  theme               Describes the theme that is initialized.
                 * @property {String}  theme.cssClass      The css class name related to the theme.
                 * @property {String}  theme.bg            The background color for this theme.
                 * @property {String}  theme.fg            The foreground color for this theme.
                 * @property {String}  theme.path          The path of this theme.
                 * @property {Boolean} theme.isDark        Specifies whether this is a dark theme or a light theme.
                 * @readonly
                 */
                get theme(){ 
                    if (!ace) return "";
                    if (immutableSkin) {
                        var path = ace.getTheme();
                        try { var theme = require(path); } catch(e) {}
                        return theme || "";
                    }
                    else {
                        return handle.theme;
                    }
                    return theme; 
                },
                
                _events : [
                    /**
                     * Fires when a users clicks on the gutter.
                     * The gutter is the area that contains the line numbers.
                     * @event guttermousedown
                     * @param {Object} e  information on the mouse event
                     */
                    "guttermousedown",
                    /**
                     * Fires when a users clicks twice in fast succession on 
                     * the gutter. The gutter is the area that contains the 
                     * line numbers.
                     * @event gutterdblclick
                     * @param {Object} e  information on the mouse event
                     */
                    "gutterdblclick",
                    /**
                     * Fires when the current theme changes to another theme.
                     * 
                     * See also {@link ace#setTheme}.
                     * 
                     * @event themeChange
                     * @param {Object}  e
                     * @param {Object}  e.theme               Describes the theme that is initialized.
                     * @param {String}  e.theme.cssClass      The css class name related to the theme.
                     * @param {String}  e.theme.bg            The background color for this theme.
                     * @param {String}  e.theme.fg            The foreground color for this theme.
                     * @param {String}  e.theme.path          The path of this theme.
                     * @param {Boolean} e.theme.isDark        Specifies whether this is a dark theme or a light theme.
                     * @param {Object}  e.lastTheme           Describes the theme that is initialized.
                     * @param {String}  e.lastTheme.cssClass  The css class name related to the theme.
                     * @param {String}  e.lastTheme.bg        The background color for this theme.
                     * @param {String}  e.lastTheme.fg        The foreground color for this theme.
                     * @param {String}  e.lastTheme.path      The path of this theme.
                     * @param {Boolean} e.lastTheme.isDark    Specifies whether this is a dark theme or a light theme.
                     * @param {String}  e.path                The path of the theme.
                     */
                    "themeChange"
                ],
                
                /**
                 * Retrieves the value of one of the ace options.
                 * 
                 * See {@link #setOption} for an overview of the options that can be retrieved.
                 * 
                 * @param {String} option  The option to retrieve
                 */
                getOption : getOption,
                
                /**
                 * Sets the value of one of the ace options.
                 * 
                 * <table>
                 * <tr><td>Option Name</td><td>              Possible Values</td></tr>
                 * <tr><td>"theme"</td><td>                  The path to the new theme.</td></tr>
                 * <tr><td>"syntax"</td><td>                 The path to the ace mode (e.g. ace/mode/javascript).</td></tr>
                 * <tr><td>"newlineMode"</td><td>            One of the following values: "windows", "unix", "auto".</td></tr>
                 * <tr><td>"tabSize"</td><td>                Number specifying the amount of spaces that represent a tab.</td></tr>
                 * <tr><td>"useSoftTabs"</td><td>            Boolean specifying whether to insert spaces when pressing the tab key.</td></tr>
                 * <tr><td>"useWrapMode"</td><td>            Specifies whether the text is wrapped</td></tr>
                 * <tr><td>"wrapToView"</td><td>             Specifies whether the text is wrapped to the viewport, or to the print margin.</td></tr>
                 * <tr><td>"wrapBehavioursEnabled"</td><td>  Specifies whether selection wraps with Brackets, Quotes, etc.</td></tr>
                 * <tr><td>"fontSize"</td><td>               Number specifying the font size in px.</td></tr>
                 * <tr><td>"fontFamily"</td><td>             String specifying the font family in css syntax.</td></tr>
                 * <tr><td>"overwrite"</td><td>              Boolean toggling overwrite mode.</td></tr>
                 * <tr><td>"selectionStyle"</td><td>         One of the following values: "line" (select the entire line), "text" (only select the text).</td></tr>
                 * <tr><td>"cursorStyle"</td><td>            One of the following values: "ace", "slim", "smooth", "wide"</td></tr>
                 * <tr><td>"highlightActiveLine"</td><td>    Boolean specifying whether to show highlighting of the line where the cursor is at.</td></tr>
                 * <tr><td>"highlightGutterLine"</td><td>    Boolean specifying whether to show highlighting in the gutter of the line where the cursor is at.</td></tr>
                 * <tr><td>"showInvisibles"</td><td>         Boolean specifying whether to show the invisible characters such as space, tab, newline.</td></tr>
                 * <tr><td>"printMarginColumn"</td><td>      Number specifying where the print margin will be in number of characters from the gutter.</td></tr>
                 * <tr><td>"showPrintMargin"</td><td>        Boolean specifying whether to show the print margin line (usually 80 chars)</td></tr>
                 * <tr><td>"displayIndentGuides"</td><td>    Boolean specifying whether to show the lines at each indentation mark</td></tr>
                 * <tr><td>"behavioursEnabled"</td><td>      Boolean specifying whether brackets are auto-paired.</td></tr>
                 * <tr><td>"scrollSpeed"</td><td>            Number specifying the number of rows that are scrolled when using the scrollwheel.</td></tr>
                 * <tr><td>"showGutter"</td><td>             Boolean specifying whether to show the gutter.</td></tr>
                 * <tr><td>"showFoldWidgets"</td><td>        Boolean specifying whether to show the fold widgets.</td></tr>
                 * <tr><td>"fadeFoldWidgets"</td><td>        Boolean specifying whether to fade the fold widgets into view on hover.</td></tr>
                 * <tr><td>"highlightSelectedWord"</td><td>  Boolean specifying whether to highlight words where the cursor is on.</td></tr>
                 * <tr><td>"animatedScroll"</td><td>         Boolean specifying whether scrolling is animated.</td></tr>
                 * <tr><td>"scrollPastEnd"</td><td>          Number specifying how far the user can scroll past the end. There are 3 possible values: 0, 0.5, 1.</td></tr>
                 * <tr><td>"mergeUndoDeltas"</td><td>        Boolean specifying whether to combine multiple operations as one on the undo stack.</td></tr>
                 * </table>
                 * 
                 * @param {String} option  The option to set
                 * @param {String} value   The value of the option
                 */
                setOption : setOption,
                
                /**
                 * Set multiple options by passing a multi-dimensional array
                 * with key/value pairs.
                 * 
                 * See also {@link #setOption}
                 * 
                 * @param {Array} options The options to set.
                 */
                setOptions : setOptions,
                
                /**
                 * Scrolls the currently active document to the specified row 
                 * and column and places the cursor there and optionally 
                 * select a piece of text.
                 * 
                 * @param {Number} row              The row to jump to (0 based)
                 * @param {Number} column           The column to jump to (0 based)
                 * @param {Object} [select]
                 * @param {Number} [select.row]     The row to select to (0 based)
                 * @param {Number} [select.column]  The column to select to (0 based)
                 */
                scrollTo : scrollTo
            });
            
            // Emit create event on handle
            setTimeout(function(){
                handleEmit("create", { editor: plugin }, true);
            });
            
            plugin.load("ace" + counter++);
            
            return plugin;
        }
        
        register(null, {
            ace: handle
        });
    }
});
