define(function(require, exports, module) {
    main.consumes = ["Plugin", "layout.preload", "c9", "ui", "dialog.alert", "settings"];
    main.provides = ["layout"];
    return main;

    function main(options, imports, register) {
        var c9       = imports.c9;
        var alert    = imports["dialog.alert"].show;
        var Plugin   = imports.Plugin;
        var ui       = imports.ui;
        var settings = imports.settings;
        var preload  = imports["layout.preload"];
        
        var markup   = require("text!./layout.xml");
        
        // pre load themes
        require("text!./themes/default-dark.less");
        require("text!./themes/default-white.less");
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit   = plugin.getEmitter();
        
        var dashboardUrl = options.dashboardUrl || "/dashboard.html";
        
        var logobar, error;
        var c9console, menus, tabManager;
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            settings.on("read", function(){
                settings.setDefaults("user/general", [["skin", "dark"]]);
                
                var theme = settings.get("user/general/@skin");
                
                if (theme !== "dark" && theme !== "white")
                    theme = "dark";
                
                // Load CSS
                if (ui.packed) {
                    ui.insertCss(preload.getTheme(theme), false, plugin);                    
                }
                else {
                    ui.defineLessLibrary(require("text!./themes/default-" + theme + ".less"), plugin);
                    ui.defineLessLibrary(require("text!./less/lesshat.less"), plugin);
                    
                    ui.insertCss(require("text!./keyframes.css")
                      .replace(/@\{image-path\}/g, options.staticPrefix + "/images"), 
                      false, plugin);
                    
                    if (options.devel) {
                        ui.insertCss(require("text!./less/main.less"), 
                            options.staticPrefix, plugin);
                    }
                    else {
                        ui.insertCss(require("text!./compile_dark.css"), 
                            false, plugin);
                    }
                }
            });
            
            draw();
        }
        
        var drawn = false;
        function draw(){
            if (drawn) return;
            drawn = true;
            
            if (apf.isGecko) {
                var img = options.staticPrefix + "/images/gecko_mask.png";
                document.body.insertAdjacentHTML("beforeend", '<svg xmlns="http://www.w3.org/2000/svg">'
                    + '<defs>'
                        + '<mask id="tab-mask-left" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">'
                            + '<image width="46px" height="24px" xlink:href="' + img + '" x="1px"></image>'
                        + '</mask>'
                        + '<mask id="tab-mask-right" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">'
                            + '<image width="46px" height="24px" xlink:href="' + img + '" x="-28px"></image>'
                        + '</mask>'
                    + '</defs>'
                + '</svg>');
                
                var svg = document.body.lastChild;
                plugin.addOther(function(){
                    svg.parentNode.removeChild(svg);
                });
            }
            
            // Load the skin
            ui.insertSkin({
                "data"       : require("text!./skins.xml"),
                "media-path" : options.staticPrefix + "/images/",
                "icon-path"  : options.staticPrefix + "/icons/"
            }, plugin);
            
            // Create UI elements
            ui.insertMarkup(null, markup, plugin);
            
            var hboxMain = plugin.getElement("hboxMain");
            var colRight = plugin.getElement("colRight");
            hboxMain.$handle.setAttribute("id", "splitterPanelLeft");
            colRight.parentNode.$handle.setAttribute("id", "splitterPanelRight");
            plugin.addElement(hboxMain.$handle);
            plugin.addElement(colRight.parentNode.$handle);

            // Intentionally global
            window.sbShared = plugin.getElement("sbShared");
            
            //update c9 main logo link
            logobar = plugin.getElement("logobar");
            if (c9.hosted) {
                var mainlogo = logobar.$ext.getElementsByClassName('mainlogo');
                if (mainlogo && (mainlogo = mainlogo[0])) {
                    mainlogo.title     = "back to dashboard";
                    mainlogo.href      = dashboardUrl;
                    mainlogo.innerHTML = "Dashboard";
                }
            }
            
            // Offline
            // preload the offline images programmatically:
            [
                "offline.png", "close_tab_btn.png", "local_green.png"
            ].forEach(function(p){
                var img = new Image();
                img.src = options.staticPrefix + "/images/offline.png";
            });
            
            var divIndicator = document.querySelector(".c9-offline");
            divIndicator.addEventListener("click", function(){
                alert("Offline Notication", "You are currently offline.", 
                  "This indicator notifies you that Cloud9 is unable to reach "
                  + "the server. This usually happens because you are offline. "
                  + "Some features will be disabled until the "
                  + "network connection becomes available again. "
                  + "This notication could also show when the server is "
                  + "unreachable due to other reasons. Sometimes a refresh of "
                  + "the tab will fix an issue. Please e-mail "
                  + "support@c9.io for further problem resolution.");
            }, false);
            
            c9.on("stateChange", function(e){
                // Online
                if (e.state & c9.NETWORK && e.state & c9.STORAGE)
                    apf.setStyleClass(logobar.$ext, "", ["offline"]);
                // Offline
                else
                    apf.setStyleClass(logobar.$ext, "offline");
            });
            
            window.addEventListener("resize", resize);
            
            emit("draw");
        }
        
        /***** Methods *****/
        
        function findParent(obj, where){
            if (obj.name == "menus") {
                menus = obj;
                return plugin.getElement("logobar");
            }
            if (obj.name == "save") 
                return plugin.getElement("barTools");
            if (obj.name == "run.gui") 
                return plugin.getElement("barTools");
            else if (obj.name == "console") {
                c9console = obj;
                return  plugin.getElement("consoleRow");
            }
            else if (obj.name == "tabManager") {
                tabManager = obj;
                return  plugin.getElement("colMiddle");
            }
            else if (obj.name == "area-left")
                return plugin.getElement("colLeft")
            else if (obj.name == "area-right")
                return plugin.getElement("colRight")
            else if (obj.name == "preview")
                return  plugin.getElement("barTools");
            else if (obj.name == "runpanel")
                return  plugin.getElement("barTools");
            else if (obj.name == "findinfiles")
                return  plugin.getElement("searchRow");
            else if (obj.name == "findreplace")
                return  plugin.getElement("searchRow");
            else if (obj.name == "help")
                return  plugin.getElement("barExtras");
            else if (obj.name == "preferences")
                return  plugin.getElement("barExtras");
            else if (obj.name == "dragdrop")
                return  plugin.getElement("colMiddle");
        }
        
        function initMenus(menus){
            // Menus
            menus.setRootMenu("File", 100, plugin);
            menus.setRootMenu("Edit", 200, plugin);
            menus.setRootMenu("Find", 300, plugin);
            menus.setRootMenu("View", 400, plugin);
            menus.setRootMenu("Goto", 500, plugin);
            // run plugin adds: menus.setRootMenu("Run", 600, plugin);
            menus.setRootMenu("Tools", 700, plugin);
            menus.setRootMenu("Window", 800, plugin);
            
            menus.addItemByPath("File/~", new apf.divider(), 1000000, plugin);

            if (!c9.local) {
                menus.addItemByPath("File/Quit Cloud9 IDE", new apf.item({
                    onclick : function(){
                        location.href = "http://c9.io";
                    }
                }), 2000000, plugin);
            }
    
            menus.addItemByPath("View/~", new apf.divider(), 9999, plugin);
        }
        
        function showError(message){
            // Error message container
            if (!error) {
                error = document.body.appendChild(document.createElement("div"));
                error.className = "errorlabel";
                error.addEventListener("mouseup", function(e){
                    if (e.target.tagName == "U")
                        hideError();
                })
            }
            error.innerHTML     = "<div><u class='close'></u>" + message + "</div>";
            error.style.display = "block";
            error.style.top     = (-1 * error.offsetHeight - 10) + "px";
            
            // Start anim
            setTimeout(function(){
                error.className = "errorlabel anim";
                error.style.top = 0;
            }, 10);
        }
        
        function hideError(){
            error.className = "errorlabel anim";
            error.style.top = (-1 * error.offsetHeight - 10) + "px";
            setTimeout(function(){ error.style.display = "none"; }, 220);
        }
        
        function resize(){
            if (c9console && tabManager) {
                var tRect = tabManager.container.$ext.getBoundingClientRect();
                var cRect = c9console.container.$ext.getBoundingClientRect();
                
                if (cRect.top - tRect.top < 30) {
                    c9console.container.setAttribute("height", window.innerHeight - tRect.top - 30);
                }
            }
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
            window.removeEventListener("resize", resize);
        });
        
        /***** Register and define API *****/
        
        /**
         * Manages the layout of the Cloud9 UI. 
         * 
         * If you wish to build your own IDE, with a completely different 
         * layout (for instance for a tablet or phone) reimplement this plugin.
         * This plugin is capable of telling plugins where to render.
         * 
         * The layout plugin also provides a way to display error messages to
         * the user.
         * 
         * @singleton
         **/
        plugin.freezePublicAPI({
            /**
             * Returns an AMLElement that can server as a parent.
             * @param {Plugin} plugin  The plugin for which to find the parent.
             * @param {String} where   Additional modifier to influence the decision of the layout manager.
             * @return {AMLElement}
             */
            findParent : findParent,
            
            /**
             * Initializes the main menus
             * This method is called by the menus plugin.
             * @private
             */
            initMenus : initMenus,
            
            /**
             * Displays an error message in the main error reporting UI.
             * @param {String} message  The message to display.
             */
            showError : showError,
            
            /**
             * Hides the main error reporting UI.
             */
            hideError : hideError
        });
        
        register(null, {
            layout: plugin
        });
    }
});