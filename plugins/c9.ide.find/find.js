define(function(require, exports, module) {
    main.consumes = ["Plugin", "finder", "util"];
    main.provides = ["find"];
    return main;

    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var finder   = imports.finder;
        var util     = imports.util;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        // var emit   = plugin.getEmitter();
        
        var basePath   = options.basePath;
        var retrieving = false;
        var queue      = [];
        var cached, cacheTime;
        
        /***** Methods *****/
        
        function getFileList(options, callback){
            if (cached && !options.nocache 
              && new Date() - cacheTime < 60 * 60 * 1000)
                return callback(null, cached);
    
            queue.push([options, callback]);
            
            if (retrieving)
                return;
            
            if (!options.base)
                options.base = basePath;
    
            cached     = "";
            retrieving = true;
            
            finder.list(options, function(err, stream) {
                if (!err) {
                    cacheTime  = new Date();
                }

                var needsBuffer = [];
                queue.forEach(function(iter){
                    if (err || !iter[0].buffer)
                        iter[1](err, stream);
                    else
                        needsBuffer.push(iter[1]);
                });
                queue = [];
                
                if (err || !needsBuffer) return;
                
                cached = "";
                stream.on("data", function(lines){
                    cached += lines;
                });
                stream.on("end", function(){
                    retrieving = false;
                    if (options.base && options.base != "/") {
                        var rgx = new RegExp(util.escapeRegExp(options.base), "g");
                        cached  = cached.replace(rgx, "").replace(/\\/g, "/");
                    }
                    
                    needsBuffer.forEach(function(cb){
                        cb(null, cached);
                    });
                });
            });
        }
        
        function findFiles(options, callback){
            if (!options.base)
                options.base = basePath;
            
            finder.find(options, function(err, stream){
                if (err || !options.buffer)
                    return callback(err, stream);
                
                var buffer = "";
                stream.on("data", function(lines){
                    buffer += lines;
                });
                stream.on("end", function(){
                    if (options.base && options.base != "/") {
                        var rgx = new RegExp(util.escapeRegExp(options.base), "g");
                        buffer = buffer.replace(rgx, "").replace(/\\/g, "/");
                    }
                    callback(null, buffer);
                });
            });
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){

        });
        plugin.on("enable", function(){

        });
        plugin.on("disable", function(){

        });
        plugin.on("unload", function(){
        });
        
        /***** Register and define API *****/
        
        /**
         * Finds or lists files and/or lines based on their filename or contents.
         * 
         * Example of getting a list of all the files in folder:
         * 
         *     find.getFileList({
         *         path   : "/",
         *         hidden : false,
         *         buffer : true
         *     }, function(err, result){
         *         if (err) throw err;
         *         console.log(result);
         *     });
         * 
         * Example of searching for a keyword in all javascript files in a 
         * certain path, excluding _test.js files.
         * 
         *     find.findFiles({
         *         path    : "/",
         *         query   : "var basepath",
         *         hidden  : false,
         *         pattern : "*.js,-*_test.js",
         *         buffer  : true
         *     }, function(err, result){
         *         if (err) throw err;
         *         console.log(result);
         *     })
         * 
         * @singleton
         */
        plugin.freezePublicAPI({
            
            /**
             * @ignore
             */
            get basePath(){ return basePath; },
            
            /**
             * Retrieves a list of files and lines that match a string or pattern
             * This method tries to do intelligent caching by hooking into the
             * fs and watcher.
             * @param {Object}  options 
             * @param {String}  options.path              The path to search in (displayed in the results). Defaults to "".
             * @param {String}  [options.base]            The base path to search in (is not displayed in the results when buffered). Defaults to the fs root.
             * @param {String}  options.query             The text or regexp to match the file contents with
             * @param {Boolean} [options.casesensitive]   Specifies whether to match on case or not. Default is false;
             * @param {Boolean} [options.wholeword]       Specifies whether to match the `pattern` as a whole word.
             * @param {String}  [options.hidden]          Specifies whether to include files starting with a dott. Defaults to false.
             * @param {String}  [options.regexp]          Specifies whether the `pattern` is a regular expression.
             * @param {String}  [options.pattern]         Specify what files/dirs to include 
             *      and exclude. Separate with a "," and prefix the words with minus '-' to exclude.
             * @param {Boolean} [options.replaceAll]      Specifies whether to replace the found matches
             * @param {String}  [options.replacement]     The string to replace the found matches with
             * @param {Boolean} [options.buffer]          Specifies whether to buffer the request. This changes 
             *      what is returned in the callback to a string instead of a stream.
             * @param {Function}        callback          Called when the results come in
             * @param {Error}           callback.err      The error object if an error has occured.
             * @param {proc.Stream/String}   callback.results  The search results 
             *   are a string when `options.buffer` is set to true, otherwise 
             *   it is a stream.
             */
            findFiles : findFiles,
            
            /**
             * Retrieves a list of files under a path
             * @param {Object}  options
             * @param {String}  options.path            The path to search in (displayed in the results). Defaults to "".
             * @param {String}  [options.base]          The base path to search in (is not displayed in the results when buffered). Defaults to the fs root.
             * @param {Boolean} [options.hidden]        Specifies whether to include files starting with a dott. Defaults to false.
             * @param {Number}  [options.maxdepth]      The maximum amount of parents a file can have.
             * @param {Boolean} [options.nocache]       Specifies whether to ignore the cache
             * @param {Boolean} [options.buffer]        Specifies whether to buffer the request. This changes what is returned in the callback to a string instead of a stream.
             * @param {Function}      callback          Called when the results come in
             * @param {Error}         callback.err      The error object if an error has occured.
             * @param {proc.Stream/String} callback.results  The search results 
             *   are a string when `options.buffer` is set to true, otherwise 
             *   it is a stream.
             */
            getFileList : getFileList
        });
        
        register(null, {
            find: plugin
        });
    }
});