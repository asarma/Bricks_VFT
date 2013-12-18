/**
 * Cloud9 Duration metrics
 *
 * @copyright 2013, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {
    main.consumes = ["Plugin", "c9", "log", "info", "tabManager"];
    main.provides = ["duration"];
    return main;

    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var info     = imports.info;
        var tabs     = imports.tabManager;
        var log      = imports.log;

        /***** Initialization *****/

        var plugin = new Plugin("Ajax.org", main.consumes);
        // the interval writing loggedIn stats to LocalStorage, e.g. 3s
        var INTERVAL_LOG_LOGGED_IN_DURATION = 3000;
        // the interval writing windowFocused stats to LocalStorage, e.g. 3s
        var INTERVAL_LOG_WINDOW_FOCUSED_DURATION = 3000;
        // the timeout after which activity (e.g. keypress) is marked as done
        var TIMEOUT_ACTIVE_DURATION = 1000;
        
        // the namespace used for storing Duration values in localStorage
        var namespace;
        // The currently logged in User
        var user;
        // The currently used Workspace
        var workspace;
        // contains the last times we started measuring a specific duration
        var lastStartTimes = [];
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            
            user = info.getUser();
            workspace = info.getWorkspace();
            
            namespace = user.id + "-" + workspace.id + "-duration";
            
            // register stats in the Log plugin so it can send them to the DWH
            // (this is a special plugin that does logging itself)
            log.registerStats('duration', ['duration'], user.id, workspace.id);
            
            measureLoggedInTime();
            measureTabFocusTime();
            measureActiveTime();
            
            loaded = true;
        }

        /***** Methods *****/

        /**
         * Measure how long a user is logged in with the IDE.
         * 
         * This doesn't mean he's actually actively using the IDE, just that 
         * he's logged in.
         */
        function measureLoggedInTime() {
            setLastStartTime('loggedIn');
            // no need to cancel it, happens automatically when user logs out
            setInterval(function() {
                logDurationTime('loggedIn');
            }, INTERVAL_LOG_LOGGED_IN_DURATION);
        }

        /**
         * Measure how long a user has the IDE browser pane/window focused.
         * 
         * This doesn't mean he's actually actively using the IDE, just that the 
         * IDE is focused on his screen.
         */
        function measureTabFocusTime() {
            // used to store the timer for measuring focus time
            var logFocus;
            
            function onBlur() {
                // so the logger understands a negative slot needs to be set
                // send latest duration length to storage, then stop logging 
                logDurationTime('windowFocused', getFileType());
                clearInterval(logFocus);
                logFocus = null;
            }
            
            function onFocus() {
                // send latest (negative) duration length to storage
                logDurationTime('windowFocused', getFileType());
                setLastStartTime('windowFocused');
                // when IDE is loaded with window focused the Focus timer can 
                // be started twice, so make sure it's not first
                if (!logFocus) {
                    logFocus = setInterval(function() {
                        logDurationTime('windowFocused', getFileType());
                    }, INTERVAL_LOG_WINDOW_FOCUSED_DURATION);
                }
            }
        
            if (/*@cc_on!@*/false) { // check for Internet Explorer
                document.onfocusin  = onFocus;
                document.onfocusout = onBlur;
            } else {
                window.onfocus = onFocus;
                window.onblur  = onBlur;
            }
            
            // handle user opening or switching (file) tabs
            tabs.on("tabDestroy", function(e) {
                // log current activity duration and (re)start the timer
                logDurationTime('windowFocused', getFileType(e.tab));
                onFocus();
            });
            tabs.on("blur", function(e) {
                // log current activity duration
                logDurationTime('windowFocused', getFileType(e.tab));
            });
            
            // start measuring focus duration from the time the IDE opens, 
            // but only if the window is actually focused!
            if (window.focused) 
                onFocus();
        }

        /**
         * Measure how long a user is actively using the IDE by doing things 
         * like moving his mouse, clicking, pressing keys, etcetera.
         * 
         * After TIMEOUT_ACTIVE_DURATION ms the activity is marked as done. 
         * Recommended to set this to a fairly low value (e.g. 1 second) for 
         * accuracy, but this is up to be played with :).
         */
        function measureActiveTime() {
            var activeTimeoutID;

            // set timer to write to localStorage on TIMEOUT_ACTIVE_DURATION ms
            function startActiveTimer() {
                activeTimeoutID = setTimeout(function() {
                    logDurationTime('active', getFileType());
                    setLastStartTime('active', true);
                    activeTimeoutID = null;
                }, TIMEOUT_ACTIVE_DURATION);
            }
            
            // user just did something actively (e.g. keypress), decide 
            // to start timer or simply reset it
            function onActive() {
                if (!activeTimeoutID) {
                    // no activity timer running yet, start it
                    logDurationTime('active', getFileType());
                    setLastStartTime('active');
                    startActiveTimer();
                } else {
                    // timer already exists, so need to reset it and start again
                    clearTimeout(activeTimeoutID);
                    activeTimeoutID = null;
                    startActiveTimer();
                }
            }

            var timer;
            // bind all activity event such as keypress to onActive function
            document.addEventListener("mousedown", onActive, true);
            document.addEventListener("mouseup", onActive, true);
            document.addEventListener("click", onActive, true);
            document.addEventListener("dblclick", onActive, true);
            document.addEventListener('mousemove', function() {
                clearTimeout(timer);
                timer = setTimeout(onActive, 10);
            }, false);
            document.addEventListener('DOMMouseScroll', function() {
                clearTimeout(timer);
                timer = setTimeout(onActive, 10);
            }, false);
            document.addEventListener("keydown", onActive, true);
            document.addEventListener("keyup", onActive, true);
            document.addEventListener("keypress", onActive, true);
            // @TODO: needs to be tested on a touch device
            document.addEventListener("touchstart", onActive, true);
            
            // handle user opening or switching (file) tabs
            tabs.on("tabDestroy", function(e) {
                // log current activity duration and (re)start the timer
                logDurationTime('active', getFileType(e.tab));
                onActive();
            });
            tabs.on("blur", function(e) {
                // log current activity duration
                logDurationTime('active', getFileType(e.tab));
            });
        }

        function setLastStartTime(eventName, stopped) {
            // doesn't make sense to log file types for loggedIn duration
            if (eventName != 'loggedIn') {
                var fileType = getFileType();
                eventName += "-" + fileType;
            }
            
            lastStartTimes[eventName] = Date.now();
            if (stopped) {
                lastStartTimes[eventName] = -(Date.now());
            }
        }

        /**
         * Get the local storage only for this namespace ('duration').
         * @return {Array}  LocalStorage contents for namespace 'duration'.
         */
        function getDurationStorage() {
            var storage = {};
            if (localStorage[namespace]) {
                try {
                    storage = JSON.parse(localStorage.getItem(namespace));
                } catch (e) {
                    console.error("Couldn't parse JSON: " + e);
                    return console.error(localStorage);
                }
            } else {
                // set empty localStore for namespace
                localStorage[namespace] = storage;
            }
            return storage;
        }
        
        // Logs time for any duration type specified
        function logDurationTime(eventName, fileType) {
            var now      = Date.now();
            
            var params = {};
            if (fileType) {
                eventName += "-" + fileType;
                params.fileType = fileType;
            }
            
            // Lookup value in hashmap and append duration to it.
            // Do this as not to run out of memory in localStorage, 
            // especially when offline
            var lastStartTime = lastStartTimes[eventName] ? 
                lastStartTimes[eventName] : now;
            var totalDuration = 0;
            var durationSlots = [];
            var event = {};
            var storage = getDurationStorage();
            if (storage[eventName]) {
                event = storage[eventName]
                totalDuration = event.duration;
                durationSlots = event.durationSlots;
            } else {
                // set up a clean slate for this event
                event.name = eventName;
                event.startTime = lastStartTime;
            }
                
            // Get the last time we started measuring for this duration type
            // Calculate the diff between now and that last time (the slot)
            // If it was a negative last time, negate the slot
            // Add the slot to the list, and calculate the total duration
            var slot = now - Math.abs(lastStartTime);
            if (lastStartTime < 0) {
                slot = -slot;
            } else {
                totalDuration += slot;
            }
            durationSlots.push(slot); 
            
            event.durationSlots = durationSlots;
            event.duration = totalDuration; 
            event.params = params;
            storage[eventName] = event;
            // now store this new duration event in the localStorage
            localStorage.setItem(namespace, JSON.stringify(storage));
            // don't forget to update the last time we started measuring
            setLastStartTime(eventName);
        }

        /**
         * Returns the current file type being used/viewed.
         * @param  {Function} tab   The tab to get the filetype from.
         * @return {String}         Current file extension, or a non-file (e.g. Terminal) prepended by "non-file: ".
         */
        function getFileType(tab) {
            // Tab doesn't have focus
            if (!tabs.focussed)
                return "none";
                
            // Try to get the current focused tab
            if (!tab)
                tab = tabs.focussedTab;
                
            // If there's no tab opened
            if (!tab || !tab.editor)
                return "none";
            
            if (!tab.path)
                return "non-file: " + tab.editor.type;
                
            return (tab.path.substr(tab.path.lastIndexOf(".") + 1));
        }

        /***** Lifecycle *****/

        plugin.on("load", function() {
            load();
        });

        plugin.on("enable", function() {

        });

        plugin.on("disable", function() {

        });

        plugin.on("unload", function() {
            loaded = false;
        });

        /***** Register and define API *****/

        /**
         * Logs duration metrics for the IDE on three levels:
         * 
         * 1. Logged In - How long the IDE is open in some window (user-level, workspace-level).
         * 2. Window/Tab Focused - How long the IDE is actively focused in a window/pane (user-level, workspace-level, filetype-level).
         * 3. Active - How long the IDE is actively being used by doing actions like moving the mouse or pressing keys (user-level, workspace-level, filetype-level).
         * 
         * @singleton
         **/
        plugin.freezePublicAPI({
            /**
             * Log a specific Duration metric to the LocalStorage.
             * @param {String} eventName    The type of Duration, e.g. 'loggedIn'.
             * @param {String} fileType     If it exists, log the file type.
             */
            logDurationTime   : logDurationTime,
            
            /** 
             * Set the last time we started measuring a specific duration type.
             * @param {String}  eventName   The name for the duration type.
             * @param {Boolean} negative    Whether to record a negative timestamp. 
             *  Do this when a duration has stopped, so logDurationTime() knows whether to store a negative timeslot or not.
             */
            setLastStartTime : setLastStartTime
        });

        register(null, {
            duration: plugin
        });
    }
});