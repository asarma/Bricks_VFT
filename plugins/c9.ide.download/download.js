define(function(require, exports, module) {
    "use strict";
    
    main.consumes = [
        "Plugin", "c9", "ui", "menus", "tree", "info", "vfs"
    ];
    main.provides = ["download"];
    return main;
    
    function main(options, imports, register) {
        var Plugin        = imports.Plugin;
        var ui            = imports.ui;
        var c9            = imports.c9;
        var menus         = imports.menus;
        var tree          = imports.tree;
        var vfs           = imports.vfs;
        var info          = imports.info;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);

        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            menus.addItemByPath("File/Download Project", new ui.item({
                onclick : downloadProject
            }), 390, plugin);
            
            // Context Menu
            tree.getElement("mnuCtxTree", function(mnuCtxTree){
                menus.addItemToMenu(mnuCtxTree, new ui.item({
                    match   : "folder|project",
                    caption : "Download",
                    onclick : download
                }), 140, plugin);
            });
        }
        
        function download() {
            if (!c9.has(c9.STORAGE))
                return;
                
            var node = tree.selectedNode;
            if (!node) return;
            
            if (node.isFolder && node.path == "/")
                downloadProject();
            else if (node.isFolder)
                downloadFolder(node.path);
            else
                downloadFile(node.path);
            
        }
        
        function downloadProject() {
            vfs.download("/", info.getWorkspace().name + ".zip");
        }

        function downloadFolder(path) {
            vfs.download(path.replace(/\/*$/, "/"));
        }
        
        function downloadFile(path) {
            vfs.download(path.replace(/\/*$/, ""));
        }
                
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        
        
        /***** Register and define API *****/
        
        plugin.freezePublicAPI({
            
        });
        
        register(null, {
            download: plugin
        });
    }
});