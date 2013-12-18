define(function(require, exports, module) {
    main.consumes = [
        "Panel", "c9", "util", "fs", "settings", "ui", "menus", "layout",
        "panels", "commands", "tabManager", "fs.cache", "watcher", 
        "preferences", "clipboard", "dialog.alert", "dialog.fileremove",
        "dialog.fileoverwrite"
    ];
    main.provides = ["tree"];
    return main;

    function main(options, imports, register) {
        var c9            = imports.c9;
        var util          = imports.util;
        var Panel         = imports.Panel;
        var fs            = imports.fs;
        var panels        = imports.panels;
        var settings      = imports.settings;
        var ui            = imports.ui;
        var menus         = imports.menus;
        var tabs          = imports.tabManager;
        var clipboard     = imports.clipboard;
        var layout        = imports.layout;
        var watcher       = imports.watcher;
        var prefs         = imports.preferences;
        var fsCache       = imports["fs.cache"];
        var alert         = imports["dialog.alert"].show;
        var confirmRemove = imports["dialog.fileremove"].show;
        var confirmRename = imports["dialog.fileoverwrite"].show;
        
        var Tree       = require("ace_tree/tree");
        var TreeEditor = require("ace_tree/edit");
        var markup     = require("text!./tree.xml");
        
        var basename  = require("path").basename;
        var dirname   = require("path").dirname;
        
        var staticPrefix = options.staticPrefix;
        var defaultExtension = "";
        
        /***** Initialization *****/
        
        var plugin = new Panel("Ajax.org", main.consumes, {
            index        : options.index || 100,
            caption      : "Workspace",
            elementName  : "winFilesViewer",
            minWidth     : 130,
            where        : options.where || "left"
        });
        var emit   = plugin.getEmitter();
        
        var container, winFilesViewer; //UI elements
        var showHideScrollPos, scrollTimer;
        var tree;
        
        var expandedList    = {};
        var scrollPos       = -1;
        var loadedSettings  = 0;
        var refreshing      = false;
        var changed         = false;
        
        function $hookIntoApfFocus(ace, amlNode) {
            // makes apf to treat barTerminal as codeEditor
            amlNode.$isTextInput = function(e){return true;};
            ace.on("focus", function() { 
                amlNode.focus();
            });
            ace.on("blur", function() { 
                // amlNode.blur();
            });
            amlNode.$focus = function(e, fromContextMenu) {
                if (fromContextMenu) {
                    ace.renderer.visualizeFocus();
                } else {
                    ace.textInput.focus();
                }
            };
            amlNode.$blur = function(e) {
                if (!ace.isFocused())
                    ace.renderer.visualizeBlur();
                else
                    ace.textInput.blur();
            };
        }
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            // Register this panel on the left-side panels
            plugin.setCommand({
                name    : "toggletree",
                hint    : "show the workspace files panel",
                bindKey : { mac: "Command-U", win: "Ctrl-U" }
            });
            panels.on("afterAnimate", function(e){
                if (panels.isActive("tree"))
                    tree && tree.resize();
            });
    
            // Settings
            settings.on("read", function(e){
                settings.setDefaults("user/general", [["preview-tree", "false"]]);
            
                fsCache.showHidden = settings.getBool("user/projecttree/@showhidden");
    
                scrollPos = settings.getNumber("state/projecttree/@scrollpos");
    
                expandedList = {};

                // auto/projecttree contains the saved expanded nodes
                if (settings.exist("state/projecttree")) {
                    var paths = settings.getJson("state/projecttree") || [c9.davPrefix];
                    paths.forEach(function(path){ expandedList[path] = true; });
    
                    loadedSettings = 1;
                    refreshing     = true; // Prevent selection to change prior to loading the file tree at init
    
                    // Please see note above about waiting for both the model and
                    // the settings to be loaded before loading the project tree
                    if (container)
                        ready();
                }
                else {
                    loadedSettings = 2;
                    if (container)
                        ready();
                }
            }, plugin);
    
            settings.on("write", function(e){
                if (!changed)
                    return;
    
                settings.setJson("state/projecttree", Object.keys(expandedList));
                changed = false;
            }, plugin);
            
            // Prefs
            prefs.add({
                "General" : {
                    "General" : {
                        "Enable Preview on Tree Selection" : {
                            type     : "checkbox",
                            position : 3000,
                            path     : "user/general/@preview-tree"
                        }
                    }
                }
            }, plugin);
        }
        
        var drawn = false;
        function draw(options){
            if (drawn) return;
            drawn = true;
            
            // Create UI elements
            ui.insertMarkup(options.aml, markup, plugin);
            
            // Fetch UI elements
            container      = plugin.getElement("container");
            winFilesViewer = plugin.getElement("winFilesViewer");
            
            // Import CSS
            var css = require("text!./style.css");
            ui.insertCss(css, staticPrefix, plugin);
            ui.insertCss(util.getFileIconCss(staticPrefix), false, plugin);
            
            // Create the Ace Tree
            tree = new Tree(container.$int);
            $hookIntoApfFocus(tree, container);
            tree.renderer.setScrollMargin(10, 10);
            tree.renderer.setTheme({cssClass: "filetree"});
            tree.setDataProvider(fsCache.model);
            tree.setOption("enableDragDrop", true);
            fsCache.model.rowHeight = 21;
            fsCache.model.rowHeightInner = 20;
            fsCache.model.$indentSize = 12;
            fsCache.model.getIconHTML = function(node) {
                var icon = node.map ? "folder" : util.getFileIcon(node.label);
                if (node.status === "loading") icon = "loading";
                return "<span class='filetree-icon " + icon + "'></span>";
            };
            
            tree.edit = new TreeEditor(tree);
            
            window.addEventListener("resize", function() {tree.resize()});
            
            var btnTreeSettings = plugin.getElement("btnTreeSettings");
            var mnuFilesSettings = plugin.getElement("mnuFilesSettings");
            
            btnTreeSettings.setAttribute("submenu", mnuFilesSettings);
            tree.renderer.on("scrollbarVisibilityChanged", updateScrollBarSize);
            tree.renderer.on("resize", updateScrollBarSize);
            function updateScrollBarSize() {
                var w = tree.renderer.scrollBarV.getWidth();
                btnTreeSettings.$ext.style.right = Math.max(w - 4,  2) + "px";
                tree.renderer.scroller.style.right = Math.max(w, 10) + "px";
            }
            
            tree.on("drop", function(e) {
                if (e.target && e.selectedNodes) {
                    (e.isCopy ? copy : move)(e.selectedNodes, e.target);
                }   
            });
            
            // Set the panel var for the panels extension
            plugin.panel = winFilesViewer;
            
            c9.on("stateChange", function(e){
                mnuCtxTree.setAttribute("disabled", !(e.state & c9.STORAGE));
                // tree.setDisabled("disabled", !(e.state & c9.STORAGE));
                //_self.button.enable();
            }, plugin);
    
            // This adds a "Show Hidden Files" item to the settings dropdown
            // from the Project Files header
            ui.insertByIndex(mnuFilesSettings, new apf.item({
                caption : "Refresh File Tree",
                onclick : function(){
                    refresh(true, function(){});
                }
            }), 100, plugin);
            ui.insertByIndex(mnuFilesSettings, new apf.item({
                caption : "Collapse All Folders",
                onclick : function(){
                    collapseAll();
                    expand("/", function(){});
                    select("/");
                },
                enableOffline : true,
            }), 120, plugin);
            ui.insertByIndex(mnuFilesSettings, new apf.divider(), 200, plugin);
            ui.insertByIndex(mnuFilesSettings, new apf.item({
                id      : "mnuitemHiddenFiles",
                type    : "check",
                caption : "Show Hidden Files",
                visible : "{tree.container.visible}",
                checked : "[{settings.model}::user/projecttree/@showhidden]",
                onclick : function(e){
                    setTimeout(function() {
                        changed = true;
                        settings.save();
                        
                        fsCache.showHidden = e.currentTarget.checked;
    
                        refresh(function(err){});
                    });
                }
            }), 300, plugin);
            
            mnuFilesSettings.on("prop.visible", function(e) {
                
            }, plugin);
            
            // todo
            winFilesViewer.on("prop.visible", function(e) {
                
            }, plugin);
    
            // After an item in the tree has been clicked on, this saves that
            // selection in the settings model
            // @todo optimize this with a timeout if needed
            tree.on("changeSelection", function(e) {
                if (!refreshing) {
                    var nodes = tree.selection.getSelectedNodes();
                    var paths = nodes.map(function(node){
                        return node.path;
                    });
                    settings.setJson("state/tree_selection", paths);
                    
                    emit("select", { paths: paths, nodes: nodes });
                }
            }, plugin);
            
            tree.on("userSelect", function(e) {
                var selected = tree.selection.getCursor();
                if (settings.getBool("user/general/@preview-tree") && !selected.isFolder) {
                    tabs.preview({ path: selected.path }, function(){});
                }
            });
    
            // Opens a file after the user has double-clicked
            tree.on("afterChoose", openSelection);
            tree.on("delete", remove);
            
            tree.provider.on("changeScrollTop", scrollHandler);
    
            // When a folder has been expanded, save it in expandedList
            tree.provider.on("expand", function(e){
                if (!e) return;
                var node = e;
                var id = node.path;
                if (id === undefined && node === tree.provider.root)
                    return;
                
                // Only save if we are not loading the tree
                if (!refreshing || loadedSettings != -1) {
                    watcher.watch(id, !expandedList[id]);
                    
                    changed = true;
                    settings.save();
                }
                
                expandedList[id] = node;
                emit("expand", { path: id });
            }, plugin);
    
            // When a folder has been collapsed, remove it from expandedList
            tree.provider.on("collapse", function(e){
                if (!e) return;
                var node = e;
    
                var id = node.path;
                delete expandedList[id];
                
                emit("collapse", { path: id });
    
                watcher.unwatch(id);
                // unwatch children
                if (id[id.length - 1] !== "/") id += "/";
                Object.keys(expandedList).forEach(function(path) {
                    if (path.lastIndexOf(id, 0) === 0) {
                        watcher.unwatch(path);
                    }
                });
                
                changed = true;
                settings.save();
            }, plugin);
    
            function abortNoStorage() {
                if (!c9.has(c9.STORAGE))
                    return false;
            }
            
            // Rename
            tree.on("rename", function(e){
                if (!c9.has(c9.STORAGE))
                    return false;
    
                if (getSelectedNode().path == "/") {
                    alert(
                        "Cannot rename project folder",
                        "Unable to rename the project folder",
                        "The project folder name is related to the url of your project and cannot be renamed here."
                    );
                    return false;
                }
                
                var node = e.node;
                var name = e.value;
                
                // check for a path with the same name, which is not allowed to rename to:
                var path    = node.path;
                var newpath = path.replace(/[^\/]+$/, name);
                
                // No point in renaming when the name is the same
                if (basename(path) == name)
                    return;
    
                // Returning false from this function will cancel the rename. We do this
                // when the name to which the file is to be renamed contains invalid
                // characters
                if (/[\\\/\n\r]/.test(name)) {
                    // todo is this still needed?
                    layout.showError(
                        "Could not rename to '" + apf.htmlentities(name) 
                          + "'. Names can only contain alfanumeric characters, space, . (dot)"
                          + ", - and _ (underscore). Use the terminal to rename to other names."
                    );
                    return false;
                }
                
                // var list = fsCache.findNodes(newpath);
                // if (list.length > (list.indexOf(node) > -1 ? 1 : 0)) {
                //     alert("Error", "Unable to Rename",
                //         "That name is already taken. Please choose a different name.");
                //     trFiles.getActionTracker().undo();
                //     return false;
                // }
                
                fs.rename(path, newpath, {}, function(err, success) { });
                
                return false;
            }, plugin);

            // Context Menu
            var mnuCtxTree = plugin.getElement("mnuCtxTree");
            plugin.addElement(mnuCtxTree);

            menus.addItemToMenu(mnuCtxTree, new apf.item({
                match   : "file",
                class   : "strong",
                caption : "Open",
                onclick : openSelection
            }), 100, plugin);
            
            menus.addItemToMenu(mnuCtxTree, new apf.divider(), 200, plugin);
            menus.addItemToMenu(mnuCtxTree, new apf.item({
                caption : "Refresh",
                onclick : function(){ refresh(tree.selection.getSelectedNodes(), function(){}); }
            }), 210, plugin);

            menus.addItemToMenu(mnuCtxTree, new apf.item({
                match   : "file|folder",
                write   : true,
                caption : "Rename",
                onclick : function(){ tree.edit.startRename() }
            }), 300, plugin);
            menus.addItemToMenu(mnuCtxTree, new apf.item({
                match   : "file|folder",
                write   : true,
                caption : "Delete",
                onclick : function(){ remove() }
            }), 310, plugin);

            // placeholder for other plugins            
            menus.addItemToMenu(mnuCtxTree, new apf.divider(), 400, plugin);

            menus.addItemToMenu(mnuCtxTree, new apf.divider({}), 600, plugin);
            menus.addItemToMenu(mnuCtxTree, new apf.item({
                match   : "file|folder",
                write   : true,
                caption : "Duplicate",
                onclick : function() {
                    var nodes = tree.selection.getSelectedNodes();
                    copy(nodes);
                }
            }), 610, plugin);
            
            menus.addItemToMenu(mnuCtxTree, new apf.divider({}), 700, plugin);
            menus.addItemToMenu(mnuCtxTree, new apf.item({
                match   : "file|folder",
                write   : true,
                command : "cut",
                caption : "Cut"
            }), 710, plugin);
            menus.addItemToMenu(mnuCtxTree, new apf.item({
                match   : "file|folder",
                write   : true,
                command : "copy",
                caption : "Copy"
            }), 720, plugin);
            menus.addItemToMenu(mnuCtxTree, new apf.item({
                match   : "clipboard",
                write   : true,
                command : "paste",
                caption : "Paste"
            }), 730, plugin);
            
            menus.addItemToMenu(mnuCtxTree, new apf.divider({}), 900, plugin);
            menus.addItemToMenu(mnuCtxTree, new apf.item({
                id      : "itemCtxTreeNewFile",
                match   : "file|folder|project",
                write   : true,
                caption : "New File",
                onclick : function(){ createFile(null, false, function(){}); }
            }), 910, plugin);
            menus.addItemToMenu(mnuCtxTree, new apf.item({
                match   : "file|folder|project",
                write   : true,
                caption : "New Folder",
                onclick : function(){ createFolder("New Folder", false, function(){}); }
            }), 920, plugin);
            
            container.setAttribute("contextmenu", mnuCtxTree);
            
            function updateTreeMenuItems(e) {
                if (!e.value)
                    return;
                
                var node = tree.selection.getCursor();
                var type = node && node.isFolder
                    ? node === tree.provider.projectDir
                    ? "project"
                    : "folder"
                    : "file";
                var hasNetwork = c9.has(c9.NETWORK);
                this.childNodes.forEach(function(item) {
                    var match = item.match;
                    var disabled = false;
                    if (!hasNetwork && !item.enableOffline) {
                        disabled = true;
                    }
                    else if (item.write == c9.readonly) {
                        disabled = true;
                    }
                    else if (match == "clipboard") {
                        disabled = !isClipboardAvailable({ type: item.command });
                    }
                    else if (match) {
                        disabled = match.indexOf(type) === -1;
                    }
                    item.setAttribute("disabled", disabled);
                });
            }
            mnuCtxTree.addEventListener("prop.visible", updateTreeMenuItems);
            mnuFilesSettings.addEventListener("prop.visible", updateTreeMenuItems);
            
            // Clipboard support
            function isClipboardAvailable(e){
                var cursor = tree.selection.getCursor();
                if (e.type == "cut")
                    return cursor && cursor.path != "/";
                var nodes = clipboard.clipboardData.getData("c9/tree-nodes");
                if (e.type == "clearcut")
                    return nodes.isCut;
                if (e.type == "paste")
                    return nodes && getSelectedFolder();
                return true;
            }
            function clearcut(){
                var nodes = clipboard.clipboardData.getData("c9/tree-nodes");
                if (!nodes) return false;
                
                nodes.forEach(function(node) {
                    node.isCut = false;
                });
                tree.provider.setAttribute(nodes, "isCut", false);
            }
            
            clipboard.registerHandler(container, {
                isClipboardAvailable: isClipboardAvailable,
                cut: function(e){
                    if (isClipboardAvailable({ type: "cut" })) {
                        clearcut();
                        var nodes = tree.selection.getSelectedNodes();
                        nodes.forEach(function(node) {
                            node.isCut = true;
                        });
                        tree.provider.setAttribute(nodes, "isCut", true);
                        clipboard.clipboardData.setData("c9/tree-nodes", nodes);
                    }
                },
                copy: function(e){
                    if (isClipboardAvailable({ type: "copy" })) {
                        clearcut();
                        clipboard.clipboardData.setData("c9/tree-nodes", tree.selection.getSelectedNodes());
                    }
                },
                paste: function(e){
                    if (isClipboardAvailable({ type: "paste" })) {
                        var nodes = clipboard.clipboardData.getData("c9/tree-nodes");
                        var target = getSelectedFolder();
                        if (nodes.isCut) {
                            clearcut();
                            move(nodes, target);
                        } else {
                            copy(nodes, target);
                        }
                    }
                },
                clearcut: function(e){
                    if (isClipboardAvailable({ type: "clearcut" })) {
                        clearcut();
                        return false;
                    }
                }
            });
            
            if (loadedSettings > 0)
                ready();
        }
    
        // Remove
        function remove(){
            if (!c9.has(c9.STORAGE))
                return false;
            
            var selection = tree.selection.getSelectedNodes();
            if (selection.indexOf(fsCache.model.projectDir) > -1) {
                alert(
                    "Cannot remove project folder",
                    "Unable to remove the project folder",
                    "The project folder can not be deleted. To delete this project go to the dashboard."
                );
                return false;
            }
            
            return confirmRemove(selection, function(file){
                if (file.isFolder)
                    fs.rmdir(file.path, {recursive: true}, function(){});
                else
                    fs.rmfile(file.path, function(){});
            });
        }
        
        // Move
        function move(files, to, options, cb){
            if (!c9.has(c9.STORAGE))
                return false;
            
            var overwrite = options && options.overwrite;
            var paths = [];
            var errors = [];
            var toOverwrite = [];
            var counter = 0;
            files.forEach(function(item){
                var path    = item.path;
                var name    = item.label;
                var parent  = to.path;
                var newpath = (parent + "/" + name).replace("//", "/");
                
                if (path === newpath)
                    return;
                
                paths.push(newpath);
                
                fs.rename(path, newpath, {overwrite: overwrite}, function(err, result) {
                    if (err) {
                        if (err.code == "EEXIST" && !overwrite)
                            toOverwrite.push(item);
                        else
                            errors.push(path);
                    }
                    if (++counter == paths.length)
                        done();
                });
            });
            
            function done() {
                if (toOverwrite.length && !overwrite) {
                    var item = toOverwrite[0];
                    confirmRename(
                        "File already exists",
                        "File already exists",
                        '"' + item.path + '" already exists, do you want to replace it? '
                            + "Replacing it will overwrite its current contents.",
                        function(all){ // Overwrite
                            var files = toOverwrite.splice(0, all ? toOverwrite.length : 1);
                            move(files, to, {overwrite: true});
                            done();
                        },
                        function(all){ // Skip
                            toOverwrite.splice(0, all ? toOverwrite.length : 1);
                            done();
                        },
                        { all: toOverwrite.length > 1 }
                    );
                }
                else if (errors.length) {
                    alert(
                        "cannot move files",
                        "cannot move files" + errors.join("\n"),
                        ""
                    );
                    cb && cb(errors);
                    errors = [];
                }
                else {
                    cb && cb();
                }
            }
            
            expandNode(findNode(to.path));
            selectList(paths);
            scrollToSelection();
            
            return false;
        }
        
        // Copy
        function copy(files, to, cb){
            if (!c9.has(c9.STORAGE))
                return false;
            
            var paths = [];
            var parentPaths = [];
            var count = 0;
            var total = files.length;
            var prevent;
            
            files.forEach(function(item){
                var path    = item.path;
                var name    = item.label;
                var parent  = to ? to.path : item.parent.path;
                var newpath = (parent + "/" + name).replace("//", "/");
                
                if (parentPaths.indexOf(parent) == -1)
                    parentPaths.push(parent);
                
                fs.copy(path, newpath, {
                    overwrite : false,
                    recursive : true
                }, function(err, data){
                    if (!err && data)
                        path = data.to;
                    
                    if (paths.indexOf(path) == -1)
                        paths.push(path);
                    if (++count == total && !prevent) {
                        selectList(paths);
                        scrollToSelection();
                        cb && cb(err, paths);
                    }
                });
                
                if (fsCache.findNode(newpath))
                    paths.push(newpath);
            });
            
            if (paths.length) {
                selectList(paths);
                scrollToSelection();
                paths = [];
            }
            
            parentPaths.forEach(function(p) {
                expandNode(findNode(p));
            })
            
            // Prevent selection if it changed in the mean time
            tree.on("changeSelection", function listen(){
                prevent = true;
                container.off("changeSelection", listen);
            });
            
            return false;
        }
        
        /***** Methods *****/
        
        function focus(){
            tree && tree.focus();
        }
        
        function scrollToSelection(){
            tree.renderer.scrollCaretIntoView(null, 0.5);
        }
        
        function scrollHandler() {
            showHideScrollPos = tree.provider.getScrollTop();
        
            // Set to -1 in case the user scrolls before the tree is done loading,
            // in which case we don't want to set the scroll pos to the saved one
            scrollPos = -1;
        
            if (!scrollTimer) {
                scrollTimer = setTimeout(function() {
                    settings.set("state/projecttree/@scrollpos", tree.provider.getScrollTop());
                    scrollTimer = null;
                }, 1000);
            }
        }
        
        function ready() {
            tree.setDataProvider(fsCache.model);
    
            if (loadedSettings === 1) {
                var done = function(){ loadedSettings = -1 };
                
                if (c9.connected) { //was c9.inited
                    setTimeout(function() {
                        loadProjectTree(null, done);
                    }, 200);
                }
                else {
                    loadProjectTree(null, done);
                }
            }
            else {
                var nodes = tree.provider.getChildren(tree.provider.root);
                for (var i = 0; i < nodes.length; i++) {
                    expand(nodes[i], function(){});
                }
            }
            refreshing = false;
        }

        /**
         * Loads the project tree based on expandedNodes, which is an array of
         * folders that were previously expanded, otherwise it contains only the
         * root identifier (i.e. c9.davPrefix)
         *
         * @param {Boolean}
         animateScrollOnFinish */
        function loadProjectTree(animateScrollOnFinish, callback) {
            var foldersLoaded = 0;
            var expandedNodes = Object.keys(expandedList);
            var count         = expandedNodes.length;

            if (!count)
                return callback && callback("Nothing to do");

            refreshing = true;
    
            // Sort the cached list so it's more probable that nodes near the top of
            // the tree are loaded first, giving the user more visual feedback that
            // something is happening
            expandedNodes.sort();
            
            function increment(){
                if (++foldersLoaded == count)
                    finish();
            }
    
            // todo this leaks event listener on refresh
            fsCache.on("orphan-append", function(e){
                if (expandedNodes.indexOf(e.path) > -1)
                    expandNode(fsCache.findNode(e.path));
            });

            // Load up the saved list of project tree folders in expandedNodes
            expandedNodes.forEach(function(path){
                var node = fsCache.findNode(path);
                if (node && node.status == "loaded") {
                    expandNode(node);
                    increment();
                    return;
                }
                
                fs.readdir(path, function(err, data) {
                    if (err) {
                        delete expandedList[path];
                        
                        changed = true;
                        settings.save();
                    }
                    else {
                        var node = fsCache.findNode(path);
                        if (node) //Otherwise orphan-append will pick it up
                            expandNode(node);
                    }
    
                    increment();
                });
            });
    
            // Called when every cached node has been loaded
            function finish() {
                // There is the possibility that we are calling this more than once | why?
                if (!refreshing)
                    return;
        
                refreshing = false;
    
                // Re-select the last selected item
                var selection = settings.getJson("state/tree_selection");
                if (selection && selection.length)
                    selectList(selection);
                else
                    tree.selection.selectNode(tree.getFirstNode());
    
                // Scroll to last set scroll pos
                if (scrollPos && scrollPos > -1) {
                    tree.provider.setScrollTop(scrollPos);
                    if (animateScrollOnFinish)
                        tree.renderer.animateScrolling(0);
                }
                
                end();
    
                function end(){
                    callback && callback();
                    settings.save();
                }
            }
        }

        /**
         * Called when the user hits the refresh button in the Project Files header
         */
        function refresh(fsNodes, callback){
            if (refreshing && fsNodes !== true)
                return false;
            
            emit("refresh");
            
            if (typeof fsNodes == "function") {
                callback = fsNodes;
                fsNodes  = null;
            }
            
            if (!fsNodes || fsNodes === true)
                fsNodes = Object.keys(expandedList);

            // When we clear the model below, it dispatches a scroll event which
            // we don't want to process, so remove that event listener
            tree.provider.off("changeScrollTop", scrollHandler);
            
            scrollPos = tree.provider.getScrollTop();
    
    
            fsNodes.forEach(function(node){
                if (typeof node == "string")
                    node = fsCache.findNode(node);

                if (node && node.status === "loaded") {
                    tree.provider.setAttribute(node, "status", "pending");
                    node.children = null;
                }
            });
            
            //c9.dispatchEvent("track_action", { type: "reloadtree" });
    
            loadProjectTree(true, function(err){
                var expandedNodes = Object.keys(expandedList);
                expandedList = {};
                
                expandedNodes.forEach(function(path){
                    var node = fsCache.findNode(path);
                    if (node) {
                        var id = node.path;
                        expandedList[id] = node;
                    }
                });
                callback(err);
                tree.provider.on("changeScrollTop", scrollHandler);
            });
        }
        
        function openSelection(){
            if (!c9.has(c9.STORAGE))
                return;
    
            var sel = tree.selection.getSelectedNodes();
            var main = tree.selection.getCursor();
            
            sel.forEach(function(node){
                if (!node || node.isFolder)
                    return;
    
                var pane = tabs.focussedTab && tabs.focussedTab.pane;
                if (tabs.getPanes(tabs.container).indexOf(pane) == -1)
                    pane = null;
    
                tabs.open({
                    path   : node.path,
                    pane   : pane,
                    noanim : sel.length > 1,
                    active : node === main,
                    focus  : node === main
                }, function(){});
            });
        }

        function expandAndSelect(path_or_node) {
            var node = findNode(path_or_node);
            expand(node, function(){
                tree.select(node);
            });
        }
        function expandNode(node){
            // Expand Node
            fsCache.model.expand(node);
        }
        
        function expand(node, callback) {
            var path;
            
            if (typeof node == "string") {
                path = node;
                node = fsCache.findNode(node);
            }
            if (!callback) callback = function() {};
            
            if (!node) {
                if (!path)
                    return callback(new Error("Missing Node"));

                fs.exists(path, function(exists){
                    if (!exists)
                        return callback(new Error("File Not Found"));
                    recur(node, path, callback);
                });
            }
            else {
                recur(node, node.path, callback);
            }
            
            function recur(node, path, next){
                // Break from loop
                if (path == -1)
                    return next();
                
                // Fetch Parent
                var ppath = dirname(path);
                var pnode = fsCache.findNode(ppath);
                
                if (path == ppath)
                    ppath = -1;
                
                // Next Loop
                recur(pnode, ppath, function(){
                    if (!node)
                        node = fsCache.findNode(path);
                    
                    // Node needs its files loaded
                    if (node.status === "pending") {
                        // We want to control the loading of the data
                        fsCache.model.setAttribute(node, "status", "loading");
                        
                        fs.readdir(path, function(err, files){
                            expandNode(node);
                            next();
                        });
                    }
                    // Node is already loading
                    else if (node.status === "loading") {
                        fs.on("afterReaddir", function listener(e){
                            if (e.path == node.path) {
                                fs.off("afterReaddir", listener);
                                expandNode(node);
                                next();
                            }
                        });
                    }
                    // Node is already loaded
                    else {
                        expandNode(node);
                        next();
                    }
                });
            }
        }
        
        function findNode(path_or_node) {
            return typeof path_or_node == "string"
                ? fsCache.findNode(path_or_node)
                : path_or_node;
        }
        
        function collapse(path_or_node) {
            fsCache.model.collapse(findNode(path_or_node));
        }
        
        function collapseAll(){
            Object.keys(expandedList).sort().reverse().forEach(function(path){
                collapse(path);
            });
        }
        
        function getAllExpanded(){
            return Object.keys(expandedList);
        }
        
        function select(path_or_node) {
            tree.select(findNode(path_or_node));
        }
        
        function selectList(list) {
            tree.selection.setSelection(list.map(findNode));
        }
        
        function _nextName(path) {
            return path.replace(/(?:\.([\d+]))?(\.[^\.\/\\]*)?$/, function(m, d, e){
                return "." + (parseInt(d, 10)+1 || 1) + (e ? e : "");
            });
        }
        
        function createFolder(dirname, noRename, callback, otherTree) {
            var node = getSelectedFolder();
            if (!node)
                return callback(new Error("Tree has no nodes"));
            
            if (!otherTree)
                otherTree = tree;
    
            var path  = (node.path + "/" + (dirname || "New Folder")).replace("//", "/");
            var count = 0;
    
            (function tryPath(path){
                fs.exists(path, function(exists) {
                    if (exists) {
                        path = _nextName(path);
                        return tryPath(path);
                    }
    
                    var newpath = path + (count ? "." + count : "");
                    
                    fs.mkdir(newpath, function(err, data){
                        if (err)
                            return callback(err);
                        
                        expandAndSelect(newpath);
                        
                        if (!noRename)
                            otherTree.edit.startRename(findNode(newpath));
                        
                        callback(err, data);
                    });
                });
            })(path);
        }

        function createFile(filename, noRename, callback) {
            var node = getSelectedFolder();
            if (!node)
                return callback(new Error("Tree has no nodes"));
    
            var path  = (node.path 
                + "/" + (filename || "Untitled" + defaultExtension)).replace(/\/\//g, "/");

            function tryPath(path){
                fs.exists(path, function(exists) {
                    if (exists) {
                        path = _nextName(path);
                        return tryPath(path);
                    }
    
                    var newpath = path;
                    
                    fs.writeFile(newpath, null, function(err, data){
                        if (err)
                            return callback(err);
                        
                        expandAndSelect(fsCache.findNode(newpath));
                        
                        if (!noRename)
                            tree.edit.startRename(findNode(newpath));
                        
                        callback(err, data);
                    });
                });
            }
            
            expand(dirname(path), function(){ tryPath(path); });
        }

        function getSelectedNode() {
            return tree && (tree.selection.getCursor() 
                || tree.getFirstNode()) || fsCache.findNode("/");
        }
        
        function getSelectedFolder() {
            var node = getSelectedNode();
            if (!node)
                return;
    
            if (!node.isFolder)
                node = node.parent;
            return node;
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("draw", function(e){
            draw(e);
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
         * The file tree plugin for Cloud9 IDE. This plugin allows a user to
         * view and edit files and folders.
         * 
         * If you are looking for an API to easily manipulate the files of
         * your workspace, then check out the {@link fs} plugin.
         * 
         * @singleton
         * @extends Panel
         */
        plugin.freezePublicAPI({
            /**
             * @property {Object}  tree The tree implementation
             * @private
             */
            get tree() { return tree; },
            /**
             * @property {String[]} selection  A list of paths of files that 
             * are selected.
             * @readonly
             */
            get selection() {
                return tree.selection.getSelectedNodes().map(function(node){
                    return node.path;
                });
            },
            /**
             * @property {String} selected  The path of the selected file 
             * that has the selection caret.
             * @readonly
             */
            get selected() { 
                var node = tree && (tree.selection.getCursor() || tree.getFirstNode());
                return node ? node.path : false;
            },
            /**
             * @property {fs.cache.Node[]} selectedNodes  A list of nodes of files that 
             * are selected.
             * @readonly
             */
            get selectedNodes() {
                return tree && tree.selection.getSelectedNodes() || [];
            },
            /**
             * @property {fs.cache.Node} selectedNode  The node representing the selected file 
             * that has the selection caret.
             * @readonly
             */
            get selectedNode() { 
                return tree && (tree.selection.getCursor() 
                    || tree.getFirstNode()) || null;
            },
            
            _events : [
                /**
                 * Fires when (a part of) the tree is being refreshed.
                 * @event refresh
                 */
                "refresh",
                /**
                 * Fires when the selection of the tree changes.
                 * @event select
                 * @param {Object}   e
                 * @param {String[]} e.paths  A list of paths of the selected 
                 *   files and folders.
                 * @param {fs.cache.Node[]} e.nodes  A list of nodes representing the selected 
                 *   files and folders.
                 */
                "select",
                /**
                 * Fires when a folder in the tree expands.
                 * @event expand
                 * @param {Object} e
                 * @param {String} e.path  The path of the expanded folder.
                 */
                "expand",
                /**
                 * Fires when a folder in the tree collapses.
                 * @event collapse
                 * @param {Object} e
                 * @param {String} e.path  The path of the collapsed folder.
                 */
                "collapse",
            ],

            /**
             * Retrieves the tree child node of the selected file
             */
            getSelectedNode: getSelectedNode,
            
            /**
             * Gives the tree focus
             */
            focus : focus,
            
            /**
             * Scrolls the selected item into the viewport.
             */
            scrollToSelection : scrollToSelection,
            
            /**
             * Refresh a (sub-)tree of the nodes in the tree by reading them
             * from disk again.
             * @param {String[]/Boolean} [paths]       A list of paths to refresh, 
             *   or `true` to refresh all the expanded folders.
             * @param {Function}         callback      Called when all folders are refreshed.
             * @param {Error}            callback.err  Error object if an error occured.
             */
            refresh : refresh,
            
            /**
             * Opens all selected files from the tree in the editor.
             */
            openSelection : openSelection,
            
            /**
             * Retrieves a list of paths of all the expanded folders
             * @return {String[]}
             */
            getAllExpanded : getAllExpanded,
            
            /**
             * Expands a tree node (if it has children).
             * @param {String}   path      The path of the folder to expand.
             * @param {Function} callback  Called when the folder is expanded.
             * @fires expand
             */
            expand : expand,
            
            /**
             * Expands all parent nodes and then select the child the path
             * points to.
             * @param {String}   path      The path of the folder to expand.
             */
            expandAndSelect : expandAndSelect,
            
            /**
             * Collapses a tree node (if it has children).
             * @param {String}   path      The path of the folder to collapse.
             * @param {Function} callback  Called when the folder is collapsed.
             * @fires collapse
             */
            collapse : collapse,
            
            /**
             * Collapse all expanded tree nodes.
             */
            collapseAll : collapseAll,
            
            /**
             * Selects a tree file or folder.
             * @param {String}   path      The path of the file or folder to select.
             */
            select : select,
            
            /**
             * Selects multiple file and/or folders.
             * @param {String[]} paths  The paths of the files and/or folders to select.
             */
            selectList : selectList,
            
            /**
             * Creates a folder below the current folder selected in the tree.
             * @param {String}   dirname        The name of the folder to create.
             * @param {Boolean}  noRename       Whether to give the user an option to rename the newly created folder.
             * @param {Function} callback       Called when the folder is created.
             * @param {Error}    callback.err   The error object, if an error occured.
             */
            createFolder : createFolder,
            
            /**
             * Creates a file below the current folder selected in the tree.
             * @param {String}   filename       The name of the file to create.
             * @param {Boolean}  noRename       Whether to give the user an option to rename the newly created file.
             * @param {Function} callback       Called when the folder is created.
             * @param {Error}    callback.err   The error object, if an error occured.
             */
            createFile : createFile,

            // needed for tests
            // TODO add documentation or remove
            /**
             * @ignore
             */
            copy : copy,
            /**
             * @ignore
             */
            move : move,
            /**
             * @ignore
             */
            getSelectedFolder : getSelectedFolder,
            
            /**
             * @see newresource#defaultExtension
             * @ignore
             */
            set defaultExtension(extension) {
                defaultExtension = extension ? "." + extension : "";
            }
        });
        
        register(null, {
            tree: plugin
        });
    }
});