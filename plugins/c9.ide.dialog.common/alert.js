define(function(require, module, exports) {
    main.consumes = ["Dialog", "util"];
    main.provides = ["dialog.alert"];
    return main;
    
    function main(options, imports, register) {
        var Dialog = imports.Dialog;
        var util   = imports.util;
        
        /***** Initialization *****/
        
        var plugin = new Dialog({
            name       : "dialog.alert",
            allowClose : true,
            modal      : true,
            elements   : [
                { type: "button", id: "ok", caption: "OK", "default": true, onclick: function(){ plugin.hide() } }
            ]
        });
        
        /***** Methods *****/
        
        function show(title, header, msg, onhide){
            return plugin.queue(function(){
                if (header === undefined) {
                    plugin.title = "Notice";
                    header = title;
                    msg = msg || "";
                }
                else {
                    plugin.title   = title;
                }
                plugin.heading = util.escapeXml(header);
                plugin.body    = util.escapeXml(msg)
                    .replace(/(\w*@\w*\.\w*)/g, "<a href='mailto:$1'>$1</a>");
                
                plugin.once("hide", function(){
                    onhide && onhide();
                });
            });
        }
        
        /***** Register *****/
        
        /**
         *
         */
        plugin.freezePublicAPI({
            /**
             * Show an alert dialog.
             * 
             * @param {String} [title]     The title to display
             * @param {String} header      The header to display
             * @param {String} [msg]       The message to display
             * @param {Function} [onhide]  The function to call after it's closed.
             */
            show : show
        });
        
        register("", {
            "dialog.alert": plugin
        });
    }
});