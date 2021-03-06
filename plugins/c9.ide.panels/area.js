define(function(require, module, exports) {
    main.consumes = ["Plugin", "layout", "settings", "anims", "ui"];
    main.provides = ["panels.Area"];
    return main;

    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var layout   = imports.layout;
        var anims    = imports.anims;
        var ui       = imports.ui;
        var settings = imports.settings;
        
        var BARWIDTH = 36;
        var WIDTH    = 200;
        var CURWIDTH = 0;

        function Area(where, defaultActive, panels, emit){
            var plugin = new Plugin("Ajax.org", main.consumes);
            
            var query         = "state/panels/@width-" + where;
            var activePanel   = null;
            
            var column, lastPanel, bar, splitter;
            
            function getElement(name){
                var panel = panels.panels[name];
                return panel && panel.aml;
            }

            var drawn = false;
            function draw(){
                if (drawn) return bar;
                drawn = true;

                emit("draw");

                column = layout.findParent(plugin, where);
                bar    = column.appendChild(new ui.bar({ "skinset" : "panels" }));
                plugin.addElement(bar);
                
                column.setWidth(CURWIDTH);
                column.setAttribute("class", where);
                column.show();

                var name = "splitterPanel" + where.uCaseFirst();
                splitter = layout.getElement(name);
                splitter.on("dragdrop", function(e){
                    if (!activePanel)
                        return;

                    var width = column.getWidth() - CURWIDTH;

                    if (settings.get(query) != width)
                        settings.set(query, width);
                });
                splitter.hide();
                
                bar.hide();

                return bar;
            }

            function animate(fromName, toName, toWidth){
                var win      = getElement(fromName);
                var toWin    = getElement(toName);
                var autohide = fromName && panels.panels[fromName].autohide;
                
                if (win === toWin && win)
                    return;

                column.setAttribute("minwidth", CURWIDTH);

                var onfinish = function(){
                    setTimeout(function(){
                        if (toWin) {
                            toWinExt.style.zIndex = zIndex2;
                            toWinExt.style[where] = CURWIDTH + "px";
                            toWinExt.style.minWidth = "";
                            toWinExt.style.maxWidth = "";
                            
                            if (where == "right")
                                toWinExt.style.left = "0";

                            // column.setAttribute("minwidth", toWin.minwidth + CURWIDTH);
                        }
                        else {
                            column.setWidth(CURWIDTH);
                        }
                        if (win) {
                            winExt.style.zIndex = zIndex;
                            win.$ext.style[where] = CURWIDTH + "px";
                            win.$ext.style.minWidth = "";
                            win.hide();
                        }
                    }, 100);

                    emit("afterAnimate");
                };

                if (toWin) {
                    var toWinExt = toWin.$altExt || toWin.$ext;
                    var zIndex2 = toWinExt.style.zIndex;
                    toWinExt.style.zIndex = 2000;
                    toWin.show();
                }

                var anim = {
                    duration       : 0.15,
                    timingFunction : "cubic-bezier(.10, .10, .25, .90)"
                };

                if (win) {
                    var winExt = win.$altExt || win.$ext;
                    var zIndex = winExt.style.zIndex;
                    var diff, width;

                    if (toWin) {

                        // Hide over the other
                        if (autohide) {
                            winExt.style.zIndex = 3000;

                            diff = apf.getWidthDiff(winExt);
                            width = winExt.offsetWidth - diff;
                            winExt.style.minWidth = width + "px";
                            winExt.style.maxWidth = width + "px";
                            if (where == "right")
                                winExt.style.left = "";
                            anim[where] = (CURWIDTH - win.getWidth() - 1) + "px";
                            anims.animate(win, anim, onfinish);
                        }
                        // Show over the other
                        else {
                            winExt.style.zIndex = 1000;

                            diff = apf.getWidthDiff(winExt);
                            width = winExt.offsetWidth - diff;
                            toWinExt.style.minWidth = width + "px";
                            toWinExt.style.maxWidth = width + "px";
                            if (where == "right")
                                toWinExt.style.left = "";
                            toWinExt.style[where]  = (CURWIDTH - win.getWidth()) + "px";
                            anim[where] = CURWIDTH + "px";
                            anims.animate(toWin, anim, onfinish);
                        }
                    }

                    // Hide
                    else {
                        winExt.style.minWidth = (winExt.offsetWidth - apf.getWidthDiff(winExt)) + "px";
                        winExt.style[where] = ""; //CURWIDTH + "px";
                        anim.width = CURWIDTH + "px";
                        anims.animateSplitBoxNode(column, anim, onfinish);
                    }
                }

                // Show
                else {
                    toWin.show();
                    column.show();

                    toWinExt.style.minWidth = (toWidth - apf.getWidthDiff(toWinExt) - CURWIDTH) + "px";
                    toWinExt.style[where] = ""; //CURWIDTH + "px";
                    anim.width = toWidth + "px";
                    anims.animateSplitBoxNode(column, anim, onfinish);
                }
            }

            function activate(name, noAnim, viaButton){
                if (activePanel == name)
                    return;

                draw();

                var panel = panels.panels[name];
                // old settings can try to activate panel at the wrong area
                // todo should we change area based on setting?
                if (!panel || panel.area !== plugin)
                    return;
                
                lastPanel = activePanel;
                if (activePanel && (activePanel != name))
                    deactivate(true, noAnim === true);

                var width = (settings.getNumber("state/panels/@width-" + where)
                    || panel.width || WIDTH) + CURWIDTH;
                    
                var firstTime = panel.draw();

                if (noAnim || !settings.getBool('user/general/@animateui')) {
                    column.show();
                    column.setAttribute("minwidth", panel.minWidth + CURWIDTH);
                    column.setWidth(width);
                    getElement(name).show();

                    emit("animate", {noanim : true, toWidth: width});
                }
                else if (!noAnim) {
                    if (firstTime) {
                        setTimeout(function(){
                            animate(lastPanel, name, width);
                        });
                    }
                    else {
                        animate(lastPanel, name, width);
                    }
                }

                activePanel = name;

                emit("showPanel" + name.uCaseFirst(), { 
                    lastPanel : lastPanel,
                    button    : viaButton
                });

                if (!panel.autohide)
                    settings.set("state/panels/@active-" + where, name);

                splitter.show();
            }

            function deactivate(admin, noAnim, viaButton){
                if (!activePanel)
                    return;

                var animSetting = settings.getBool('user/general/@animateui');

                if (!admin) {
                    if (animSetting) {
                        noAnim = 0;
                        animate(activePanel);
                    }
                    else {
                        column.setWidth(CURWIDTH);
                        anims.emitAnimate({noanim : true});
                    }
                }

                if (noAnim !== 0 && (!admin || !animSetting))
                    getElement(activePanel).hide();

                emit("hidePanel" + activePanel.uCaseFirst(), {
                    button : viaButton
                });

                activePanel = null;

                if (!admin) {
                    settings.set("state/panels/@active-" + where, "none");
                    splitter.hide();
                }
            }

            function toggle(name, autohide, viaButton){
                // If this is the current panel, deactivate it
                if (activePanel != name)
                    activate(name, null, viaButton);

                // If this is an autohiding panel, activate the last panel
                else if (autohide && lastPanel)
                    activate(lastPanel, null, viaButton);

                // Else deactivate the active panel
                else
                    deactivate(null, null, viaButton);
            }

            function enablePanel(name){
                var panel = panels.panels[name];
                CURWIDTH = BARWIDTH;

                draw();

                if (!bar.visible) {
                    if (panels.areas[panel.where].activePanel == name) {
                        getElement(name).$ext.style[where] = CURWIDTH + "px";
                        column.setWidth(column.width + CURWIDTH);
                        activate(name, true);
                    }
                    else {
                        column.setAttribute("minwidth", CURWIDTH);
                        column.setWidth(CURWIDTH);
                    }

                    bar.show();
                    column.show();
                }
                
                panel.enable();
                
                settings.set("state/panels/panel[@name='" 
                    + panel.name + "']/@enabled", "true");
            }

            function disablePanel(name){
                var panel = panels.panels[name];
                panel.disable();

                // Detect whether all buttons are hidden
                var hideBar  = bar.childNodes.every(function(x){
                    return !x.visible;
                });

                if (hideBar)
                    CURWIDTH = 0;

                var animating;
                if (panels.areas[panel.where].activePanel == name) {
                    animating = true;
                    panels.areas[panel.where].deactivate();
                }

                // If all buttons are invisible, hide bar
                if (hideBar) {
                    setTimeout(function(){
                        bar.hide();
                        column.hide();
                    }, animating ? 150 : 0);
                }

                settings.set("state/panels/panel[@name='" 
                    + panel.name + "']/@enabled", "false");
            }

            /**
             * Area class for the {@link Panel panels}. Panels are located in 
             * different areas. By default these areas are on the left and 
             * right of the screen.
             * 
             * * {@link panels} - Manages all areas and panels
             *   * **Area - Manages a single area of panels. 
             *   By default there is a panel area on the left and on the right side 
             *   of the UI.**
             *     * {@link Panel} - A single panel that lives in an area.
             * 
             * In this example we'll fetch the name of the active panel on the
             * right side and hide it:
             * 
             *     var activePanel = panels.areas.right.activePanel;
             *     panels.deactivate(activePanel);
             * 
             * @class panels.Area
             */
            plugin.freezePublicAPI({
                /**
                 * @property {String} activePanel  The name of the active panel in this area, if any.
                 * @readonly
                 */
                get activePanel(){ return activePanel; },
                /**
                 * @property {String} defaultActive  The name of the panel that is active by default in this area.
                 * @readonly
                 */
                get defaultActive(){ return defaultActive; },
                /**
                 * @property {HTMLElement} container  The html element that is the containing element of the area.
                 * @readonly
                 */
                get container(){ return column.$ext; },
                /**
                 * The APF UI element that is presenting the area in the UI.
                 * This property is here for internal reasons only. *Do not 
                 * depend on this property in your plugin.*
                 * @property {AMLElement} aml
                 * @private
                 * @readonly
                 */
                get aml(){ return column; },
                /**
                 * @property {Number} width  The width in pixels of this area
                 * @readonly
                 */
                get width(){ return CURWIDTH; },

                /**
                 * @ignore
                 */
                draw         : draw,
                
                /**
                 * Toggles the activity state of a panel
                 * @param {String} name  The name of the panel to toggle
                 */
                toggle       : toggle,
                /**
                 * Activates a panel, showing it as the only visible
                 * panel in it's area.
                 * @param {String} name  The name of the panel to activate
                 * @private
                 */
                activate     : activate,
                /**
                 * Deactivates the active panel of this area.
                 * @private
                 */
                deactivate   : deactivate,
                /**
                 * Add the button to it's button bar. If the bar was hidden, the
                 * bar is shown.
                 * @param {String} name  The name of the panel to enable.
                 * @private
                 */
                enablePanel  : enablePanel,
                /**
                 * Remove the button from it's button bar. If the bar is empty, the
                 * bar is hidden.
                 * @param {String} name  The name of the panel to disable.
                 * @private
                 */
                disablePanel : disablePanel
            });
            
            plugin.load("area-" + where);
            
            return plugin;
        }
        
        /***** Register and define API *****/
        
        register(null, {
            "panels.Area": Area
        })
    }
});
