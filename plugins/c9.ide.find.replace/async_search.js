/**
 * Searchreplace Module for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {
    var $worker = null;
    var workerSrc = "(" + function(_self) {
        var str = "";
        function setValue($str) {
            str = $str;
        }

        function findAll(str, regex, cb) {
            var matches = [];
            var last = regex.lastIndex = 0;
            var m;
            while (m = regex.exec(str)) {
                matches.push(last = m.index);
                if (!m[0].length) {
                    regex.lastIndex = last += 1;
                    if (last >= str.length)
                       matches.pop();
                }
            }

            cb({matches: matches});
        }

        _self.onmessage = function(e) {
            var msg = e.data;
            if (msg.command == "setValue") {
                setValue(msg.data);
            } else if (msg.command == "findAll") {
                try {
                    var regex = RegExp(msg.source, msg.flags || "g");
                    var searchStr = str;
                    if (msg.range)
                        searchStr = searchStr.slice(msg.range[0], msg.range[1]);
                    findAll(searchStr, regex, function(r) {
                        r.callbackId = msg.callbackId;
                        postMessage(r);
                    });
                } catch(e) {}
            } else if (msg.eval) {
                try {
                    var r = eval(msg.eval);
                } catch(e) {
                    r = e.message;
                }
                postMessage({type: "event", data: r});
            }
        };

    } + ")(this)";

    function getWorker() {
        if ($worker)
            return $worker;
        var blob = new Blob([ workerSrc ], { type: 'application/javascript' });
        var blobUrl = (window.URL || window.webkitURL).createObjectURL(blob);
        $worker = new Worker(blobUrl);
        $worker.onmessage = onMessage;
        $worker.onerror = function(e) {
            throw e;
        };
        return $worker;
    }

    function onMessage(e) {
        var msg = e.data;
        var id = msg.callbackId;
        $worker.responseTime = Date.now();
        // console.log(id, callbacks)
        if (id && callbacks[id]) {
            if (id == callbackId)
                callbacks[id](msg);
            callbacks[id] = null;
        }
    }
    var callbacks = {};
    var callbackId = 1;

    function terminateWorker() {
        $worker && $worker.terminate();
        $worker = null;
        callbacks = {};
    }

    function attachToSession() {

    }

    function detach() {
        terminateWorker();
    }

    function execFind(session, options, cb) {
        if (!session.searchTracker) {
            session.searchTracker = new SearchTracker(session);
            session.once("change", function() {session.searchTracker = null});
        }
        var st = session.searchTracker;
        session.searchTracker.get(options, function(all) {
            if (!all)
                return cb("waiting");
            
            // preprocess options
            var backwards = options.backwards === true;
            var skipCurrent = options.skipCurrent !== false;
            var wrap = options.wrap;

            var range = options.range;
            var start = options.start;
            if (!start)
                start = range ? range[backwards ? "end" : "start"] : session.selection.getRange();

            if (start.start)
                start = start[skipCurrent != backwards ? "end" : "start"];
                
            if (!options.regex)
                options.regex = RegExp(options.source, options.flags);   
            
            // find in range
            var offset = options.indexRange ? options.indexRange[0] : 0;
            // find index
            var index = st.session.doc.positionToIndex(start) - offset;
            
            var i = binIndexOf(all, index);
            
            var next = i + (backwards ? -1 : 1);
            if (!backwards && all[i] == index)
                next--;
            
            var wrapped = false;
            if (next > all.length - 1) {
                next = wrap ? 0 : all.length - 1;
                wrapped = wrap;
            } else if (next < 0) {
                next = wrap ? all.length - 1 : 0;
                wrapped = wrap;
            }
            
            if (all[next] == undefined)
                return cb(null);

            options.regex.lastIndex = all[next];
            var value = st.value;
            if (options.indexRange)
                value = value.slice(offset, options.indexRange[1]);
            var match = options.regex.exec(value);
            
            if (!match)
                return cb(null);
                
            var start = st.session.doc.indexToPosition(match.index + offset);
            var end = st.session.doc.indexToPosition(start.column + match[0].length, start.row);

            cb({
                start: start, 
                end: end,
                total: all.length,
                current: next,
                wrapped: wrapped
            });
        });
    }
    

    function binIndexOf(array, val) {
        var low = 0;
        var hi = array.length - 1;

        while (low <= hi) {
            var mid = (low + hi) >> 1;
            var c = array[mid];

            if (val > c)
                low = mid + 1;
            else if (val < c)
                hi = mid - 1;
            else
                return mid;
        }

        return low - 1;
    }

    function SearchTracker(session) {
        this.value = session.getValue();
        this.results = Object.create(null);
        this.session = session;
        this.initWorker();
    }
        
    (function(){
        this.rangeToIndex = function(r) {
            var start = this.session.doc.positionToIndex(r.start);
            var end = start - r.start.column +
                this.session.doc.positionToIndex(r.end, r.start.row);
            return [start, end];
        };
        this.get = function(re, cb) {            
            if (!re.id) {
                re.id = re.source + "|" + re.flags + (re.range || "");
            }
            if (re.range && !re.indexRange) {
                re.indexRange = this.rangeToIndex(re.range);
            }
            clearTimeout(this.crashTimer);
            var all = this.results[re.id];
            if (!all) {                
                this.getMatchOffsets(re, function(data) {
                    clearTimeout(this.crashTimer);
                    this.results[re.id] = data.matches;
                    cb(data.matches);
                }.bind(this));
                // invalid regex can crash the worker
                this.crashTimer = setTimeout(function() {
                    cb();
                }, 500);
            } else
                cb(all);
        };
        this.getMatchOffsets = function(re, cb) {
            var worker = this.initWorker();
            var now = Date.now();
            if (!worker.responseTime && worker.requestTime && now - worker.requestTime > 1000) {
                terminateWorker();
                worker = this.initWorker();
            }
            callbackId += 1;
            var id = callbackId;

            worker.responseTime = null;
            worker.requestTime = now;
            worker.postMessage({
                source: re.source,
                flags: re.flags,
                range: re.indexRange,
                callbackId: callbackId,
                command: "findAll"
            });
            callbacks[id] = cb;
        };
        this.initWorker = function() {
            var worker = getWorker();
            if (worker.value != this.value) {
                worker.postMessage({command:"setValue", data: this.value});
                worker.value = this.value;
            }
            return worker;
        };
    }).call(SearchTracker.prototype);


    exports.execFind = execFind;
});