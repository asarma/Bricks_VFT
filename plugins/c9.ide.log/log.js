/**
 * Cloud9 Logging: Logs & Metrics
 *
 * @copyright 2013, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {
    main.consumes = ["c9", "Plugin", "ext"];
    main.provides = ["log"];
    return main;

    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var ext      = imports.ext;
        var c9       = imports.c9;
        
        var template = require("text!./remote.js");
         
        /***** Initialization *****/
        
        var plugin   = new Plugin("Ajax.org", main.consumes);
        
        var origin   = options.application || "default";
        var testing  = options.testing;
        var queue    = [];
        var api;
        
        // holds the stats that other plugins want to track themselves
        // but the Log plugin needs to know about them, so it can write them
        // to the Metric server
        // format: stat.name, stat.uid, stat.workspaceId
        var registeredStats = [];
        
        // the hostname for the Metric server to send UDP messages to
        var METRICS_HOST          = options.metricHost || "23.23.88.95";
        // the port for the Metric server to send UDP messages to
        var METRICS_PORT          = options.metricPort || 4444;
        // interval to write LocalStorage stats to the DWH, e.g. 1 minute
        var INTERVAL_WRITE_TO_DWH = 60000;
                
        var loaded = false;
        var writeToDWH;
        function load() {
            if (loaded) return;
            
            c9.on("stateChange", function(e) {
                if (e.state & c9.NETWORK) {
                    logRegisteredStats();
                    plugin.enable();
                } else {
                    clearInterval(writeToDWH);
                    plugin.disable();
                }
            });
            
            logRegisteredStats();
            
            loaded = true;
        }
        
        /**
         * Fetch API (remote VFS plugin).
         * @param {Function} callback       Called when the remote API is loaded.
         * @param {Error}    callback.err   The error information returned.
         * @param {Object}   callback.api   The remote API (VFS plugin).
         */
        function fetch(callback) {
            // TODO: Buffer on no network connection via localStorage
            
            if (typeof api == "object")
                return callback(null, api);
            
            queue.push(callback);
            
            if (api === -1)
                return;
            
            api = -1;
            
            ext.loadRemotePlugin("log", {
                code     : template, 
                redefine : true
            }, function(err, remote) {
                api = remote;
                
                var q = queue; queue = [];
                q.forEach(function(fn){ fn(err, api); });
            });
        }
        
        /***** Methods *****/

        function setOrigin(application, callback) {
            origin = application;
            return callback && callback(null, origin);
        }
        
        function setMetricsPort(port, callback) {
            METRICS_PORT = port;
            return callback(null, port);
        }

        /**
         * Simply logs the message to the remote VFS plugin.
         * @param {String}   message        The message to log (a JSON object).
         * @param {Function} callback       Called when the message is logged.
         * @param {Error}    callback.err   The error information returned.
         * @param {String}   callback.data  Optional message about the status.
         */
        function logMessage(message, callback) {
            fetch(function(err, api) {
                if (err) 
                    return callback(err);
                api.log(message, callback, METRICS_PORT, METRICS_HOST);
            });
        }
        
        function logEvent(name, uid, params, callback) {
            if (isNaN(uid)) 
                return callback("Specified User ID is not a number");
            var metric = {
                origin  : origin, 
                type    : "event", 
                name    : name, 
                uid     : uid, 
                params  : params, 
                ts      : new Date().getTime()
            };
            logMessage(metric, function(err, result) {
                if (err) 
                    return callback("Couldn't send metric: " + metric);
                    
                return callback(null, result);
            });
        }
        
        function logDurationEvents(events, callback) {
            var metric = events.pop();
            
            logMessage(metric, function(err, result) {
                if (err) 
                    return callback("Couldn't send metric: " + metric);
                
                return callback(null, result);
            });
            
            if(events.length > 0)
                logDurationEvents(events, callback);
        }
        
        function logDuration(name, startTime, duration, durationSlots, uid, 
            params, callback) {
            if (isNaN(uid))
                return callback("User ID is not a number: " + typeof uid);

            // parse the name so e.g. 'windowFocused-js' becomes 'windowFocused'
            if (name.indexOf("-") > -1)
                name = name.substr(0, name.indexOf("-"));
            var events = [];
            var totalDuration = 0;
            var slotDuration = 0;
            for (var i = 0; i < durationSlots.length; i++) {
                var slot = durationSlots[i];
                // reached a negative value or the end of the list
                // (non-negative), so create a new event if we
                // have something to add to it, else ignore it
                if ((slot < 0 && slotDuration > 0) ||
                    (i == (durationSlots.length - 1) && slot > 0)) {
                    // at the end of the list, containing a positive value
                    if (i == (durationSlots.length - 1) && slot > 0)
                        slotDuration += slot;
                        
                    // reached a 0 value or the end of the list (ignore negatives)
                    // so create a new event
                    var event = {
                        origin      : origin, 
                        type        : "duration", 
                        name        : name, 
                        duration    : slotDuration,
                        uid         : uid, 
                        params      : params, 
                        startTime   : startTime,
                        ts          : new Date().getTime()
                    };
                    events.push(event);
                    
                    // start fresh on a new event and increase startTime
                    startTime += slotDuration;
                    slotDuration = 0;
                }
                
                // if this is a negative value (not in the beginning), but we 
                // don't have a positive value yet, upgrade the starting time
                if (slot < 0 && slotDuration === 0)
                    startTime += Math.abs(slot);
                
                // if this is a non-negative slot, add it up to what we have
                if (slot > 0)
                    slotDuration += slot;
                    
                // always add this slot to the total duration we've gone through
                totalDuration += Math.abs(slot);
            }
            // now send the events to an async function to log to Metric server
        
            logDurationEvents(events, callback);
        }

        function logMetric(type, name, uid, params, callback) {
            if (isNaN(uid))
                return callback("User ID is not a number: " + typeof uid);
            if (Object.prototype.toString.call(params) !== '[object Array]')
                return callback("Specified params variable is not an array");
            var metric = {
                origin: origin, 
                type: type, 
                name: name, 
                uid: uid, 
                params: params, 
                ts: new Date().getTime()
            };
            logMessage(metric, function(err) {
                if (err) {
                    console.error(err);
                    return callback("Couldn't send metric: " + err);
                }
            });
            return callback(null);
        }
        
        // plugins that want to log stats themselves need to register first
        function registerStats(loggerName, statsToLog, uid, workspaceId) {
            // format: stat.name, stat.uid, stat.workspaceId
            for(var i = 0; i < statsToLog.length; i++) {
                var stats = {
                    name: statsToLog[i], 
                    uid: uid, 
                    workspaceId: workspaceId
                };
                registeredStats.push(stats);
            }
            logRegisteredStats();
        }
        
        /**
         * Takes care of logging all stats that are registered by other plugins.
         */
        function logRegisteredStats() {
            // if in test mode, don't measure & send to DWH automatically,
            // only when requested by the unit test
            if (!testing) {
                writeToDWH = setInterval(function() {
                    // for each stat that needs to be logged, start processing
                    for (var i = 0; i < registeredStats.length; i++) {
                        var stat = registeredStats[i];
                        writeLocalStatsToDWH(stat.name, stat.uid, stat.workspaceId);
                    }
                }, INTERVAL_WRITE_TO_DWH);
            }
        }
        
        function writeLocalStatsToDWH(statsCategory, uid, workspaceId, stats) {
            // process Duration stats first - get from namespaced local storage
            var namespace = uid + "-" + workspaceId + "-" + statsCategory;
            var storage   = localStorage[namespace];
            if (storage) {
                try {
                    storage = JSON.parse(storage);
                } catch (e) {
                    console.error("Couldn't parse to JSON: " + e 
                        + " for storage: " + localStorage);
                }
            }
            
            // starting from the full local storage if needed
            if (!stats)
                stats = storage;
                
            if (!stats || Object.keys(stats).length === 0)
                return;
            
            // fake 'pop' below: get first element and remove it from the stack
            var event = stats[Object.keys(stats)[0]];
            delete stats[Object.keys(stats)[0]];
            
            if (event) {
                var params = {};
                if (event.params)
                    params = event.params;
                    
                var durationSlots = {};
                if (event.durationSlots)
                    durationSlots = event.durationSlots;
                    
                // can be user-level, workspace-level & file-level
                if (event.fileType) {
                    var i = event.fileType.indexOf(":");
                    if (i > -1) {
                        params.editorType = event.fileType.substr(i + 2, 
                            event.fileType.length);
                    } else {
                        params.fileType = event.fileType;
                    }
                }
                
                logDuration(event.name, event.startTime, event.duration, 
                    durationSlots, uid, params, function(err, result) {
                    if (err)
                        return console.error("Couldn't send " + event.name 
                            + " event: " + err);
                        
                    var eventName = event.name;
                    if (event.fileType)
                        eventName += "-" + event.fileType;
                    delete storage[eventName];
                    // @TODO: is this needed? Is storage reference sufficient?
                    localStorage.setItem(namespace, JSON.stringify(storage));
                });
            }
                
            if (Object.keys(stats).length > 0)
                writeLocalStatsToDWH(statsCategory, uid, workspaceId, stats);
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
         * Logging plugin for Cloud9 IDE. 
         * 
         * Registers metrics such as events and duration.
         * @singleton
         */
        plugin.freezePublicAPI({
            /**
             * Log a self-defined metric to the Metric server.
             * @param {String}   type           The type of metric (e.g. 'event').
             * @param {String}   name           The name for the metric.
             * @param {Number}   uid            The Unique User ID.
             * @param {Array}    params         Any miscellaneous parameters.
             * @param {Function} callback       Called when the metric is logged.
             * @param {Error}    callback.err   The error information returned.
             */
            logMetric   : logMetric,
            
            /**
             * Log an event to the Metric server.
             * @param {String}   name           The name for the event.
             * @param {Number}   uid            The Unique User ID.
             * @param {Array}    params         Any miscellaneous parameters.
             * @param {Function} callback       Called when the event is logged.
             * @param {Error}    callback.err   The error information returned.
             * @param {String}   callback.data  Optional status message.
             */
            logEvent    : logEvent,
            
            /**
             * Log a duration type to the Metric server.
             * @param {String}   name           The name for the type of duration.
             * @param {Number}   startTime      The starting time for the measurement.
             * @param {Number}   duration       The total duration.
             * @param {Array}    durationSlots  Slots measured (negative/positive).
             * @param {Number}   uid            The Unique User ID.
             * @param {Array}    params         Any miscellaneous parameters.
             * @param {Function} callback       Called when the duration is logged.
             * @param {Error}    callback.err   The error information returned.
             * @param {String}   callback.data  Optional status message.
             */
            logDuration : logDuration,
            
            /**
             * Sets the origin, indicating from which application it originates.
             * @param {String}   application        The application to set origin to.
             * @param {Function} callback           Called when the duration is logged.
             * @param {Error}    callback.err       The error information returned.
             * @param {String}   callback.origin    The origin that was set.
             */
            setOrigin   : setOrigin,
            
            /**
             * Sets the port on which to send metrics to the Metric server.
             * @param {Number}   port           The port to set the Metric port to.
             * @param {Function} callback       Called when the duration is logged.
             * @param {Error}    callback.err   The error information returned.
             * @param {String}   callback.port  The port that was set.
             */
            setMetricsPort   : setMetricsPort,
            
            /**
             * Register specific stats that need to be processed.
             * 
             * This is required to do by plugins that want to log metrics 
             * themselves, so the Logger plugin knows what to write to the DWH.
             * @param {String} loggerName   The name of the plugin registering.
             * @param {Array}  statsToLog   List of stats to log, e.g. 'duration'.
             * @param {Number} uid          The User ID.
             * @param {String} workspaceId  The Workspace ID.
             */
            registerStats: registerStats,
            
            
            /**
             * Stream each entry in localStorage to the DWH via the Log plugin.
             * @param {String} statsCategory    Category, e.g. 'duration'.
             * @param {Number} uid              User ID.
             * @param {String} workspaceId      Workspace ID.
             * @param {Array}  stats            Stats left to process; leave empty to search the full category in storage.
             */
            writeLocalStatsToDWH   : writeLocalStatsToDWH
        });
        
        register(null, { "log": plugin });
    }
});
