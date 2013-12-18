define(function(require, exports, module) {
    main.consumes = ["Previewer", "ui"];
    main.provides = ["preview.raw"];
    return main;

    function main(options, imports, register) {
        var Previewer = imports.Previewer;
        var ui        = imports.ui;
        
        /***** Initialization *****/
        
        var plugin = new Previewer("Ajax.org", main.consumes, {
            caption  : "Raw Content (UTF-8)", 
            index    : 100,
            selector : function(path){
                return path.match(/(?:\.txt)$/);
            }
        });
        
        var drawn = false;
        function draw(){
            if (drawn) return;
            drawn = true;
            
            var css = ".rawview{\
                position : absolute;\
                left : 0;\
                top : 0;\
                right : 0;\
                bottom : 0;\
                color : #f1f1f1;\
                overflow : auto;\
                margin : 0;\
                padding : 10px;\
                background-color : rgb(42, 58, 45);\
            }\
            .rawview::selection { background: #748512; }\
            .rawview::-moz-selection { background: #748512; }";
            
            ui.insertCss(css, plugin);
        
            // emit("draw");
        }
        
        /***** Methods *****/
        
        function update(e){
            var session = plugin.activeSession;
            session.pre.innerHTML = session.previewTab
                ? (session.previewTab.document.value || "").replace(/</g, "&lt;")
                : "[Please Open Document To Display In Raw Viewer]";
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            
        });
        plugin.on("documentLoad", function(e){
            var doc     = e.doc;
            var session = doc.getSession();
            var editor  = e.editor;
            
            draw();
            
            var pre = document.createElement("pre")
            pre.className = "rawview";
            
            // Append PRE element
            session.pre    = editor.container.appendChild(pre);
            session.editor = editor;
            
            // Hack to get text selection enabled
            var container = editor.getElement("container");
            container.$isTextInput = function(){ return true };
            container.disabled     = false;
        });
        plugin.on("documentUnload", function(e){
            var doc     = e.doc;
            var pre = doc.getSession().pre;
            pre.parentNode.removeChild(pre);
        });
        plugin.on("documentActivate", function(e){
            var session = e.doc.getSession();
            
            session.pre.style.display = "block";
            session.editor.setLocation(session.path);
            session.editor.setButtonStyle("Raw Content (UTF-8)", "page_white.png");
        });
        plugin.on("documentDeactivate", function(e){
            var session = e.doc.getSession();
            session.pre.style.display = "none";
        });
        plugin.on("navigate", function(e){
            var tab     = plugin.activeDocument.tab;
            var session = plugin.activeSession;
            
            tab.title    = 
            tab.tooltip  = "[R] " + e.url;
            session.editor.setLocation(e.url);
            
            update();
        });
        plugin.on("update", update);
        plugin.on("reload", update);
        plugin.on("enable", function(){
            
        });
        plugin.on("disable", function(){
            
        });
        plugin.on("unload", function(){
            drawn  = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * Previewer for UTF-8 content.
         **/
        plugin.freezePublicAPI({
        });
        
        register(null, {
            "preview.raw": plugin
        });
    }
});