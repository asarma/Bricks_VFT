define(function(require, module, exports) {
    "use strict";
    
    main.consumes = ["Plugin"];
    main.provides = ["http"];
    return main;

    function main(options, imports, register) {
        var URL = require("url");
        var qs  = require("querystring");
        
        var plugin = new imports.Plugin("Ajax.org", main.consumes);
        var buffer = [];
        var vfs, state;
        
        function request(url, options, callback) {
            if (!callback)
                return request(url, {}, options);
                
            if (typeof options == "string")
                return request(url, {method: options}, callback);
            
            // Wait until we have network before sending the call
            if (state === 0 && (!options || !options.force)) {
                buffer.push([url, options, callback]);
                return;
            }
            
            var method      = options.method || "GET";
            var headers     = options.headers || {};
            var body        = options.body || "";
            var contentType = options.contentType 
                || "application/x-www-form-urlencoded; charset=UTF-8";
            var timeout     = options.timeout || 2000;
            var async       = options.sync !== true;
            var parsedUrl   = parseUrl(url, options.query);
            
            var xhr = new XMLHttpRequest();
            
            if (options.overrideMimeType)
                xhr.overrideMimeType = options.overrideMimeType;
            
            xhr.open(method, URL.format(parsedUrl), async);
            headers["Content-Type"] = contentType;
            for (var header in headers)
                xhr.setRequestHeader(header, headers[header]);
            
            // encode body            
            if (typeof body == "object") {
                if (contentType.indexOf("application/json") === 0) {
                    try {
                        body = JSON.stringify(body);
                    } catch(e) {
                        return done(new Error("Could not serialize body as json"));
                    }
                }
                if (contentType.indexOf("application/x-www-form-urlencoded") === 0) {
                    body = qs.stringify(body);
                }
                else if (Object.prototype.toString.call(body) == "[object File]") {
                    // pass as is
                }
                else {
                    body = body.toString();
                }    
            }
            
            if (options.progress) {
                var obj = method == "PUT" ? xhr.upload : xhr;
                obj.onprogress = function(e) {
                    if (e.lengthComputable)
                        options.progress(e.loaded, e.total);
                };
            }
            
            var timer;
            var timedout = false;
            if (timeout) {
                timer = setTimeout(function() {
                    timedout = true;
                    xhr.abort();
                    var err = new Error("Timeout");
                    err.code = "ETIMEOUT";
                    done(err);
                }, timeout);
            }
            
            xhr.send(body || "");
            
            xhr.onload  = function(e) {
                var res = {
                    body    : xhr.responseText,
                    status  : xhr.status,
                    headers : parseHeaders(xhr.getAllResponseHeaders())
                };
                
                var data;
                switch (options.overrideMimeType || res.headers["content-type"]) {
                    case "application/json":
                        try {
                            data = JSON.parse(xhr.responseText);
                        } catch (e) {
                            return done(e); 
                        }
                        break;
                    default:
                        data = xhr.responseText;
                        
                }
                
                if (this.status > 299) {
                    var err = new Error(xhr.responseText);
                    err.code = xhr.status;
                    return done(err, data, res);
                }
                
                done(null, data, res);
            };
            
            xhr.onerror = function(e) {
                e.code = e.target.status;
                done(e);
            }; 

            var called = false;
            function done(err, data, res) {
                // Retry error calls when offline
                if (err && state === 0 && (!options || !options.force)
                  && (err.code === 0 || err.code == "ETIMEOUT")) {
                    buffer.push([url, options, callback]);
                    return;
                }
                
                timer && clearTimeout(timer);
                if (called) return;
                called = true;
                callback(err, data, res);
            }
        }
        
        var callbackId = 1;
        function jsonP(url, options, callback) {
            if (!callback) return jsonP(url, {}, options);
            
            var cbName = "__josnpcallback" + callbackId++;
            var callbackParam = options.callbackParam || "callback";

            var parsedUrl = parseUrl(url, options.query);
            parsedUrl.query[callbackParam] = cbName;

            window[cbName] = function(json) {
                delete window.cbName;
                callback(json);  
            };
            
            var head = document.getElementsByTagName("head")[0] || document.documentElement;
            var s = document.createElement('script');
        
            s.src = URL.format(parsedUrl);
            head.appendChild(s);
            
            s.onload = s.onreadystatechange = function(_, isAbort) {
                if (isAbort || !s.readyState || s.readyState == "loaded" || s.readyState == "complete") {
                    head.removeChild(s);
                    s = s.onload = s.onreadystatechange = null;
                }
            };
        }
        
        function parseUrl(url, query) {
            query = query || {};
            var parsedUrl = URL.parse(url, true);
            for (var key in query)
                parsedUrl.query[key] = query[key];
                
            delete parsedUrl.search;
            
            return parsedUrl;
        }
        
        function parseHeaders(headerString) {
            return headerString
                .split('\u000d\u000a')
                .reduce(function(headers, headerPair) {
                    var index = headerPair.indexOf('\u003a\u0020');
                    if (index > 0) {
                        var key = headerPair.substring(0, index).toLowerCase();
                        var val = headerPair.substring(index + 2);
                        headers[key] = val;
                    }
                    return headers;
                }, {});
        }
        
        function decorateVFS(plugin){
            if (vfs) return;
            
            function emptyBuffer(){
                var b = buffer;
                buffer = [];
                b.forEach(function(item){
                    request.apply(this, item);
                });
            }
            
            vfs = plugin;
            vfs.on("connect", function(){
                state = 1;
                emptyBuffer();
            });
            vfs.on("disconnect", function(){
                state = 0;
            });
            vfs.on("away", function(){
                state = 0;
            });
            vfs.on("back", function(){
                state = 1;
                emptyBuffer();
            });
        }
        
        /**
         * Simple API for performing HTTP requests.
         * 
         * Example:
         * 
         *     http.request("http://www.c9.io", function(err, data){
         *         if (err) throw err;
         *         console.log(data);
         *     });
         * 
         * @singleton
         */
        plugin.freezePublicAPI({
            /**
             * @ignore
             */
            set vfs(v){ decorateVFS(v); },
            
            /**
             * Performs an HTTP request
             * 
             * @param {String}   url                         Target URL for the HTTP request
             * @param {Object}   [options]                   Request options
             * @param {String}   [options.method]            HTTP method (default=GET)
             * @param {Object}   [options.query]             URL query parameters as an object
             * @param {String}   [options.body]              HTTP body for PUT and POST
             * @param {Object}   [options.headers]           Request headers
             * @param {Number}   [options.timeout]           Timeout in ms (default=2000)
             * @param {String}   [options.contentType='application/x-www-form-urlencoded; charset=UTF-8']    Content type of sent data 
             * @param {String}   [options.overrideMimeType]  Overrides the MIME type returned by the server
             * @param {Function} [options.progress]          Progress event handler
             * @param {Function} [options.progress.loaded]   The amount of bytes downloaded/uploaded.
             * @param {Function} [options.progress.total]    The total amount of bytes to download/upload.
             * @param {Function} callback                    Called when the request returns.
             * @param {Error}    callback.err                Error object if an error occured.
             * @param {String}   callback.data               The data received.
             * @param {Object}   callback.res           
             * @param {String}   callback.res.body           The body of the response message.
             * @param {Number}   callback.res.status         The status of the response message.
             * @param {Object}   callback.res.headers        The headers of the response message.
             */
            request: request,
            
            /**
             * Performs a JSONP request 
             * 
             * @param {String} url                                 Target URL for the JSONP request
             * @param {Object} [options]                           Request options
             * @param {String} [options.callbackParam="callback"]  name of the callback query parameter
             * @param {Object} [options.query]                     URL query parameters as an object
             * @param {Function} callback                    Called when the request returns.
             * @param {Error}    callback.err                Error object if an error occured.
             * @param {String}   callback.data               The data received.
             * @param {Object}   callback.res           
             * @param {String}   callback.res.body           The body of the response message.
             * @param {Number}   callback.res.status         The status of the response message.
             */
            jsonP: jsonP
        });
        
        register(null, {
            http: plugin
        });
    }
});