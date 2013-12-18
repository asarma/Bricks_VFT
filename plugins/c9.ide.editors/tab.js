define(function(require, module, exports) {
    main.consumes = ["Plugin", "ui", "Document", "dialog.alert"];
    main.provides = ["Tab"];
    return main;

    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var Document = imports.Document;
        var ui       = imports.ui;
        
        var counter = 0;
        
        var stylesheet = ui.createStylesheet();
        
        function Tab(options){
            var editorType, doc, path, amlPane, init, active, fg, bg,
                title, tooltip, amlTab, closed, rule;
            var meta = {};
            
            var name = options.name;
            if (name && name.match(/(\d+)$/))
                counter = Math.max(counter, parseInt(RegExp.$1, 10)) + 1;
            
            var className = {
                names: [],
                add: function(name){
                    var idx = this.names.indexOf(name);
                    if (idx > -1) return;
                    this.names.push(name);
                    amlTab && amlTab.setAttribute("class", this.names.join(" "));
                },
                remove: function(){
                    for (var i = 0, l = arguments.length; i < l; i++) {
                        var idx = this.names.indexOf(arguments[i]);
                        if (idx > -1)
                            this.names.splice(idx, 1);
                    }
                    amlTab && amlTab.setAttribute("class", this.names.join(" "));
                }
            }
            
            function initStyleSheet(fg, bg){
                var cssClass = plugin.name.replace(/[^a-zA-Z0-9\-_\u00A0-\uFFFF]/g, "-");
                className.add(cssClass);
                
                rule = "." + cssClass + ".curbtn .tab_middle, ." 
                     + cssClass + ".curbtn .tab_middle::after, ." 
                     + cssClass + ".curbtn .tab_middle::before";
                     
                ui.importStylesheet([
                    [rule, "background-color:" + (bg || "inherit") + ";"
                     + "color:" + (fg || "inherit") + ";"]
                ], window, stylesheet);
            }
            
            /***** Initialization *****/
            
            var plugin = new Plugin("Ajax.org", main.consumes);
            var emit   = plugin.getEmitter();
            
            var loaded;
            function load(){
                if (loaded) return;
                loaded = true;

                // Create Tab
                amlTab = new ui.page({
                    id          : path || plugin.name,
                    type        : "editor::" + editorType,
                    autofocus   : false,
                    tooltip     : tooltip,
                    caption     : title,
                    tab         : plugin,
                    focussable  : true,
                    $focussable : true
                });
                
                plugin.addElement(amlTab);
                
                // Hack to get activate event in
                var activate = amlTab.$activate;
                amlTab.$activate = function(){
                    activate.apply(amlTab, arguments);
                    emit("activate");
                }
                
                amlTab.$doc = doc; // Backwards compatibility??
                amlTab.cloud9tab = plugin;
                
                // Connect to the document
                doc.tab = plugin;
                
                if (amlPane) {
                    if (init)
                        amlPane.setAttribute("buttons", "close");
            
                    attachTo(amlPane.cloud9pane, null, options.noanim);
                    
                    if (init)
                        amlPane.setAttribute("buttons", "close,scale,order");
                }
                
                // Activate tab if necessary
                if (active) {
                    if (amlPane)
                        amlPane.set(path || amlTab);
                    else {
                        amlTab.on("DOMNodeInsertedIntoDocument", function insert(e){
                            amlTab.parentNode.set(amlTab);
                            amlTab.off("DOMNodeInsertedIntoDocument", insert);
                        })
                    }
                }
                
                init   = false;
                active = false;
            }
            
            /***** Methods *****/
            
            function getState(filter){
                var state = {
                    type        : "tab",
                    name        : plugin.name,
                    path        : path,
                    document    : doc.getState(filter),
                    editorType  : editorType,
                    active      : isActive()
                }
                
                emit("getState", { state : state });
                
                return state;
            }
            
            function setState(state){
                if (state.pane)
                    amlPane = state.pane.aml;
                    
                init   = state.init;
                doc    = new Document(state.document);
                active = state.active;

                if (loaded && active)
                    activate();
                
                plugin.editorType  = state.editorType;
                plugin.path        = state.path;
                plugin.className   = state.className;
                plugin.title       = doc.title || "";
                plugin.tooltip     = doc.tooltip;
                
                doc.on("setTitle", function(e){
                    plugin.title = e.title;
                });
                doc.on("setTooltip", function(e){
                    plugin.tooltip = e.tooltip;
                });
            }
            
            function isActive(){
                return amlPane ? amlPane.getPage() == amlTab : options.active;
            }
            
            function activate(){
                amlPane.set(amlTab);
            }
            
            function beforeClose(e) {
                return emit("beforeClose", e);
            }
            
            function attachTo(t, nextSibling, noAnim){
                if (t.aml.localName != "tab")
                    throw new Error("Incorrect Element: " + t.aml.localName);
                
                amlPane = t.aml;
                var lastPane = amlTab.parentNode;
                
                emit("reparent", { 
                    lastPane : lastPane && lastPane.cloud9pane,
                    pane     : t
                });

                if (lastPane != amlPane)
                    amlPane.skipAnimOnce = noAnim;
                amlPane.insertBefore(amlTab, nextSibling && nextSibling.aml);
                
                apf.setStyleClass(amlPane.$ext, "", ["empty"]);
                if (lastPane && !lastPane.childNodes.length)
                    apf.setStyleClass(lastPane.$ext, "empty");
            }
            
            function switchEditor(type, callback){
                if (editorType == type)
                    return;
        
                // var lastType = tab.editorType;
                amlPane.cloud9pane.createEditor(type, function(err, editor){
                    var info = {};
                    if (editor.isValid(amlTab.document, info) === false) {
                        alert(
                            info.title || "Could not switch editor",
                            info.head || "Could not switch editor because this document is invalid.",
                            info.message || "Please fix the error and try again."
                        );
                        return;
                    }
            
                    editorType = type;
                    amlTab.setAttribute("type", "editor::" + type);
                    
                    if (amlPane.getPage() == amlTab) {
                        amlPane.activatepage = -1;
                        amlPane.set(amlTab);
                    }
                    
                    callback();
                });
            }
            
            //@todo Explain difference with unload in docs
            function close(noAnim){
                amlPane.remove(amlTab, null, noAnim);
            }
            
            /***** Lifecycle *****/
            
            plugin.on("load", function(){ 
                load();
            });
            
            plugin.on("unload", function(e){ 
                closed = true;
                
                //If there are no more pages left, reset location
                var last = amlPane.getPages().length === 0;
                if (last)
                    apf.setStyleClass(amlPane.$ext, "empty");

                loaded = false;

                emit("close", {last: last, htmlEvent: e && e.htmlEvent});
            });
            
            /***** Register and define API *****/
            
            /**
             * Tab Class for Cloud9 IDE Panes. Each file that is opened
             * in an editor has a tab object that allows a user to activate the
             * document in an editor in a pane. Tabs can be moved between
             * panes using drag&drop and key bindings.
             * 
             * The tab relates to other objects as such:
             * 
             * * {@link Pane} - Represent a single pane, housing multiple tabs
             *   * **Tab - A single tab (button) in a pane**
             *     * {@link Editor} - The editor responsible for displaying the file in the tab
             *     * {@link Document} - The representation of a file in the tab
             *       * {@link Session} - The session information of the editor
             *       * {@link UndoManager} - The object that manages the undo stack for this document
             * 
             * Panes can live in certain areas of Cloud9. By default these areas are:
             * 
             * * {@link panes}      - The main area where editor panes are displayed
             * * {@link console}    - The console in the bottom of the screen
             * 
             * Tabs are managed by the {@link tabManager}. The default way to
             * open a new file in an editor uses the tabManager:
             * 
             *     tabManager.openFile("/file.js", true, function(err, tab){
             *         console.log("The tab title is: ", tab.title);
             *     });
             */
            plugin.freezePublicAPI({
                /**
                 * The APF UI element that is presenting the tab in the UI.
                 * This property is here for internal reasons only. *Do not 
                 * depend on this property in your plugin.*
                 * @property {AMLElement} aml
                 * @private
                 * @readonly
                 */
                get aml(){ return amlTab; },

                /**
                 * The pane that this tab belongs to. This property changes when
                 * a tab is moved to another pane.
                 * @property {Pane} pane
                 * @readonly
                 */
                get pane(){ return amlPane.cloud9pane; },
                /** 
                 * The document loaded in this tab. This property is always the
                 * same object.
                 * @property {Document} document
                 * @readonly
                 */
                get document(){ return doc; },
                /**
                 * Retrieves the meta object for this panel
                 * @property {Object} meta
                 */
                get meta(){ return meta; },
                /** 
                 * The path to the file loaded into this tab. This property will
                 * be undefined when no path is set (for instance when no file
                 * was loaded to create this tab).
                 * @property {String} path
                 */
                get path(){ return path || undefined; },
                set path(v){ 
                    var oldpath = path;
                    path = v;
                    emit("setPath", {path: path, oldpath: oldpath});
                },
                /** 
                 * The type of the editor shown in this tab. 
                 * 
                 * See also {@link Editor#type}
                 * 
                 * @property {String} editorType
                 */
                get editorType(){ 
                    return editorType;
                },
                set editorType(type){ 
                    editorType = type;
                    amlTab && amlTab.setProperty("type", "editor::" + type);
                },
                /** 
                 * The title (or caption) of the tab button
                 * @property {String} title
                 */
                get title(){ 
                    return title; 
                },
                set title(value){ 
                    title = value;
                    amlTab && amlTab.setProperty("caption", value);
                },
                /** 
                 * The value of this property is displayed when hovering the
                 * mouse over the tab button.
                 * @property {String} tooltip
                 **/
                get tooltip(){ 
                    return tooltip; 
                },
                set tooltip(value){ 
                    tooltip = value;
                    amlTab && amlTab.setProperty("tooltip", value);
                },
                /**
                 * The background color of the tab button and it's body. It is
                 * recommended to use the "rgb(r,g,b)" format. To get a light 
                 * text color use tab.className.add("dark") to specify a dark 
                 * backgroundColor is used.
                 * @property {String} backgroundColor
                 */
                get backgroundColor(){ return bg },
                set backgroundColor(v){
                    bg = v;
                    if (!rule) 
                        return initStyleSheet(fg, bg);
                    ui.setStyleRule(rule, "background-color", bg, stylesheet);
                },
                /**
                 * The foreground color of the tab button and it's body. It is
                 * recommended to use the "rgb(r,g,b)" format. In most cases
                 * this property doesn't have to be set. To get a light text
                 * color use tab.className.add("dark") to specify a dark 
                 * backgroundColor is used.
                 * @property {String} backgroundColor
                 */
                get foregroundColor(){ return bg },
                set foregroundColor(v){
                    fg = v;
                    if (!rule) 
                        return initStyleSheet(fg, bg);
                    ui.setStyleRule(rule, "color", fg, stylesheet);
                },
                /** 
                 * @property {Object}   className               Object that 
                 *   manages the class names of the tab button. Often used 
                 *   class names are "loading", "saving", "error".
                 * @property {Function} className.add           Adds a new class name to the tab button.
                 * @property {String}   className.add.name      The name of the class to add.
                 * @property {Function} className.remove        Removes a class name from the tab button.
                 * @property {String}   className.remove.name   The name of the class to remove.
                 * @readonly
                 */
                get className(){ 
                    return className;
                },
                /**
                 * Specifies whether this tab is the active tab within the panel
                 * @property {Boolean} active
                 * @readonly
                 */
                get active(){ 
                    return amlPane.getPage() == amlTab;
                },
                /**
                 * Specifies the editor that is displayed by this tab. 
                 * 
                 * Note that this property changes when the tab is moved to a
                 * different pane. An editor is connected to a pane and thus
                 * when this tab is moved to a pane this property will be set to
                 * the editor of that pane.
                 * 
                 * @property {Editor} editor
                 * @readonly
                 */
                get editor(){
                    if (amlPane.$amlDestroyed) 
                       return false;
                    
                    var editorTab = amlPane.getPage("editor::" + editorType);
                    
                    // During destroy of pane, a tab that used to have an editor
                    // can find itself without one. There is only one way to 
                    // detect that, which is when this getter returns false
                    if (!editorTab) 
                        return false;
                        
                    return editorTab.editor;
                },
                
                _events : [
                    /**
                     * Fires before the tab is closed
                     * @event beforeClose
                     * @cancellable
                     */
                    "beforeClose",
                    /**
                     * Fires when this tab becomes the active tab of it's pane parent
                     * @event activate
                     */
                    "activate",
                    /**
                     * Fires when the state of this tab is retrieved
                     * @event getState
                     * @param {Object} e
                     * @param {Object} e.state  The state of the tab, it's document and underlying objects.
                     */
                    "getState",
                    /**
                     * Fires when the path of this tab is updated. This happens
                     * when the {@link Tab#path} property is set (i.e.
                     * when the file that has opened this tab is renamed).
                     * @event setPath
                     * @param {Object} e
                     * @param {String} e.path     The new path for this tab
                     * @param {String} e.oldpath  The path that this tab had prior to setting the new path
                     */
                    "setPath",
                    /**
                     * Fires
                     * @event reparent
                     * @param {Object} e
                     * @param {Pane}   e.lastPane  The previous pane that this tab was part of
                     * @param {Pane}   e.pane      The pane this tab is moved to
                     */
                    "reparent",
                    /**
                     * @event close Fires when this tab closes
                     * @param {Object}  e
                     * @param {Boolean} e.last  Specifies whether this tab was 
                     *   the last tab of the pane to be closed 
                     *   (e.g. the pane has no tabs left).
                     */
                    "close"
                ],
                
                /**
                 * Sets this tab as the active tab on it's pane
                 */
                activate   : activate,
                
                /**
                 * Checks whether this tab is actve in it's pane
                 * @return {Boolean}
                 */
                isActive   : isActive,
                
                /**
                 * Retrieves the state of the tab. 
                 * 
                 * @return {Object}
                 * @return {String}  [return.type="tab"]  This is always the string "tab"
                 * @return {String}  return.name          The {@link Plugin#name} name of the tab plugin
                 * @return {String}  return.path          The path of this tab
                 * @return {Object}  return.document      The returned object of {@link Document#getState}.
                 * @return {String}  return.editorType    The {@link Editor#type} of the editor
                 * @return {Boolean} return.active        Specifies whether the tab was active when the state was retrieved.
                 */
                getState   : getState,
                
                /**
                 * Moves this tab to a pane
                 * @param {Pane} pane          The pane to move this tab to.
                 * @param {Tab}  [nextSibling] The tab that will be on the right of this tab after it has been inserted.
                 */
                attachTo   : attachTo,
                
                /**
                 * Changes the editor that is used to display the content of
                 * the document of this tab to another editor. This can be 
                 * useful when multiple editors can display the same content
                 * (i.e. displaying an image in a hex editor).
                 * 
                 * @param {String}   editorType  Specifies the {@link Editor#type} of the editor to switch to
                 * @param {Function} callback
                 */
                switchEditor : switchEditor,
                
                /**
                 * Closes this tab. Closing a tab will destroy all it's content
                 * and state.
                 */
                close : close,
                
                /**
                 * @ignore
                 */
                beforeClose : beforeClose
            });
            
            if (options)
                setState(options);
            
            plugin.load(name || "tab" + counter++);
            
            return plugin;
        }
        
        /***** Register and define API *****/
        
        register(null, {
            Tab: Tab
        })
    }
});