/**
 * SauceLabs Preview for Cloud9 IDE
 */
define(function(require, exports, module) {
    main.consumes = [
        "Previewer", "preview", "tabManager", "http", "settings", "ui", 
        "Menu", "MenuItem", "Divider"
    ];
    main.provides = ["preview.saucelabs"];
    return main;
    
    /**
     * Issues:
     * - Preview doesn't preserve state across refresh
     * - UnloadDocument is not called when the tab is closed
     * - When reopening a preview on the same document the session seems to be still active
     * - Time Left needs to be per session
     * - Stop button and time left needs styling
     */

    function main(options, imports, register) {
        var Previewer = imports.Previewer;
        var preview   = imports.preview;
        var tabs      = imports.tabManager;
        var http      = imports.http;
        var ui        = imports.ui;
        var settings  = imports.settings;
        var Menu      = imports.Menu;
        var MenuItem  = imports.MenuItem;
        var Divider   = imports.Divider;
        
        /***** Initialization *****/
        
        var plugin = new Previewer("Sauce Labs, Inc.", main.consumes, {
            caption  : "Sauce Labs",
            index    : 300,
            submenu  : true
        });
        
        var baseurl = options.testing || true
            ? "https://jlipps.dev.saucelabs.com" 
            : "https://www.saucelabs.com";
            
        var USERNAME  = "admin";
        var ACCESSKEY = "0e779f56-385a-41be-a562-6f6908bf5acf";
        var AUTH      = "?username=" + USERNAME + "&access_key=" + ACCESSKEY;
            
        var sauceMenu, currentSession, selectedBrowser, btnStop, lblTimeLeft;
        var numRecentBrowsers = 4;
        var sessions          = [];
        
        var browserMap = {
            firefox         : 'FF',
            android         : 'Android',
            googlechrome    : 'Chrome',
            iexplore        : 'IE',
            ipad            : 'iPad',
            iphone          : 'iPhone',
            opera           : 'Opera',
            safari          : 'Safari',
            "Windows 2012"  : "Win8",
            "Windows 2008"  : "Win7",
            "Windows 2003"  : "XP",
            "Mac 10.6"      : "10.6",
            "Mac 10.8"      : "10.8",
            "Linux"         : "Linux"
        };
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            // Only load when preview is being shown
            preview.on("draw", function(){
                
                // Get all supported browsers
                http.request("https://saucelabs.com/rest/v1/info/scout", function(err, json) {
                    if (err) return console.error(err);
                    
                    var browsers = parseBrowsers(json);
                    createMenus(browsers);
                    
                    // Load recent browsers from settings
                    settings.on("read", function(){ 
                        if (!settings.getJson("user/saucelabs/preview")) {
                            settings.setJson("user/saucelabs/preview", [
                                addBrowserToRecent(["googlechrome", "Windows 2012", "latest"], true),
                                addBrowserToRecent(["iexplore", "Windows 2012", "latest"], true),
                                addBrowserToRecent(["firefox", "Windows 2012", "latest"], true),
                                addBrowserToRecent(["safari", "Mac 10.6", "latest"], true),
                            ]);
                        }
                        
                        buildRecentBrowsers(); 
                    }, plugin);
                });
            });
            
            // @todo clean this up
            window.addEventListener("message", function(e){
                if (e.origin !== baseurl)
                    return;
                
                var data    = JSON.parse(e.data);
                var session = sessions[data.c9Id];
                if (session)
                    session.handleMessage(data);
            });
        }
        
        /***** Helpers *****/
        
        function iterateSorted(obj, cb) {
            var keys = [];
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) {
                    keys.push(key);
                }
            }
            keys.sort(function(a, b) {
                if (/^[0-9\.]+$/.test(a) && /^[0-9\.]+$/.test(b)) {
                    a = parseFloat(a);
                    b = parseFloat(b);
                } else {
                    a = a.toString().toLowerCase();
                    b = b.toString().toLowerCase();
                }
                
                if (a < b) {
                    return -1;
                } else if (a > b) {
                    return 1;
                }
                return 0;
            });
            for (var i = 0; i < keys.length; i++) {
                key = keys[i].toString();
                cb(key, obj[key]);
            }                
        }
    
        function parseBrowsers(json){
            var browsers = {};
            
            /**
             * Structure is:
             *  Browser ->
             *          OS ->
             *              Version
             */
            json.forEach(function(item){
                var longName = item.long_name;
                var osRef    = item.os;
                var verRef   = item.short_version.toString();
                var verName  = verRef === "" ? "Latest": verRef;
                verRef = verRef === "" ? "*": verRef;

                // Use just `os` to show multiple OS versions
                var os = item.os_display;
                
                if (osRef == "Windows 2008")      os = "Windows 7";
                else if (osRef == "Windows 2003") os = "Windows XP";
                else if (osRef == "Windows 2012") os = "Windows 8";
                else if (osRef == "Mac 10.6")     os = "OSX 10.6";
                else if (osRef == "Mac 10.8")     os = "OSX 10.8";
                    
                if (typeof browsers[longName] === 'undefined') {
                    browsers[longName] = {
                        nameRef : item.name,
                        os : {}
                    };
                }
                if (typeof browsers[longName].os[os] === 'undefined') {
                    browsers[longName].os[os] = {
                        osRef: osRef,
                        ver: {}
                    };
                }
                if (typeof browsers[longName].os[os].ver[verName] === 'undefined') {
                    browsers[longName].os[os].ver[verName] = {
                        verRef: verRef
                    };
                }
            });
            
            return browsers;
        }
        
        /**
         * Go through all browsers and create submenus
         */
        function createMenus(browsers){
            sauceMenu = plugin.menu;
            sauceMenu.append(new Divider({ position: 99 }, plugin));
            
            var position = 100;
            iterateSorted(browsers, function(browserName, browserObj) {
                var submenu = new Menu({}, plugin);
                sauceMenu.append(new MenuItem({
                    caption  : browserName,
                    submenu  : submenu,
                    position : position += 100
                }));

                // Get all the operating systems for this browser (e.g. Windows, Linux)
                var oses = browserObj.os;
                iterateSorted(oses, function(os, osObj) {
                    var subsubmenu = new Menu({}, plugin);
                    submenu.append(new MenuItem({
                        caption : os,
                        submenu : subsubmenu
                    }));
                    
                    // Get all the OS versions
                    var versions = osObj.ver;
                    iterateSorted(versions, function(version, verObj) {
                        subsubmenu.append(new MenuItem({
                            caption : version,
                            onclick : function() {
                                var data = [browserObj.nameRef, 
                                    osObj.osRef, verObj.verRef];
                                previewCurrentFile(data);
                            }
                        }));
                    });
                });

            });
        }
        
        function buildRecentBrowsers() {
            // Clear all current menu items;
            var items = sauceMenu.items;
            for (var i = items.length - 1; i >= 0; i--)
                if (items[i].position < 10) items[i].unload();
            
            // Create new menu items
            var position = 1;
            var recent   = settings.getJson("user/saucelabs/preview");
            recent.forEach(function(browser, i) {
                sauceMenu.append(new MenuItem({
                    caption  : browser.caption,
                    position : position++,
                    onclick  : function() { previewCurrentFile(browser.value); }
                }));
            });
        }
        
        function addBrowserToRecent(browserData, admin) {
            var browserName = browserMap[browserData[0]];
            var platform    = browserMap[browserData[1]];
            var version     = browserData[2] == "*" ? "" : " " + browserData[2];
            
            // Prepare info data
            var info = {
                value   : browserData,
                caption : browserName + version + " on " + platform
            };
            if (admin) return info;
            
            // Get recent from settings
            var recent = settings.getJson("user/saucelabs/preview");
            
            // Remove duplicate item if there
            for (var i = 0; i < recent.length; i++) {
                if (recent[i].caption == info.caption) {
                    recent.splice(i, 1);
                    break;
                }
            }
            
            // Add recent item to beginning of stack
            recent.unshift(info);
            
            // Remove an item that exceeds stack length
            if (recent.length > numRecentBrowsers)
                recent.pop();
            
            // Store settings
            settings.setJson("user/saucelabs/preview", recent);
            
            // Rebuild menu
            buildRecentBrowsers();
            
            return info;
        }
        
        function previewCurrentFile(browserData) {
            selectedBrowser = browserData;
            
            var editor = tabs.focussedTab.editor;
            editor.setPreviewer("preview.saucelabs");
            
            if (!currentSession) return;
            
            currentSession.changePreview(browserData, true);
        }
        
        /***** Methods *****/
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("documentLoad", function(e){
            var doc     = e.doc;
            var session = doc.getSession();
            var tab     = doc.tab;
            var editor  = e.editor;
            var state   = e.state;
            
            var path = state.path;
            session.editor = editor;
            
            /**
             * browserData[0] = name
             * browserData[1] = OS
             * browserData[2] = browser version
             */
            session.changePreview = function(browserData, force){
                var c9loc = encodeURIComponent((preview.previewUrl + path).replace(/\//g, "$2F"));
        
                // @todo /resume/ + taskId + / + c9Id
                
                var url;
                if (!force && session.taskId) {
                    url = baseurl + "/cloud9/resume/"
                        + session.taskId + "/" + session.id + AUTH;
                }
                else {
                    url = baseurl + "/cloud9/preview/"
                        + browserData[0] + "/" + browserData[1].replace(/ /g, "%20") 
                        + "/" + browserData[2] + "/" + c9loc + "/" + session.id
                        + AUTH;
                }
                
                session.browser = addBrowserToRecent(browserData);
                
                iframe.src = url;
                
                session.stopped = false;
                session.activate();
            };
            
            session.stop = function(){
                if (!session.taskId)
                    return;
                
                var msg = JSON.stringify({stop: true});
                iframe.contentWindow.postMessage(msg, baseurl);
                lblTimeLeft.setAttribute("caption", "");
                btnStop.hide();
                session.stopped = true;
                
                tab.className.remove("loading");
            };
            
            session.handleMessage = function(data){
                // The job request is send
                if (data.taskId) {
                    session.taskId = data.taskId;
                }
                // The session has started
                else if (data.jobId) {
                    tab.className.remove("loading");
                    btnStop.show();
                    session.jobId = data.jobId;
                }
                // Update of the amount of time that is left
                else if (data.timeLeft) {
                    if (session.stopped) return;
                    
                    lblTimeLeft.setAttribute("caption", "Time Remaining: " 
                        + data.hr + ":" + data.min + ":" + data.sec);
                }
                // The time remaining is 0
                else if (data.timeout) {
                    
                }
                // An error has occurred
                else if (data.error) {
                    // Message
                }
            };
            
            if (state && state.taskId)
                session.taskId = state.taskId;
            
            if (!session.iframe) {
                var iframe = document.createElement("iframe");
                iframe.style.width    = "100%";
                iframe.style.height   = "100%";
                iframe.style.border   = 0;
                iframe.style.backgroundColor = "rgba(255, 255, 255, 0.88)"; //rgb(42, 58, 53)"; //
                
                iframe.addEventListener("load", function(){
                    // tab.className.remove("loading");
                });
                iframe.addEventListener("error", function(){
                    // tab.className.remove("loading");
                    tab.className.add("error");
                });
                
                session.iframe = iframe;
                session.id     = sessions.push(session) - 1;
                
                tab.className.add("loading");
            }
            
            session.changePreview(selectedBrowser);
            preview.container.$int.appendChild(session.iframe);
        });
        plugin.on("documentUnload", function(e){
            var doc     = e.doc;
            var session = doc.getSession();
            var iframe  = session.iframe;
            
            session.stop();
            
            iframe.parentNode.removeChild(iframe);
            
            doc.tab.className.remove("loading");
            
            if (currentSession == session)
                currentSession = null;
            
            sessions.splice(sessions.indexOf(session), 1);
        });
        plugin.on("documentActivate", function(e){
            var session = e.doc.getSession();
            var tab     = e.doc.tab;
            if (session.previewer != plugin) return; // @todo is this still needed?
            
            session.iframe.style.display = "block";
            
            var url = location.protocol + "//" 
              + location.host + "/workspace" + session.path;
            
            tab.title   = "[P] " + session.path;
            tab.tooltip = "[P] " + session.path;
            preview.setLocation(url);
            preview.setButtonStyle(session.browser.caption, location.origin
                + options.staticPrefix + "/images/saucelabs-icon.ico");
            
            if (!btnStop) {
                btnStop = preview.getElement("locationbar")
                  .appendChild(new ui.button({
                    caption : "Stop",
                    onclick : function(){
                        currentSession && currentSession.stop();
                    }
                }));
                lblTimeLeft = preview.getElement("locationbar")
                  .appendChild(new ui.label({
                    caption : ""
                }));
            }
            
            btnStop.show();
            lblTimeLeft.show();
            
            currentSession = session;
        });
        plugin.on("documentDeactivate", function(e){
            var session = e.doc.getSession();
            if (session.previewer != plugin) return; // @todo is this still needed?
    
            session.iframe.style.display = "none";
            
            btnStop.hide();
            lblTimeLeft.hide();
            
            if (currentSession == session)
                currentSession = null;
        });
        plugin.on("navigate", function(e){
            var tab     = plugin.activeDocument.tab;
            var session = plugin.activeSession;
            
            session.stop();
            session.changePreview(session.browser.value, true);
            
            tab.title    = 
            tab.tooltip  = "[P] " + e.url;
            session.editor.setLocation(e.url);
        });
        plugin.on("update", function(e){
            // var iframe = plugin.activeSession.iframe;
            //@todo
        });
        plugin.on("reload", function(){
            var session = plugin.activeSession;
            session.tab.className.add("loading");
            session.changePreview(session.browser.value);
        });
        plugin.on("setState", function(e){
            var state   = e.state;
            var session = e.doc.getSession();
            
            session.taskId = state.taskId;
            session.jobId  = state.jobId;
        });
        
        plugin.on("getState", function(e){
            var state   = e.state;
            var session = e.doc.getSession();
            
            state.taskId = session.taskId;
            state.jobId  = session.jobId;
        });
        plugin.on("enable", function(){
            
        });
        plugin.on("disable", function(){
            
        });
        plugin.on("unload", function(){
            loaded = false;
            // drawn  = false;
        });
        
        /***** Register and define API *****/
        
        /**
         **/
        plugin.freezePublicAPI({
        });
        
        register(null, {
            "preview.saucelabs": plugin
        });
    }
});