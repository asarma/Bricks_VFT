define(function(require, exports, module) {
    "use strict";
    
    main.consumes = ["Plugin", "http", "auth.bootstrap"];
    main.provides = ["auth"];
    return main;

    function main(options, imports, register) {
        var Plugin  = imports.Plugin;
        var http    = imports.http;
        var _login  = imports["auth.bootstrap"].login;

        /***** Initialization *****/
        
        var plugin      = new Plugin("Ajax.org", main.consumes);
        var emit        = plugin.getEmitter();
        var accessToken = options.accessToken || "";

        /***** Methods *****/

        function request(url, options, callback) {
            if (!callback)
                return request(url, {}, options);
                
            options.query = options.query || {};
            // TODO try also using the Authorization header
            options.query.access_token = accessToken;
            http.request(url, options, function(err, data, res) {
                // If we get a 'forbidden' status code login again and retry
                if (res && res.status == 401) {
                    login();
                    plugin.once("login", function() {
            
                        request(url, options, callback);
                    });
                    return;
                }
                
                callback(err, data, res);
            });
        }
        
        var loggingIn = false;
        function login() {
            if (loggingIn) return;
            
            loggingIn = true;
            _login(function(err, token) {
                loggingIn = false;
                accessToken = token;
                emit("login");
            });
        }
        
        /***** Register and define API *****/
        
        /**
         * Provides login information
         * @singleton
         **/
        plugin.freezePublicAPI({
            /**
             * 
             */
            get accessToken() { return accessToken; },
            
            /**
             * Wrapper for http.request which adds authorization information to
             * the request
             * 
             * @param {String} url       target URL for the HTTP request
             * @param {Object} options  optional request options. Same format
             *   as {@link http#request http.request}.
             * @param {Function} callback                    Called when the request returns.
             * @param {Error}    callback.err                Error object if an error occured.
             * @param {String}   callback.data               The data received.
             * @param {Object}   callback.res           
             * @param {String}   callback.res.body           The body of the response message.
             * @param {Number}   callback.res.status         The status of the response message.
             * @param {Object}   callback.res.headers        The headers of the response message.
             */
            request: request
        });
        
        register(null, {
            auth: plugin
        });
    }
});