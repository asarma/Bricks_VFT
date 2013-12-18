define(function(require, exports, module) {
    main.consumes = [
        "Panel", "c9", "settings", "ui", "menus", "panels", "tabManager", 
        "language", "util", "language.jumptodef"
    ];
    main.provides = ["outline"];
    return main;

    function main(options, imports, register) {
        var c9 = imports.c9;
        var Panel = imports.Panel;
        var settings = imports.settings;
        var ui = imports.ui;
        var util = imports.util;
        var menus = imports.menus;
        var panels = imports.panels;
        var tabs = imports.tabManager;
        var language = imports.language;
        var jumptodef = imports["language.jumptodef"];
        
        var Range = require("ace/range").Range;
        var search = require("../c9.ide.navigate/search");
        var markup = require("text!./outline.xml");
        var Tree = require("ace_tree/tree");
        var TreeData = require("./outlinedp");
        
        /***** Initialization *****/
        
        var plugin = new Panel("Ajax.org", main.consumes, {
            index        : options.index || 50,
            width        : 250,
            caption      : "Outline",
            elementName  : "winOutline",
            minWidth     : 130,
            where        : options.where || "right",
            autohide     : true
        });
        // var emit   = plugin.getEmitter();
        
        var fullOutline         = [];
        var filteredOutline     = [];
        var ignoreSelectOnce    = false;
        var isDirty             = false;
        var isKeyDownAfterDirty = false;
        var staticPrefix        = options.staticPrefix;
        
        var tree, tdOutline, winOutline, textbox, treeParent; // UI Elements
        var originalLine, originalColumn, originalTab;
        var focussed, isActive, outline, timer, dirty;
        var worker;
        
        var COLLAPSE_AREA = 14;
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            plugin.setCommand({
                name    : "outline",
                hint    : "search for a definition and jump to it",
                bindKey : { mac: "Command-Shift-E", win: "Ctrl-Shift-E" },
                exec    : function(){
                    if (isActive){
                        if (focussed)
                            panels.deactivate("outline");
                        else
                            textbox.focus();
                    }
                    else {
                        panels.activate("outline");
                    }
                }
            });
            
            isActive = panels.isActive("outline");
            
            // Menus
            menus.addItemByPath("Goto/Goto Symbol...", 
                new apf.item({ command : "outline" }), 110, plugin);
            
            language.getWorker(function(err, worker) {
                worker.on("outline", onOutlineData); 
            });
            
            // Hook events to get the focussed tab
            tabs.on("open", function(e){
                var tab = e.tab;
                if (!isActive 
                  || !tab.path && !tab.document.meta.newfile 
                  || !tab.editor.ace || tab != tabs.focussedTab)
                    return;
                
                if (!originalTab) 
                    originalTab = e.tab;
                
                updateOutline(true);
            });
            
            tabs.on("focusSync", onTabFocus);
            
            tabs.on("tabDestroy", function(e){
                if (isActive && e.last)
                    clear();
            });
            
            panels.on("showPanelOutline", function(e){
                plugin.autohide = !e.button;
            }, plugin);
            panels.on("hidePanelOutline", function(e){
                plugin.autohide = true;
            }, plugin);
            
            if (isActive && tabs.focussedTab) {
                plugin.autohide = false;
                updateOutline();
                onTabFocus({ tab: tabs.focussedTab });
            }
            // Make sure we get an outline from slow-loading language handlers
            setTimeout(updateOutline, 2000);
            setTimeout(updateOutline, 5000);
            setTimeout(updateOutline, 10000);
            setTimeout(updateOutline, 15000);
        }
        
        function onTabFocus(event) {
            var tab = event.tab;
            var session;
            
            if (originalTab == tab)
                return;
            
            // Remove change listener
            if (originalTab) {
                session = originalTab.document.getSession().session;
                session && session.removeListener("changeMode", changeHandler);
                originalTab.document.undoManager.off("change", changeHandler);
                if (originalTab.editor.ace)
                    originalTab.editor.ace.selection
                        .removeListener("changeSelection", cursorHandler);
            }
            
            if ((!tab.path && !tab.document.meta.newfile) || tab.editorType !== "ace") {
                originalTab = null;
                return clear();
            }
            
            if (!tab.editor)
                return tab.document.once("setEditor", onTabFocus.bind(null, event));
                
            // Add change listener
            session = tab.document.getSession().session;
            session && session.on("changeMode", changeHandler);
            tab.document.undoManager.on("change", changeHandler);
            tab.editor.ace.selection.on("changeSelection", cursorHandler);
            
            originalTab = tab;
            
            if (isActive)
                updateOutline(true);
        }
        
        function changeHandler(){
            if (isActive && originalTab == tabs.focussedTab)
                updateOutline();
        }
        
        function cursorHandler(e){
            if (isActive && originalTab == tabs.focussedTab) {
                var ace = originalTab.editor.ace;
                if (!outline || !ace.selection.isEmpty())
                    return;
                    
                var selected = 
                    findCursorInOutline(outline, ace.getCursorPosition());
            
                if (tdOutline.$selectedNode == selected)
                    return;
            
                ignoreSelectOnce = true;
                if (selected)
                    tree.selection.selectNode(selected);
                else
                    tree.selection.selectNode(0);

                tree.renderer.scrollCaretIntoView(null, 0.5);
            }
        }
        
        function offlineHandler(e){
            // Online
            if (e.state & c9.STORAGE) {
                textbox.enable();
                //@Harutyun This doesn't work
                // tree.enable();
            }
            // Offline
            else {
                textbox.disable();
                //@Harutyun This doesn't work
                // tree.disable();
            }
        }
        
        var drawn = false;
        function draw(options){
            if (drawn) return;
            drawn = true;
            
            // Create UI elements
            ui.insertMarkup(options.aml, markup, plugin);
            
            // Import CSS
            ui.insertCss(require("text!./outline.css"), staticPrefix, plugin);
            
            treeParent     = plugin.getElement("outlineTree");
            textbox        = plugin.getElement("textbox");
            winOutline     = plugin.getElement("winOutline");
            textbox        = plugin.getElement("textbox");
        
            // Create the Ace Tree
            tree      = new Tree(treeParent.$int);
            tdOutline = new TreeData();
            
            tree.renderer.setScrollMargin(0, 10);
            
            // Assign the dataprovider
            tree.setDataProvider(tdOutline);
            
            // Some global render metadata
            tdOutline.staticPrefix = staticPrefix;

            // @TODO this is probably not sufficient
            window.addEventListener("resize", function(){ tree.resize() });
            
            tree.textInput = textbox.ace.textInput;
            
            // Scroll Styling
            // tree.renderer.setScrollMargin(0, 10, 0, 0);
            
            // @Harutyun; is this the right way to do it?
            function available(){ return tree.isFocused() }
            
            textbox.ace.commands.addCommands([
                {
                    bindKey : "ESC",
                    exec    : function(){
                        if (!originalTab.loaded) 
                            return clear();
                        
                        if (originalLine) {
                            var ace = originalTab && originalTab.editor.ace;
                            ace.gotoLine(originalLine, originalColumn, 
                                settings.getBool("editors/code/@animatedscroll"));
                            
                            originalLine = originalColumn = null;
                        }
                        
                        textbox.setValue("");
                        tabs.focusTab(originalTab);
                    }
                }, {
                    bindKey : "Up",
                    exec    : function(){ tree.execCommand("goUp"); }
                }, {
                    bindKey : "Down",
                    exec    : function(){ tree.execCommand("goDown"); }
                }, {
                    bindKey : "Enter",
                    exec    : function(){
                        onSelect();
                        
                        textbox.setValue("");
                        originalTab.loaded && tabs.focusTab(originalTab);
                    }
                }
            ]);
            
            textbox.ace.on("input", function(e) {
                renderOutline();
            });
            
            tree.on("changeSelection", function(){ 
                onSelect();
            });
            
            function onAllBlur(e){
                if (!winOutline.visible || !plugin.autohide)
                    return;
                
                var to = e.toElement;
                if (!to || apf.isChildOf(winOutline, to, true)) {
                    return;
                }
                
                // TODO add better support for overlay panels
                setTimeout(function(){ plugin.hide() }, 10);
            }
    
            apf.addEventListener("movefocus", onAllBlur);
            
            function onFocus(){ 
                focussed = true;
                ui.setStyleClass(treeParent.$int, "focus"); 
                
                var tab = tabs.focussedTab;
                var ace  = tab && tab.editor.ace;
                if (!ace) return;
                
                var cursor     = ace.getCursorPosition();
                originalLine   = cursor.row + 1;
                originalColumn = cursor.column;
            }
            function onBlur(){ 
                focussed = false;
                ui.setStyleClass(treeParent.$int, "", ["focus"]); 
            }
            
            textbox.ace.on("blur", onBlur);
            textbox.ace.on("focus", onFocus);
            
            // Offline
            c9.on("stateChange", offlineHandler, plugin);
            offlineHandler({ state: c9.status });
            
            language.getWorker(function(err, _worker) {
                worker = _worker;
                timer = setInterval(function(){
                    if (dirty) {
                        worker.emit("outline", { data : { ignoreFilter: false } });
                        dirty = false;
                    }
                }, 1000);
            });
        }
        
        /***** Methods *****/
        
        function updateOutline(now) {
            dirty = true;
            if (now)
                worker && worker.emit("outline", { data : { ignoreFilter: false } });
        }
    
        function findCursorInOutline(json, cursor) {
            for (var i = 0; i < json.length; i++) {
                var elem = json[i];
                if(cursor.row < elem.pos.sl || cursor.row > elem.pos.el)
                    continue;
                var inChildren = findCursorInOutline(elem.items, cursor);
                return inChildren ? inChildren : elem;
            }
            return null;
        }
    
        function onOutlineData(event) {
            var data = event.data;
            if (data.error) {
                // TODO: show error in outline?
                console.log("Oh noes! " + data.error);
                return;
            }
            
            var tab   = tabs.focussedTab;
            var editor = tab && tab.editor;
            if (!tab || (!tab.path && !tab.document.meta.newfile) || !editor.ace)
                return;
            
            fullOutline = event.data.body;
            renderOutline(event.data.showNow);
        }
        
        function renderOutline(ignoreFilter) {
            var tab   = tabs.focussedTab;
            var editor = tab && tab.editor;
            if (!tab || !tab.path && !tab.document.meta.newfile || !editor.ace)
                return;
                
            originalTab = tab;
            draw();
            
            var filter = ignoreFilter ? "" : textbox.getValue();
            isDirty    = ignoreFilter;
            isKeyDownAfterDirty = false;
            
            outline = search.treeSearch(fullOutline, filter, true);
            filteredOutline = outline;
    
            var ace = editor.ace;
            var selected = findCursorInOutline(outline, ace.getCursorPosition());
            
            tdOutline.setRoot(outline);
            tdOutline.selected = selected;
            tdOutline.filter   = filter;
            tdOutline.reFilter = util.escapeRegExp(filter);
            
            if (filter)
                tree.select(tree.provider.getNodeAtIndex(0));
            else if (selected) {
                ignoreSelectOnce = true;
                tdOutline.selection.selectNode(selected);
            }
            
            tree.resize();
            
            return selected;
        }
    
        function onSelect(node) {
            if (!node) 
                node = tree.selection.getCursor();
            if (!node)
                return; // ok, there really is no node
                
            if (ignoreSelectOnce) {
                ignoreSelectOnce = false;
                return;
            }
            
            if (!originalTab.loaded) 
                return clear();
            
            var pos = node.displayPos || node.pos;
            var ace = originalTab.editor.ace; 
            pos.sc = pos.sc || jumptodef.getFirstColumn(ace, pos.sl, node.name);
            var range = new Range(pos.sl, pos.sc || 0, pos.el || pos.sl, pos.ec || pos.sc);
            scrollToDefinition(ace, pos.sl, pos.elx || pos.el);
            ace.selection.setSelectionRange(range);
        }
        
        function clear(){
            if (textbox) {
                textbox.setValue("");
                tdOutline.setRoot({});
            }
        }
        
        function scrollToDefinition(ace, line, lineEnd) {
            var lineHeight = ace.renderer.$cursorLayer.config.lineHeight;
            var lineVisibleStart = ace.renderer.scrollTop / lineHeight;
            var linesVisible = ace.renderer.$size.height / lineHeight;
            lineEnd = Math.min(lineEnd, line + linesVisible);
            if (lineVisibleStart <= line && lineEnd <= lineVisibleStart + linesVisible)
                return;

            var SAFETY = 1.5;
            ace.scrollToLine(Math.round((line + lineEnd) / 2 - SAFETY), true);
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("draw", function(e){
            draw(e);
        });
        plugin.on("show", function(e){
            isActive = true;
            
            textbox.focus();
            textbox.select();
            tree.resize();
            
            updateOutline(true);
        });
        plugin.on("hide", function(e){
            // tree.clearSelection();
            isActive = false;
        });
        plugin.on("enable", function(){
            
        });
        plugin.on("disable", function(){
            
        });
        plugin.on("unload", function(){
            loaded = false;
            drawn  = false;
            
            clearInterval(timer);
        });
        
        /***** Register and define API *****/
        
        /**
         * Outline panel. Allows a user to navigate to a file from a structured
         * listing of all it's members and events.
         * @singleton
         * @extends Panel
         **/
        /**
         * @command outline
         */
        /**
         * Fires when the outline panel shows
         * @event showPanelOutline
         * @member panels
         */
        /**
         * Fires when the outline panel hides
         * @event hidePanelOutline
         * @member panels
         */
        plugin.freezePublicAPI({
            
        });
        
        register(null, {
            outline: plugin
        });
    }
});
