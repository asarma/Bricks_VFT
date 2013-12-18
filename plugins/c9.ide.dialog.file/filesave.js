define(function(require, module, exports) {
    main.consumes = [
        "Plugin", "ui", "fs", "dialog.alert", "fs.cache", "util", "Dialog"
    ];
    main.provides = ["dialog.filesave"];
    return main;
    
    function main(options, imports, register) {
        var Plugin  = imports.Plugin;
        var Dialog  = imports.Dialog;
        var util    = imports.util;
        var ui      = imports.ui;
        var fs      = imports.fs;
        var fsCache = imports["fs.cache"];
        var alert   = imports["dialog.alert"].show;
        
        var Tree       = require("ace_tree/tree");
        var TreeEditor = require("ace_tree/edit");
        
        var join     = require("path").join;
        var basename = require("path").basename;
        var dirname  = require("path").dirname;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit   = plugin.getEmitter();
        
        var dialog, container, btnChoose, btnCancel, btnCreateFolder;
        var txtFilename, txtDirectory, cbShowFiles, tree;
        
        var loaded;
        function load(){
            if (loaded) return;
            loaded = true;
            
        }
    
        var drawn = false;
        function draw(htmlNode){
            if (drawn) return;
            drawn = true;
            
            // Markup
            ui.insertMarkup(null, require("text!./filesave.xml"), plugin);
            
            // CSS
            ui.insertCss(require("text!./filesave.css"), plugin);
            
            dialog          = plugin.getElement("window");
            container       = plugin.getElement("container");
            btnChoose       = plugin.getElement("btnChoose");
            btnCancel       = plugin.getElement("btnCancel");
            btnCreateFolder = plugin.getElement("btnCreateFolder");
            cbShowFiles     = plugin.getElement("cbShowFiles");
            txtFilename     = plugin.getElement("txtFilename");
            txtDirectory    = plugin.getElement("txtDirectory");
            
            btnCreateFolder.on("click", function(){
                imports.tree.createFolder(null, null, function(){
                    
                }, tree);
            });
            
            txtFilename.on("keyup", function(e){
                if (e.keyCode == 13) {
                    btnChoose.dispatchEvent("click");
                }
            });
            
            txtDirectory.on("keyup", function(e){
                if (e.keyCode == 13) {
                    imports.tree.expandAndSelect(txtDirectory.value);
                }
            });
            
            // Insert File Tree
            // @todo abstract this from the file tree plugin
            tree = new Tree(container.$int);
            tree.renderer.setScrollMargin(10, 10);
            tree.renderer.setTheme({cssClass: "filetree"});
            tree.setDataProvider(fsCache.model);
            fsCache.model.rowHeight = 21;
            fsCache.model.rowHeightInner = 20;
            fsCache.model.indent = 12;
            fsCache.model.getIconHTML = function(node) {                
                var icon = node.map ? "folder" : util.getFileIcon(node.label);
                if (node.status === "loading") icon = "loading";
                return "<span class='filetree-icon " + icon + "'></span>";
            };
            
            tree.edit = new TreeEditor(tree);
            
            tree.renderer.on("scrollbarVisibilityChanged", updateScrollBarSize);
            tree.renderer.on("resize", updateScrollBarSize);
            function updateScrollBarSize() {
                var w = tree.renderer.scrollBarV.getWidth();
                tree.renderer.scroller.style.right = Math.max(w, 10) + "px";
            };
            
            tree.on("changeSelection", function(e) {
                var selected = tree.selection.getCursor();
                if (selected) {
                    plugin.directory = selected.isFolder
                        ? selected.path : dirname(selected.path);
                    if (!selected.isFolder)
                        plugin.filename = basename(selected.path);
                }
            });
            
            tree.on("afterChoose", function(e) {
                
            });
            
            dialog.on("prop.visible", function(e){
                if (e.value) emit("show");
                else emit("hide");
            });
            
            emit("draw", null, true);
        }
        
        /***** Method *****/
        
        function queue(implementation, force){
            if (!plugin.loaded) 
                return;
            
            return Dialog.addToQueue(dialog, function(next){
                // Draw everything if needed
                draw();
                
                // Call the show implementation
                implementation(next);
                
                // Show UI
                dialog.show();
            }, force);
        }
        
        function show(title, path, onChoose, onCancel, options){
            queue(function(next){
                plugin.title     = title || "Save As";
                plugin.filename  = path ? basename(path) : "";
                plugin.directory = path ? dirname(path) : "/";
                
                var createFolderButton = options && options.createFolderButton;
                var showFilesCheckbox  = options && options.showFilesCheckbox;
                
                var choosen = false;
                btnChoose.onclick = function(){ 
                    var path = join(plugin.directory, plugin.filename);
                    
                    if (!path)
                        return alert("Invalid Path", "Invalid Path", 
                            "Please choose a correct path and filename");
                    
                    fs.exists(path, function (exists, stat) {
                        if (stat
                          && (/(directory|folder)$/.test(stat.mime) || stat.link 
                          && /(directory|folder)$/.test(stat.linkStat.mime))) {
                            // @todo
                            // var node = fsCache.findNode(path);
                            // trSaveAs.select(node);
                            // if (trSaveAs.selected == node) {
                            //     txtSaveAs.setValue("");
                            //     expand(node);
                            // }
                            return;
                        }
                        
                        choosen = true;
                        onChoose(path, stat || false, function(){
                            dialog.hide();
                        });
                    });
                };
                btnCancel.onclick = function(){ dialog.hide(); }
                
                btnCreateFolder.setAttribute("visible", 
                    createFolderButton !== false);
                cbShowFiles.setAttribute("visible", 
                    showFilesCheckbox !== false);
                
                // @todo options.hideTree
                // @todo options.showFiles
                // @todo options.showHiddenFiles
                
                plugin.once("hide", function(){
                    if (!choosen)
                        onCancel();
                    next();
                });
            });
        }
        
        function hide(){
            dialog && dialog.hide();
        }
        
        /***** Register and define API *****/
        
        /**
         * 
         */
        plugin.freezePublicAPI({
            /**
             * The APF element that is the parent to all form elements.
             * @property {AMLElement} aml
             * @private
             * @readonly
             */
            get aml(){ return dialog; },
            
            /**
             * 
             */
            get title(){ },
            set title(value){
                if (drawn)
                    dialog.setAttribute("title", value);
            },
            /**
             * 
             */
            get filename(){ return txtFilename.value; },
            set filename(value){
                if (drawn)
                    txtFilename.setAttribute("value", value);
            },
            /**
             * 
             */
            get directory(){ return txtDirectory.value; },
            set directory(value){
                if (drawn)
                    txtDirectory.setAttribute("value", value);
            },
            
            _events : [
                /**
                 * Fires when the form is drawn.
                 * @event draw
                 */
                "draw",
                /**
                 * Fires when the form becomes visible. This happens when
                 * it's attached to an HTML element using the {@link #attachTo}
                 * method, or by calling the {@link #method-show} method.
                 * @event show
                 */
                "show",
                /**
                 * Fires when the form becomes hidden. This happens when
                 * it's detached from an HTML element using the {@link #detach}
                 * method, or by calling the {@link #method-hide} method.
                 * @event hide
                 */
                "hide"
            ],

            /**
             * Show the form. This requires the form to be 
             * {@link #attachTo attached} to an HTML element.
             * @fires show
             */
            show : show,

            /**
             * Hide the form.
             * @fires hide
             */
            hide : hide
        });
        
        register("", {
            "dialog.filesave" : plugin
        });
    }
});