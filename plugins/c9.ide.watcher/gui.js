define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "fs", "settings", "preferences", "watcher", "tabManager", 
        "save", "dialog.question", "dialog.filechange", "threewaymerge"
    ];
    main.provides = ["watcher.gui"];
    return main;

    function main(options, imports, register) {
        var Plugin        = imports.Plugin;
        var watcher       = imports.watcher;
        var prefs         = imports.preferences;
        var fs            = imports.fs;
        var save          = imports.save;
        var settings      = imports.settings;
        var tabManager    = imports.tabManager;
        var question      = imports["dialog.question"];
        var filechange    = imports["dialog.filechange"];
        var threeWayMerge = imports.threewaymerge.merge;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit   = plugin.getEmitter();
        
        var removedPaths, changedPaths;
        
        var deleteDialog;
        var changeDialog;
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            removedPaths = {};
            changedPaths = {};
    
            // Settings and preferences
    
            settings.on("read", function(e){
                settings.setDefaults("user/general", [
                    ["automerge", "false"],
                    ["confirmmerge", "true"]
                ]);
            });
            
            prefs.add({
                "General" : {
                    "General" : {
                        "Enable Auto-Merge" : {
                            type         : "checkbox",
                            path         : "user/general/@automerge",
                            min          : "1",
                            max          : "64",
                            tooltip      : "Whenever the file watcher detects a "
                                + "file change on disk, 'auto merge' will fetch "
                                + "the contents from disc and merges it with "
                                + "the version in the editor.",
                            position     : 2200
                        }
                    }
                }
            }, plugin);
            
            // Watch for new documents and hook their value initialization
            
            function initializeDocument(doc){
                doc.meta.$savedValue = doc.recentValue;
                doc.on("setValue", function(e){
                    doc.meta.$savedValue = e.value;
                }, plugin);
            }
            
            tabManager.getTabs().forEach(function(tab){
                if (!tab.path)
                    return;
                
                if (tab.document.undoManager.isAtBookmark()) {
                    initializeDocument(tab.document);
                }
                else {
                    console.error("Unsupported state");
                }
            });
            
            tabManager.on("open", function(e){
                initializeDocument(e.tab.document);
            }, plugin);
            
            // Hook the save of the document value
            
            save.on("beforeSave", function(e){
                e.document.meta.$savingValue = e.save;
                
                // I assume here that this call is non-intrusive
                watcher.watch(e.path);
            }, plugin);
            
            save.on("afterSave", function(e){
                if (!e.err)
                    e.document.meta.$savedValue = e.document.meta.$savingValue;
                delete e.document.meta.$savingValue;
            }, plugin);
    
            // Hook watcher events
            
            // Update a file
            watcher.on("change", function(e){
                var tab = tabManager.findTab(e.path);
                if (tab)
                    addChangedTab(tab);
            });
            
            // Directory watcher is not needed if the normal watcher works
            // watcher.on("directory", function(e){
            //     var base  = e.path;
            //     var files = e.files;
            // 
            //     // Rename all tabs
            //     tabManager.getTabs().forEach(function(tab){
            //         if (tab.path && tab.path.indexOf(base) == 0) {
            //             // If the file is gone, lets notify the user
            //             if (files.indexOf(tab.path) == -1) {
            //                 resolveFileDelete(tab);
            //             }
            //         }
            //     });
            // });
            
            watcher.on("delete", function(e){
                var tab = tabManager.findTab(e.path);
                if (tab)
                    addDeletedTab(tab);
            });
        }
        
        /***** Methods *****/
        
        function addChangedTab(tab, force){
            if (!force && changedPaths[tab.path]) {
                if (changedPaths[tab.path].data)
                    changedPaths[tab.path].dirty = true;
                return;
            }
            
            changedPaths[tab.path] = { tab: tab };
            
            // If the terminal is currently focussed, lets wait until 
            // another tab is focussed
            if (tabManager.focussedTab 
              && tabManager.focussedTab.editorType == "terminal") {
                tabManager.once("focus", function(){
                    addChangedTab(tab, true);
                });
                return;
            }
            
            function resolve() {
                delete changedPaths[path];
            }

            var doc  = tab.document;
            var path = tab.path;
            
            function dialog(data){
                // Changed Path
                changedPaths[tab.path].data = data;
                
                if (changeDialog) {
                    // The dialog is visible
                    if (changeDialog.visible === 1) {
                        question.applyall = true;
                        return;
                    }
                    // The dialog still is to become visible
                    else if (changeDialog.visible === undefined) {
                        changeDialog.on("show", function(){
                            question.applyall = true;
                        });
                        return;
                    }
                }
                
                // Show dialog
                showChangeDialog();
            }
            
            fs.readFile(path, function(err, data) {
                if (err)
                    return dialog();

                // false alarm. File content didn't change
                if (data === doc.meta.$savedValue)
                    return resolve();

                // short cut: remote value is the same as the current value
                if (data === doc.value) { // Expensive check
                    
                    // Update saved value
                    doc.meta.$savedValue = data;
                    
                    // Remove the changed state from the document
                    doc.undoManager.bookmark();
                    
                    // Mark as resolved
                    resolve();
                    
                    return;
                }
                
                if (automerge(tab, data))
                    resolve();
                else
                    dialog(data);
            });
        }
        
        function automerge(tab, data){
            if (!settings.getBool("user/general/@automerge"))
                return false;
                
            return merge(tab, data);
        }
        
        function merge(tab, data) {
            if (tab.editor.type != "ace")
                return false;
            
            var doc  = tab.document;
            var root = doc.meta.$savedValue;
            
            if (typeof root !== "string")
                return false;
            
            var aceDoc      = doc.getSession().session.doc;
            var mergedValue = threeWayMerge(root, data, aceDoc);
            
            doc.meta.$savedValue = mergedValue;
            
            // If the value on disk is the same as in the document, set the bookmark
            if (mergedValue == data) {
                doc.undoManager.once("change", function(){
                    doc.undoManager.bookmark();
                });
            }
            
            return true;
        }
        
        function getLatestValue(path, callback){
            if (changedPaths[path].dirty || !changedPaths[path].data) {
                fs.readFile(path, function(err, data){
                    callback(err, path, data)
                });
            }
            else {
                callback(null, path, changedPaths[path].data)
            }
        }
        
        function updateChangedPath(err, path, data){
            var doc = changedPaths[path].tab.document;
            doc.setBookmarkedValue(data, true);
            doc.meta.timestamp = Date.now() - settings.timeOffset;
            delete changedPaths[path];
        }
        
        function mergeChangedPath(err, path, data){
            merge(changedPaths[path].tab, data);
            delete changedPaths[path];
        }
        
        function showChangeDialog(tab, data) {
            var path, merge;
            
            if (!tab) {
                for (path in changedPaths) {
                    tab  = changedPaths[path].tab;
                    data = changedPaths[path].data;
                    break;
                }
                if (!tab) return;
            }
            
            // Focus the tab that is changed
            tabManager.focusTab(tab);
            
            path  = tab.path;
            merge = tab.document.changed 
              && typeof tab.document.meta.$savedValue === "string";
            
            function no(all) { // Local | No
                if (all) {
                    for (var id in changedPaths) {
                        changedPaths[id].tab.document.undoManager.bookmark(-2);
                    }
                    changedPaths = {};
                }
                else {
                    changedPaths[path].tab.document.undoManager.bookmark(-2);
                    delete changedPaths[path];
                    showChangeDialog();
                }
            }
            
            function yes(all) { // Remote | Yes
                if (all) {
                    for (var id in changedPaths) {
                        getLatestValue(id, updateChangedPath);
                    }
                }
                else {
                    getLatestValue(path, function(err, path, data){
                        updateChangedPath(err, path, data);
                        showChangeDialog();
                    });
                }
            }
            
            if (merge) {
                changeDialog = filechange.show(
                    "File Changed",
                    path + " has been changed on disk.",
                    no,
                    yes,
                    function(all) { // Merge
                        if (all) {
                            askAutoMerge();
        
                            for (var id in changedPaths) {
                                getLatestValue(id, mergeChangedPath);
                            }
                        }
                        else {
                            askAutoMerge();
        
                            getLatestValue(path, function(err, path, data){
                                mergeChangedPath(err, path, data);
                                showChangeDialog();
                            });
                        }
                    },
                    { 
                        merge    : true,
                        applyall : Object.keys(changedPaths).length > 1
                    }
                );
            }
            else {
                changeDialog = question.show(
                    "File Changed",
                    path + " has been changed on disk.",
                    "Would you like to reload this file?",
                    yes, no, {
                        all : Object.keys(changedPaths).length > 1
                    }
                );
            }
        }
        
        function addDeletedTab(tab, force){
            if (!force && removedPaths[tab.path])
                return;
            
            removedPaths[tab.path] = tab;
            
            // If the terminal is currently focussed, lets wait until 
            // another tab is focussed
            if (tabManager.focussedTab 
              && tabManager.focussedTab.editorType == "terminal") {
                tabManager.once("focus", function(){
                    addDeletedTab(tab, true);
                });
                return;
            }

            if (deleteDialog) {
                // The dialog is visible
                if (deleteDialog.visible === 1) {
                    question.all = true;
                    return;
                }
                // The dialog still is to become visible
                else if (deleteDialog.visible === undefined) {
                    deleteDialog.on("show", function(){
                        question.all = true;
                    });
                    return;
                }
            }
            
            // Show dialog
            showDeleteDialog(tab);
        }
        
        function showDeleteDialog(tab){
            var path;
            if (!tab) {
                for (path in removedPaths) {
                    tab = removedPaths[path];
                    break;
                }
                if (!tab) return;
            }
            
            // Focus the tab that is to be deleted
            tabManager.focusTab(tab);
            
            path = tab.path;

            deleteDialog = question.show(
                "File removed, keep tab open?",
                path + " has been deleted, or is no longer available.",
                "Do you wish to keep the file open in the editor?",
                function(all) { // Yes
                    var doc;
                    
                    if (all) {
                        for (var id in removedPaths) {
                            doc = removedPaths[id].document;
                            doc.undoManager.bookmark(-2);
                            doc.meta.newfile = true;
                        }
                        removedPaths = {};
                    }
                    else {
                        doc = removedPaths[path].document;
                        doc.undoManager.bookmark(-2);
                        doc.meta.newfile = true;
                        delete removedPaths[path];
                        showDeleteDialog();
                    }
                },
                function(all, cancel) { // No
                    if (all) {
                        for (var id in removedPaths) {
                            closeTab(removedPaths[id], true);
                        }
                        removedPaths = {};
                    }
                    else {
                        closeTab(removedPaths[path]);
                        delete removedPaths[path];
                        showDeleteDialog();
                    }
                },
                { all: Object.keys(removedPaths).length > 1 }
            );
            
            deleteDialog.on("show", function(){
                if (!tabManager.findTab(path))
                    return false;
            });
        }
        
        function closeTab(tab, noAnim){
            // Close file without a check
            tab.document.meta.$ignoreSave = true;
            tab.close(noAnim);
            
            // Remove the flag for the case that the doc is restored
            delete tab.document.meta.$ignoreSave;
        }

        function askAutoMerge() {
            if (!settings.getBool("user/general/@confirmmerge"))
                return;

            question.show(
                "Always merge?",
                "Always merge on file changes?",
                "Enabling 'auto merge' makes it very easy to collaborate on "
                  + "files with other people, especially when combined with "
                  + "'auto save'. This setting can be controlled from the "
                  + "settings panel as well.",
                function() { // on yes
                    if (question.dontAsk)
                        settings.set("user/general/@confirmmerge", "false");
                    settings.set("user/general/@automerge", "true");
                },
                function() { // on no
                    if (question.dontAsk)
                        settings.set("user/general/@confirmmerge", "false");
                    settings.set("user/general/@automerge", "false");
                },
                { showDontAsk: true }
            );
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
         * 
         */
        plugin.freezePublicAPI({
            
        });
        
        register(null, {
            "watcher.gui": plugin
        });
    }
});