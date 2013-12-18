/**
 * Tab Behaviors for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "settings", "menus", "preferences", "commands", 
        "tabManager", "ui", "save", "panels", "tree", "Menu", "fs",
        "dialog.filechange"
    ];
    main.provides = ["tabbehavior"];
    return main;
    
    //@todo collect closed pages in mnuEditors

    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var settings = imports.settings;
        var tabs     = imports.tabManager;
        var menus    = imports.menus;
        var Menu     = imports.Menu;
        var commands = imports.commands;
        var tree     = imports.tree;
        var save     = imports.save;
        var panels   = imports.panels;
        var ui       = imports.ui;
        var fs       = imports.fs;
        var prefs    = imports.preferences;
        var confirm  = imports["dialog.filechange"].show;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit   = plugin.getEmitter();
        
        var mnuContext, mnuEditors, mnuTabs;
        var menuItems = [], menuClosedItems = [];
        
        var accessedTab = 0;
        
        var paneList     = [];
        var accessedPane = 0;
        
        var cycleKey     = apf.isMac ? 18 : 17;
        var paneCycleKey = 192;
        
        var cycleKeyPressed, changedTabs, unchangedTabs, dirtyNextTab;

        var ACTIVEPAGE      = function(){ return tabs.focussedTab; };
        var ACTIVEPATH      = function(){ return (tabs.focussedTab || 1).path; };
        var MORETABS        = function(){ return tabs.getTabs().length > 1 };
        var MORETABSINPANE  = function(){ return tabs.focussedTab && tabs.focussedTab.pane.getTabs().length > 1 };
        var MOREPANES       = function(){ return tabs.getPanes().length > 1 };
        
        var movekey = "Command-Option-Shift";
        var definition = [
            ["closetab",       "Option-W",         "Alt-W",           ACTIVEPAGE, "close the tab that is currently active"],
            ["closealltabs",   "Option-Shift-W",   "Alt-Shift-W",     ACTIVEPAGE, "close all opened tabs"],
            ["closeallbutme",  "Option-Ctrl-W",    "Ctrl-Alt-W",      MORETABS,  "close all opened tabs, except the tab that is currently active"],
            ["gototabright",   "Command-]",        "Ctrl-]",          MORETABSINPANE,  "navigate to the next tab, right to the tab that is currently active"],
            ["gototableft",    "Command-[",        "Ctrl-[",          MORETABSINPANE,  "navigate to the next tab, left to the tab that is currently active"],
            ["movetabright",   movekey + "-Right", "Ctrl-Meta-Right", MORETABS,  "move the tab that is currently active to the right. Will create a split tab to the right if it's the right most tab."],
            ["movetableft",    movekey + "-Left",  "Ctrl-Meta-Left",  MORETABS,  "move the tab that is currently active to the left. Will create a split tab to the left if it's the left most tab."],
            ["movetabup",      movekey + "-Up",    "Ctrl-Meta-Up",    MORETABS,  "move the tab that is currently active to the up. Will create a split tab to the top if it's the top most tab."],
            ["movetabdown",    movekey + "-Down",  "Ctrl-Meta-Down",  MORETABS,  "move the tab that is currently active to the down. Will create a split tab to the bottom if it's the bottom most tab."],
            ["tab1",           "Command-1",        "Ctrl-1",          null,       "navigate to the first tab"],
            ["tab2",           "Command-2",        "Ctrl-2",          null,       "navigate to the second tab"],
            ["tab3",           "Command-3",        "Ctrl-3",          null,       "navigate to the third tab"],
            ["tab4",           "Command-4",        "Ctrl-4",          null,       "navigate to the fourth tab"],
            ["tab5",           "Command-5",        "Ctrl-5",          null,       "navigate to the fifth tab"],
            ["tab6",           "Command-6",        "Ctrl-6",          null,       "navigate to the sixth tab"],
            ["tab7",           "Command-7",        "Ctrl-7",          null,       "navigate to the seventh tab"],
            ["tab8",           "Command-8",        "Ctrl-8",          null,       "navigate to the eighth tab"],
            ["tab9",           "Command-9",        "Ctrl-9",          null,       "navigate to the ninth tab"],
            ["tab0",           "Command-0",        "Ctrl-0",          null,       "navigate to the tenth tab"],
            ["revealtab",      "Command-Shift-L",  "Ctrl-Shift-L",    ACTIVEPATH, "reveal current tab in the file tree"],
            ["nexttab",        "Option-Tab",       "Ctrl-Tab",        MORETABSINPANE,  "navigate to the next tab in the stack of accessed tabs"],
            ["previoustab",    "Option-Shift-Tab", "Ctrl-Shift-Tab",  MORETABSINPANE,  "navigate to the previous tab in the stack of accessed tabs"],
            ["nextpane",       "Option-ESC",         "Ctrl-`",          MOREPANES,   "navigate to the next tab in the stack of panes"],
            ["previouspane",   "Option-Shift-ESC",   "Ctrl-Shift-`",    MOREPANES,   "navigate to the previous tab in the stack of panes"],
            ["closealltotheright", "", "", function(){
                var tab = mnuContext.$tab || mnuContext.$pane && mnuContext.$pane.getTab();
                if (tab) {
                    var pages = tab.pane.getTabs();
                    return pages.pop() != tab;
                }
            }, "close all tabs to the right of the focussed tab"],
            ["closealltotheleft", "", "", function(){
                var tab = mnuContext.$tab || mnuContext.$pane && mnuContext.$pane.getTab();
                if (tab) {
                    var pages = tab.pane.getTabs();
                    return pages.length > 1 && pages[0] != tab;
                }
            }, "close all tabs to the left of the focussed tab"],
            ["closepane", "Command-Ctrl-W", "Ctrl-W", function(){
                return mnuContext.$tab || tabs.getPanes().length > 1;
            },  "close all tabs in this pane"],
            ["hsplit",     "", "", null, "split the current pane horizontally and move the active tab to it"],
            ["vsplit",     "", "", null, "split the current pane horizontally and move the active tab to it"],
            ["twovsplit",  "", "", null, "create a two pane vertical layout"],
            ["twohsplit",  "", "", null, "create a two pane horizontal layout"],
            ["foursplit",  "", "", null, "create a four pane layout"],
            ["threeleft",  "", "", null, "create a three pane layout with the stack on the left side"],
            ["threeright", "", "", null, "create a three pane layout with the stack on the right side"]
        ];
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            // Settings
            settings.on("read", function(e){
                settings.setDefaults("user/general", [["revealfile", false]]);
                
                var list = settings.getJson("state/panecycle");
                if (list) {
                    list.remove(null);
                    paneList = list;
                }
            });
            
            settings.on("write", function(e){
                var list;
                
                if (paneList.changed) {
                    list = [];
                    paneList.forEach(function(tab, i){
                        if (tab && tab.name)
                            list.push(tab.name);
                    });
                    settings.setJson("state/panecycle", list);
                    paneList.changed = false;
                }
            });
    
            // Preferences
            prefs.add({
                "General" : {
                    "General" : {
                        "Reveal Active File in Project Tree" : {
                            type     : "checkbox",
                            position : 4000,
                            path     : "user/general/@revealfile"
                        }
                    }
                }
            }, plugin);
            
            // Commands
            definition.forEach(function(item){
                commands.addCommand({
                    name        : item[0],
                    bindKey     : { mac: item[1], win: item[2] },
                    group       : "Tabs",
                    hint        : item[4],
                    isAvailable : item[3],
                    exec        : function (editor, arg) {
                        if (arg && !arg[0] && arg.source == "click")
                            arg = [mnuContext.$tab, mnuContext.$pane];
                        plugin[item[0]].apply(plugin, arg);
                    }
                }, plugin);
            });
            
            // General Menus
            menus.addItemByPath("File/~", new ui.divider(), 100000, plugin);
            menus.addItemByPath("File/Close File", new ui.item({
                command: "closetab"
            }), 110000, plugin);
            menus.addItemByPath("File/Close All Files", new ui.item({
                command : "closealltabs"
            }), 120000, plugin);

            menus.addItemByPath("Window/Tabs/Close All Tabs In Pane", new ui.item({
                command : "closepane"
            }), 100, plugin);
            menus.addItemByPath("Window/Tabs/Close All Tabs In All Panes", new ui.item({
                command : "closealltabs"
            }), 200, plugin);
            menus.addItemByPath("Window/Tabs/Close All But Current Tab", new ui.item({
                command : "closeallbutme"
            }), 300, plugin);
            
            menus.addItemByPath("Window/Tabs/~", new ui.divider(), 1000000, plugin);
            menus.addItemByPath("Window/Tabs/Split Pane Vertically", new ui.item({
                command : "vsplit"
            }), 1000100, plugin);
            menus.addItemByPath("Window/Tabs/Split Pane Horizontally", new ui.item({
                command : "hsplit"
            }), 1000200, plugin);
            menus.addItemByPath("Window/Tabs/~", new ui.divider(), 1000300, plugin);
            
            menus.addItemByPath("Window/Tabs/~", new apf.label({
                "class"   : "splits",
                "caption" : "<span class='nosplit'></span>"
                    + "<span class='twovsplit'></span>"
                    + "<span class='twohsplit'></span>"
                    + "<span class='foursplit'></span>"
                    + "<span class='threeleft'></span>"
                    + "<span class='threeright'></span>",
                "onclick" : function(e){
                    var span = e.htmlEvent.target;
                    if (!span || span.tagName != "SPAN") return;
                    plugin[span.className]();
                    mnuTabs.hide();
                }
            }), 1000400, plugin);

            menus.addItemByPath("Goto/~", new ui.divider(), 300, plugin);

            menus.addItemByPath("Goto/Tab or Pane/", null, 301, plugin);

            menus.addItemByPath("Goto/Tab or Pane/Tab to the Right", new ui.item({
                command : "gototabright"
            }), 100, plugin);

            menus.addItemByPath("Goto/Tab or Pane/Tab to the Left", new ui.item({
                command : "gototableft"
            }), 200, plugin);

            menus.addItemByPath("Goto/Tab or Pane/Next Tab in History", new ui.item({
                command : "nexttab"
            }), 300, plugin);

            menus.addItemByPath("Goto/Tab or Pane/Previous Tab in History", new ui.item({
                command : "previoustab"
            }), 400, plugin);

            menus.addItemByPath("Goto/Tab or Pane/~", new ui.divider(), 500, plugin);
            
            menus.addItemByPath("Goto/Tab or Pane/Move Tab to Right", new ui.item({
                command : "movetabright"
            }), 600, plugin);
            menus.addItemByPath("Goto/Tab or Pane/Move Tab to Left", new ui.item({
                command : "movetableft"
            }), 700, plugin);
            menus.addItemByPath("Goto/Tab or Pane/Move Tab to Up", new ui.item({
                command : "movetabup"
            }), 800, plugin);
            menus.addItemByPath("Goto/Tab or Pane/Move Tab to Down", new ui.item({
                command : "movetabdown"
            }), 900, plugin);
            
            menus.addItemByPath("Goto/Tab or Pane/~", new ui.divider(), 1000, plugin);

            menus.addItemByPath("Goto/Tab or Pane/Next Pane in History", new ui.item({
                command : "nextpane"
            }), 1100, plugin);

            menus.addItemByPath("Goto/Tab or Pane/Previous Pane in History", new ui.item({
                command : "previouspane"
            }), 1200, plugin);
            
            // Tab Helper Menu
            menus.addItemByPath("Window/~", new ui.divider(), 10000, plugin);
            mnuTabs = menus.addItemByPath("Window/Tabs", null, 10100, plugin);
            
            mnuTabs.addEventListener("prop.visible", function(e) {
                if (e.value) {
                    if (mnuTabs.opener && mnuTabs.opener.parentNode.localName == "tab") {
                        mnuContext.$pane  = mnuTabs.opener.parentNode.cloud9pane;
                        mnuContext.$tab = mnuContext.$pane.getTab();
                    }
                    updateTabMenu();
                }
                else {
                    removeContextInfo(e);
                }
                
                if (mnuTabs.opener && mnuTabs.opener["class"] == "tabmenubtn")
                    apf.setStyleClass(mnuTabs.$ext, "tabsContextMenu");
                else
                    apf.setStyleClass(mnuTabs.$ext, "", ["tabsContextMenu"]);
            }, true);

            // Tab Context Menu
            mnuContext = new Menu({id : "mnuContext"}, plugin).aml;

            function removeContextInfo(e) {
                if (!e.value) {
                    // use setTimeout because apf closes menu before menuitem onclick event
                    setTimeout(function(){
                        mnuContext.$tab = null;
                        mnuContext.pane   = null;
                    })
                }
            }

            mnuContext.on("prop.visible", removeContextInfo, false);
    
            menus.addItemByPath("Reveal in File Tree", new ui.item({
                command : "revealtab"
            }), 100, mnuContext, plugin);
            menus.addItemByPath("~", new ui.divider(), 200, mnuContext, plugin);
            menus.addItemByPath("Close Tab", new ui.item({
                command : "closetab"
            }), 300, mnuContext, plugin);
            menus.addItemByPath("Close All Tabs", new ui.item({
                command : "closepane"
            }), 450, mnuContext, plugin);
            menus.addItemByPath("Close Other Tabs", new ui.item({
                command : "closeallbutme"
            }), 500, mnuContext, plugin);
            menus.addItemByPath("~", new ui.divider(), 550, mnuContext, plugin);
            menus.addItemByPath("Close Tabs to the Right", new ui.item({
                command : "closealltotheright"
            }), 600, mnuContext, plugin);
            menus.addItemByPath("Close Tabs to the Left", new ui.item({
                command : "closealltotheleft"
            }), 700, mnuContext, plugin);
            menus.addItemByPath("~", new ui.divider(), 750, mnuContext, plugin);
            menus.addItemByPath("Split Pane Vertically", new ui.item({
                command : "vsplit"
            }), 800, mnuContext, plugin);
            menus.addItemByPath("Split Pane Horizontally", new ui.item({
                command : "hsplit"
            }), 900, mnuContext, plugin);
            
            mnuEditors = tabs.getElement("mnuEditors");
            var div, label;
            div   = menus.addItemToMenu(mnuEditors, new ui.divider(), 1000000, plugin);
            label = menus.addItemToMenu(mnuEditors, new ui.item({
                caption  : "Recently Closed Tabs",
                disabled : true
            }), 1000001, plugin);
            menuClosedItems.hide = function(){ div.hide(); label.hide(); }
            menuClosedItems.show = function(){ div.show(); label.show(); }
            menuClosedItems.hide();

            // Other Hooks
            tabs.on("paneCreate", function(e){
                var pane = e.pane.aml;
                pane.on("contextmenu", function(e) {
                    if (e.currentTarget) {
                        mnuContext.$tab = e.currentTarget.tagName == "page"
                            ? e.currentTarget.cloud9tab : null;
                    }
                    if (ui.isChildOf(pane.$buttons, e.htmlEvent.target, true)) {
                        mnuContext.display(e.x, e.y);
                        return false;
                    }
                });
                
                var meta = e.pane.meta;
                if (!meta.accessList)
                    meta.accessList = [];
                if (!meta.accessList.toJson)
                    meta.accessList.toJson = accessListToJson;
            });
    
            //@todo store the stack for availability after reload
            tabs.on("tabBeforeClose", function(e) {
                var tab  = e.tab;
                var event = e.htmlEvent || {};
                
                // Shift = close all
                if (event.shiftKey) {
                    closealltabs();
                    return false;
                }
                // Alt/ Option = close all but this
                else if (event.altKey) {
                    closeallbutme(tab);
                    return false;
                }
            });
            
            tabs.on("tabAfterClose", function(e) {
                // Hack to force focus on the right pane
                var accessList = e.tab.pane.meta.accessList;
                if (tabs.focussedTab == e.tab && accessList[1])
                    e.tab.pane.aml.nextTabInLine = accessList[1].aml;
            });
            
            tabs.on("tabReparent", function(e) {
                // Move to new access list
                var lastList   = e.lastPane.meta.accessList;
                var accessList = e.tab.pane.meta.accessList;
                lastList.splice(lastList.indexOf(e.tab), 1);
                
                if (e.tab == tabs.focussedTab)
                    accessList.unshift(e.tab);
                else
                    accessList.push(e.tab);
                
                // Hack to force focus on the right pane
                if (tabs.focussedTab == e.tab && accessList[1])
                    e.lastPane.aml.nextTabInLine = accessList[1].aml;
            });
            
            tabs.on("tabDestroy", function(e) {
                var tab = e.tab;
                if (tab.document.meta.preview)
                    return;
                    
                addTabToClosedMenu(tab);
                tab.pane.meta.accessList.remove(tab);
                paneList.remove(tab);
            });
            
            tabs.on("tabCreate", function(e){
                var tab = e.tab;

                if (tab.title) {
                    // @todo candidate for optimization using a hash
                    for (var i = menuClosedItems.length - 1; i >= 0; i--) {
                        if (menuClosedItems[i].caption == tab.title) {
                            menuClosedItems.splice(i, 1)[0].destroy(true, true);
                            if (!menuClosedItems.length)
                                menuClosedItems.hide();
                        }
                    }
                }
                
                if (tab.document.meta.preview)
                    return;

                var accessList = tab.pane.meta.accessList;
                var idx;

                if (accessList.indexOf(tab) == -1) {
                    idx = accessList.indexOf(tab.name);
                    if (idx == -1) { //Load accesslist from index
                        if (tab == tabs.focussedTab)
                            accessList.unshift(tab);
                        else
                            accessList.push(tab); //splice(1, 0, tab);
                    }
                    else
                        accessList[idx] = tab;
                }
                if (paneList.indexOf(tab) == -1) {
                    idx = paneList.indexOf(tab.name);
                    if (idx == -1) { //Load paneList from index
                        if (tab.isActive())
                            addToPaneList(tab);
                    }
                    else
                        paneList[idx] = tab;
                }
            });
    
            tabs.on("focusSync", function(e){
                var tab = e.tab;

                if (!cycleKeyPressed) {
                    var accessList = tab.pane.meta.accessList;
                    accessList.remove(tab);
                    accessList.unshift(tab);
                    accessList.changed = true;
                    
                    addToPaneList(tab, true);
                    paneList.changed = true;
                    
                    settings.save();
                }
    
                // @todo panel switch
                if (tree.area && tree.area.activePanel == "tree" 
                  && settings.getBool('user/general/@revealfile')) {
                    revealtab(tab, true);
                }
            });
            tabs.on("tabAfterActivate", function(e){
                var tab = e.tab;
                if (tab == tabs.focussedTab) 
                    return;
            
                if (!cycleKeyPressed) {
                    var accessList = tab.pane.meta.accessList;
                    accessList.remove(tab);
                    accessList.splice(1, 0, tab);
                    accessList.changed = true;
                    
                    addToPaneList(tab, 2);
                    paneList.changed = true;
                    
                    settings.save();
                }
            });
    
            apf.addEventListener("keydown", function(eInfo) {
                if (eInfo.keyCode == cycleKey) {
                    cycleKeyPressed = true;
                }
            });
    
            apf.addEventListener("keyup", function(eInfo) {
                if (eInfo.keyCode == cycleKey && cycleKeyPressed) {
                    cycleKeyPressed = false;
    
                    if (dirtyNextTab) {
                        accessedTab = 0;
    
                        var tab = tabs.focussedTab;
                        var accessList = tab.pane.meta.accessList;
                        if (accessList[accessedTab] != tab) {
                            accessList.remove(tab);
                            accessList.unshift(tab);
    
                            accessList.changed = true;
                            settings.save();
                        }
    
                        dirtyNextTab = false;
                    }
                }
                if (eInfo.keyCode == paneCycleKey && cycleKeyPressed) {
                    cycleKeyPressed = false;
    
                    if (dirtyNextTab) {
                        accessedTab = 0;
    
                        var tab = tabs.focussedTab;
                        if (paneList[accessedTab] != tab) {
                            paneList.remove(tab);
                            paneList.unshift(tab);
    
                            paneList.changed = true;
                            settings.save();
                        }
    
                        dirtyNextTab = false;
                    }
                }
            });
    
            // tabs.addEventListener("aftersavedialogcancel", function(e) {
            //     if (!changedTabs)
            //         return;
    
            //     var i, l, tab;
            //     for (i = 0, l = changedTabs.length; i < l; i++) {
            //         tab = changedTabs[i];
            //         tab.removeEventListener("aftersavedialogclosed", arguments.callee);
            //     }
            // });
        }
        
        /***** Methods *****/
        
        function addToPaneList(tab, first){
            var pane = tab.pane, found;
            paneList.every(function(tab){
                if (tab.pane && tab.pane == pane) {
                    found = tab;
                    return false;
                }
                return true;
            });
            
            if (found) 
                paneList.remove(found);
            
            if (first == 2)
                paneList.splice(1, 0, tab);
            else if (first) 
                paneList.unshift(tab);
            else 
                paneList.push(tab);
        }
        
        function accessListToJson(){
            var list = [];
            this.forEach(function(tab, i){
                if (tab && tab.name)
                    list.push(tab.name);
            });
            return list;
        }
            
        function closetab(tab) {
            if (!tab)
                tab = mnuContext.$tab || tabs.focussedTab;
                
            var pages  = tabs.getTabs();
            var isLast = pages[pages.length - 1] == tab;
    
            tab.close();
            tabs.resizePanes(isLast);
    
            return false;
        }
    
        function closealltabs(callback) {
            callback = typeof callback == "function" ? callback : null;
    
            changedTabs = [];
            unchangedTabs = [];
    
            var pages = tabs.getTabs();
            for (var i = 0, l = pages.length; i < l; i++) {
                closepage(pages[i], callback);
            }
    
            checkTabRender(callback);
        }
    
        function closeallbutme(me, pages, callback) {
            if (!me) {
                me = mnuContext.$tab || tabs.focussedTab;
            }
    
            changedTabs   = [];
            unchangedTabs = [];
            
            if (!pages) {
                var container = me && me.aml && me.aml.parentNode || tabs.container;
                pages = tabs.getTabs(container);
            }
            var tab;
            for (var i = 0, l = pages.length; i < l; i++) {
                tab = pages[i];
                if (tab !== me)
                    closepage(tab, callback);
            }
    
            tabs.resizePanes();
            checkTabRender(callback);
        }
    
        function closepage(tab, callback) {
            var doc = tab.document;
            if (doc.changed && (!doc.meta.newfile || doc.value))
                changedTabs.push(tab);
            else
                unchangedTabs.push(tab);
        }
    
        function checkTabRender(callback) {
            save.saveAllInteractive(changedTabs, function(result){
                if (result != save.CANCEL) {
                    changedTabs.forEach(function(tab){
                        tab.unload();
                    })
                    closeUnchangedTabs(function() {
                        if (callback)
                            callback();
                    });
                }
                else if (callback)
                    callback()
            });
        }
    
        function closeUnchangedTabs(callback) {
            var tab;
            for (var i = 0, l = unchangedTabs.length; i < l; i++) {
                tab = unchangedTabs[i];
                tab.close(true);
            }
    
            if (callback)
                callback();
        }
    
        function closealltotheright(tab) {
            if (!tab)
                tab = mnuContext.$tab || tabs.focussedTab;
                
            var pages   = tab.pane.getTabs();
            var currIdx = pages.indexOf(tab);
            
            closeallbutme(tab, pages.slice(currIdx));
        }
    
        function closealltotheleft(tab) {
            if (!tab)
                tab = mnuContext.$tab || tabs.focussedTab;
                
            var pages   = tab.pane.getTabs();
            var currIdx = pages.indexOf(tab);
            
            closeallbutme(tab, pages.slice(0, currIdx));
        }
    
        function nexttab(){
            if (tabs.getTabs().length === 1)
                return;
            
            var tab        = tabs.focussedTab;
            var accessList = tab.pane.meta.accessList;
            
            if (++accessedTab >= accessList.length)
                accessedTab = 0;
    
            var next = accessList[accessedTab];
            if (typeof next != "object" || !next.pane.visible)
                return nexttab();
            tabs.focusTab(next, null, true);
    
            dirtyNextTab = true;
        }
    
        function previoustab (){
            if (tabs.getTabs().length === 1)
                return;
                
            var tab        = tabs.focussedTab;
            var accessList = tab.pane.meta.accessList;
    
            if (--accessedTab < 0)
                accessedTab = accessList.length - 1;
    
            var next = accessList[accessedTab];
            if (typeof next != "object" || !next.pane.visible)
                return previoustab();
            tabs.focusTab(next, null, true);
    
            dirtyNextTab = true;
        }
    
        function nextpane(){
            if (tabs.getPanes().length === 1)
                return;
    
            if (++accessedPane >= paneList.length)
                accessedPane = 0;
    
            var next = paneList[accessedPane];
            if (typeof next != "object" || !next.pane.visible)
                return nextpane();
            tabs.focusTab(next.pane.activeTab, null, true);
    
            dirtyNextTab = true;
        }
    
        function previouspane(){
            if (tabs.getTabs().length === 1)
                return;
    
            if (--accessedPane < 0)
                accessedPane = paneList.length - 1;
    
            var next = paneList[accessedPane];
            if (typeof next != "object" || !next.pane.visible)
                return previouspane();
            tabs.focusTab(next.pane.activeTab, null, true);
    
            dirtyNextTab = true;
        }
    
        function gototabright(e) {
            return cycleTab("right");
        }
    
        function gototableft() {
            return cycleTab("left");
        }
    
        function cycleTab(dir) {
            var curr    = tabs.focussedTab;
            var pages   = curr && curr.pane.getTabs();
            if (!pages || pages.length == 1)
                return;
    
            var currIdx = pages.indexOf(curr);
            var start   = currIdx;
            var tab;
            
            do {
                var idx = currIdx;
                switch (dir) {
                    case "right": idx++; break;
                    case "left":  idx--; break;
                    case "first": idx = 0; break;
                    case "last":  idx = pages.length - 1; break;
                    default: idx--;
                }
        
                if (idx < 0)
                    idx = pages.length - 1;
                if (idx > pages.length - 1)
                    idx = 0;
                
                // No pages found that can be focussed
                if (start == idx)
                    return;
                
                tab = pages[idx];
            } 
            while (!tab.pane.visible);
    
            if (tab.pane.visible)
                tabs.focusTab(tab, null, true);
            
            return false;
        }
    
        function movetabright() { hmoveTab("right"); }
        function movetableft() { hmoveTab("left"); }
        function movetabup() { vmoveTab("up"); }
        function movetabdown() { vmoveTab("down"); }
    
        function hmoveTab(dir) {
            var bRight  = dir == "right";
            var tab    = tabs.focussedTab;
            if (!tab)
                return;
            
            // Tabs within the current pane
            var pages   = tab.pane.getTabs();
            
            // Get new index
            var idx = pages.indexOf(tab) + (bRight ? 2 : -1);
            
            // Before current pane
            if (idx < 0 || idx > pages.length) {
                var dt = new Date();
                tab.pane.moveTabToSplit(tab, dir);
            }
            // In current pane
            else {
                tab.attachTo(tab.pane, pages[idx], null, true);
            }

            return false;
        }
        
        function vmoveTab(dir) {
            var tab = tabs.focussedTab;
            if (!tab)
                return;
            
            tab.pane.moveTabToSplit(tab, dir);
            return false;
        }
    
        function tab1() { return showTab(1); }
        function tab2() { return showTab(2); }
        function tab3() { return showTab(3); }
        function tab4() { return showTab(4); }
        function tab5() { return showTab(5); }
        function tab6() { return showTab(6); }
        function tab7() { return showTab(7); }
        function tab8() { return showTab(8); }
        function tab9() { return showTab(9); }
        function tab0() { return showTab(10); }
    
        function showTab(idx) {
            // our indexes are 0 based an the number coming in is 1 based
            var tab = (menuItems[idx] || false).relPage;
            if (!tab)
                return false;
    
            tabs.focusTab(tab, null, true);
            return false;
        }
    
        /**
         * Scrolls to the selected pane's file path in the "Project Files" tree
         *
         * Works by Finding the node related to the active pane in the tree, and
         * unfolds its parent folders until the node can be reached by an xpath
         * selector and focused, to finally scroll to the selected node.
         */
        function revealtab(tab, noFocus) {
            if (!tab || tab.command)
                tab = tabs.focussedTab;
            if (!tab)
                return false;
    
            // Tell other extensions to exit their fullscreen mode (for ex. Zen)
            // so this operation is visible
            // ide.dispatchEvent("exitfullscreen");
    
            revealInTree(tab, noFocus);
        }
    
        function revealInTree (tab, noFocus) {
            panels.activate("tree");
    
            tree.expand(tab.path, function(err){
                var path = err ? "/" : tab.path;
                tree.select(path);
                tree.scrollToSelection();
            });
            if (!noFocus)
                tree.focus();
        }
        
        function canTabBeRemoved(pane, min){
            if (!pane || pane.getTabs().length > (min || 0)) 
                return false;
            
            var containers = tabs.containers;
            for (var i = 0; i < containers.length; i++) {
                if (ui.isChildOf(containers[i], pane.aml)) {
                    return containers[i]
                        .getElementsByTagNameNS(apf.ns.aml, "tab").length > 1
                }
            }
            return false;
        }
        
        function closepane(tab, pane){
            if (!pane)
                pane = tab.pane;
                
            var pages = pane.getTabs();
            if (!pages.length) {
                if (canTabBeRemoved(pane))
                    pane.unload();
                return;
            }
            
            changedTabs   = [];
            unchangedTabs = [];
            
            // Ignore closing tabs
            menuClosedItems.ignore = true;
    
            // Keep information to restore pane set
            var state = [];
            var type  = pane.aml.parentNode.localName;
            var nodes = pane.aml.parentNode.childNodes.filter(function(p){ 
                return p.localName != "splitter";
            });
            
            state.title    = pages.length + " Tabs";
            state.type     = type == "vsplitbox" ? "vsplit" : "hsplit";
            state.far      = nodes.indexOf(pane.aml) == 1;
            state.sibling  = nodes[state.far ? 0 : 1];
            state.getState = function(){ return state };
            state.restore  = function(state){ 
                // pane was not being used. Why?
                // var pane     = state.sibling;
                // if (pane && pane.cloud9pane) 
                //     pane = pane.cloud9pane.aml;
                    
                var oldpane = state.pane;
                var newpane = oldpane.getTabs().length === 0
                    ? oldpane
                    : oldpane[state.type](state.far, null, pane);
                
                state.forEach(function(s){
                    s.pane = newpane;
                    tabs.open(s, function(){});
                });
            };
            state.document = { meta: {} };
            
            // Close pages
            pages.forEach(function(tab){ 
                state.push(tab.getState());
                closepage(tab); 
            });
            
            tabs.resizePanes();
            checkTabRender(function(){
                if (canTabBeRemoved(pane))
                    pane.unload();
                    
                // Stop ignoring closing tabs
                menuClosedItems.ignore = false;
                
                // @todo there should probably be some check here
                addTabToClosedMenu(state);
            });
        }
        
        function hsplit(tab){
            if (!tab)
                tab = tabs.focussedTab;
            
            var newtab = tab.pane.hsplit(true);
            if (tab.pane.getTabs().length > 1)
                tab.attachTo(newtab);
        }
        
        function vsplit(tab){
            if (!tab)
                tab = tabs.focussedTab;
            
            var newtab = tab.pane.vsplit(true);
            if (tab.pane.getTabs().length > 1)
                tab.attachTo(newtab);
        }
        
        function nosplit(){
            var panes = tabs.getPanes(tabs.container);
            var first = panes[0];
            for (var pane, i = 1, li = panes.length; i < li; i++) {
                var pages = (pane = panes[i]).getTabs();
                for (var j = 0, lj = pages.length; j < lj; j++) {
                    pages[j].attachTo(first, null, true);
                }
                pane.unload();
            }
        }
        
        function twovsplit(hsplit){
            var panes = tabs.getPanes(tabs.container);
            
            // We're already in a two vsplit
            if (panes.length == 2 && panes[0].aml.parentNode.localName 
              == (hsplit ? "hsplitbox" : "vsplitbox"))
                return panes;
            
            // Split the only pane there is
            if (panes.length == 1) {
                var newtab = panes[0][hsplit ? "hsplit" : "vsplit"](true);
                return [panes[0], newtab];
            }
            
            var c = tabs.containers[0].firstChild.childNodes.filter(function(f){
                return f.localName != "splitter";
            });
            // var left  = c[0].getElementsByTagNameNS(apf.ns.aml, "tab");
            var right = c[1].getElementsByTagNameNS(apf.ns.aml, "tab");
            
            for (var i = 1, l = panes.length; i < l; i++) {
                panes[i].unload();
            }
            
            var newtab = panes[0][hsplit ? "hsplit" : "vsplit"](true);
            right.forEach(function(tab){
                if (tab.cloud9tab)
                    tab.cloud9tab.attachTo(newtab, null, true);
            });
            
            return [panes[0], newtab];
        }
        
        function twohsplit(){
            return twovsplit(true)
        }
        
        function foursplit(){
            var panes = twohsplit();
            panes[0].vsplit(true);
            panes[1].vsplit(true);
        }
        
        function threeleft(){
            var panes = twohsplit();
            panes[0].vsplit(true);
        }
        
        function threeright(){
            var panes = twohsplit();
            panes[1].vsplit(true);
        }
        
        function checkReopenedTab(e){
            var tab = e.tab;
            if (!tab.path)
                return;
            
            fs.stat(tab.path, function(err, stat){
                if (err) return;
                
                // @todo this won't work well on windows, because
                // there is a 20s period in which the mtime is
                // the same. The solution would be to have a 
                // way to compare the saved document to the 
                // loaded document that created the state
                if (tab.document.meta.timestamp < stat.mtime) {
                    var doc = tab.document;
                    
                    confirm("File Changed",
                      tab.path + " has been changed on disk.",
                      "Would you like to reload this file?",
                      function(){
                          tabs.reload(tab, function(){});
                      }, 
                      function(){
                          // Set to changed
                          doc.undoManager.bookmark(-2);
                      }, 
                      { merge: false, all: false }
                    );
                }
            });
        }
        
        // Record the last 10 closed tabs or pane sets
        function addTabToClosedMenu(tab){
            if (menuClosedItems.ignore) return;
            
            if (tab.document.meta.preview)
                return;
            
            // Record state
            var state     = tab.getState();
            
            if (!tab.restore) {
                for (var i = menuClosedItems.length - 1; i >= 0; i--) {
                    if (menuClosedItems[i].caption == tab.title) {
                        menuClosedItems.splice(i, 1)[0].destroy(true, true);
                    }
                }
            }
            
            // Create menu item
            var item  = new ui.item({
                caption : tab.title,
                style   : "padding-left:35px",
                onclick : function(e){
                    // Update State
                    state.active = true;
                    state.pane    = this.parentNode.pane;
                    
                    tabs.on("open", checkReopenedTab);
                    
                    // Open pane
                    tab.restore
                        ? tab.restore(state)
                        : tabs.open(state, function(){});
                        
                    tabs.off("open", checkReopenedTab);
                    
                    // Remove pane from menu
                    menuClosedItems.remove(item);
                    item.destroy(true, true);
                    
                    // Clear label and divider if there are no items
                    if (menuClosedItems.length === 0)
                        menuClosedItems.hide();
                }
            });
            
            // Add item to menu
            menuClosedItems.push(item);
            var index = menuClosedItems.index = (menuClosedItems.index || 0) + 1;
            menus.addItemToMenu(mnuEditors, item, 2000000 - index, false);
            
            // Show label and divider
            menuClosedItems.show();
            
            // Remove excess menu item
            if (menuClosedItems.length > 10)
                menuClosedItems.shift().destroy(true, true);
        }
    
        function updateTabMenu(force) {
            // Approximating order
            var pages = [];
            tabs.getPanes().forEach(function(pane){
                pages = pages.concat(pane.getTabs());
            });
            var length = Math.min(10, pages.length);
            var start = 1000;
            
            // Destroy all items
            menuItems.forEach(function(item){
                item.destroy(true, true);
            });
            menuItems = [];
            
            if (!pages.length)
                return;
            
            var mnu, tab;
            
            // Create new divider
            menus.addItemToMenu(mnuTabs, mnu = new ui.divider(), start, false);
            menuItems.push(mnu);
            
            // Create new items
            var onclick = function() { tabs.focusTab(tab, null, true); };
            for (var i = 0; i < length; i++) {
                tab = pages[i];
                if (!tab.title) continue;
                menus.addItemToMenu(mnuTabs, mnu = new ui.item({
                    caption : tab.title,
                    relPage : tab,
                    command : "tab" + (i == 9 ? 0 : i + 1),
                    onclick : onclick
                }), start + i + 1, false);
                menuItems.push(mnu);
            }
            
            if (pages.length > length) {
                menus.addItemToMenu(mnuTabs, mnu = new ui.item({
                    caption : "More...",
                    onclick : function() {
                        panels.activate("openfiles");
                    }
                }), start + length + 1, false);
                menuItems.push(mnu);
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
            menuItems.forEach(function(item){
                item.destroy(true, true);
            });
            menuItems = [];
            menuClosedItems.forEach(function(item){
                item.destroy(true, true);
            });
            menuClosedItems = [];
            
            loaded = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * Draws the file tree
         * @event afterfilesave Fires after a file is saved
         * @param {Object} e
         *     node     {XMLNode} description
         *     oldpath  {String} description
         **/
        plugin.freezePublicAPI({
            /**
             * 
             */
            get contextMenu(){ return mnuContext; },
            
            /**
             * 
             */
            closetab : closetab,
            
            /**
             * 
             */
            closealltabs : closealltabs,
            
            /**
             * 
             */
            closeallbutme : closeallbutme,
            
            /**
             * 
             */
            gototabright : gototabright,
            
            /**
             * 
             */
            gototableft : gototableft,
            
            /**
             * 
             */
            movetabright : movetabright,
            
            /**
             * 
             */
            movetableft : movetableft,
            
            /**
             * 
             */
            movetabup : movetabup,
            
            /**
             * 
             */
            movetabdown : movetabdown,
            
            /**
             * 
             */
            tab1 : tab1,
            
            /**
             * 
             */
            tab2 : tab2,
            
            /**
             * 
             */
            tab3 : tab3,
            
            /**
             * 
             */
            tab4 : tab4,
            
            /**
             * 
             */
            tab5 : tab5,
            
            /**
             * 
             */
            tab6 : tab6,
            
            /**
             * 
             */
            tab7 : tab7,
            
            /**
             * 
             */
            tab8 : tab8,
            
            /**
             * 
             */
            tab9 : tab9,
            
            /**
             * 
             */
            tab0 : tab0,
            
            /**
             * 
             */
            revealtab : revealtab,
            
            /**
             * 
             */
            nexttab : nexttab,
            
            /**
             * 
             */
            previoustab : previoustab,
            
            /**
             * 
             */
            closealltotheright : closealltotheright,
            
            /**
             * 
             */
            closealltotheleft : closealltotheleft,
            
            /**
             * 
             */
            closepane : closepane,
            
            /**
             * 
             */
            hsplit : hsplit,
            
            /**
             * 
             */
            vsplit : vsplit,
            
            /**
             * 
             */
            nosplit : nosplit,
            
            /**
             * 
             */
            twovsplit : twovsplit,
            
            /**
             * 
             */
            twohsplit : twohsplit,
            
            /**
             * 
             */
            foursplit : foursplit,
            
            /**
             * 
             */
            threeleft : threeleft,
            
            /**
             * 
             */
            threeright : threeright,
            
            /**
             * 
             */
            nextpane : nextpane,
            
            /**
             * 
             */
            previouspane : previouspane
        });
        
        register(null, {
            tabbehavior: plugin
        });
    }
});
