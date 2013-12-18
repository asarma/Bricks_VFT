/**
 * Provides access to OS-level APIs such as the filesystem, processes
 * and network APIs. These APIs are similar to those that Node.js 
 * provides and have been adjusted to work well in a browser context.
 *
 * @module c9.fs
 * @main c9.fs
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
//@todo might have to add queueing for safe operations
define(function(require, exports, module) {
    main.consumes = ["vfs", "Plugin", "auth"];
    main.provides = ["fs"];
    return main;

    function main(options, imports, register) {
        var vfs         = imports.vfs;
        var Plugin      = imports.Plugin;
        
        var stream      = require("./fs.streams")(vfs, options.base, options.baseProc);
        var xhr         = options.cli ? stream : require("./fs.xhr")(vfs.rest);
        
        var api = {
            readFile    : xhr.readFile,
            writeFile   : xhr.writeFile,
            readdir     : xhr.readdir,
            rename      : stream.rename,
            exists      : stream.exists,
            stat        : stream.stat,
            mkdirP      : stream.mkdirP,
            mkdir       : stream.mkdir,
            unlink      : stream.unlink,
            rmfile      : stream.rmfile,
            rmdir       : stream.rmdir,
            copy        : stream.copy,
            symlink     : stream.symlink,
            watch       : stream.watch,
            unwatch     : stream.unwatch,
            metadata    : xhr.metadata
        }
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit   = plugin.getEmitter();
        emit.setMaxListeners(500);
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
        }
        function wrap(name, fn){
            return function(path){
                var args  = Array.prototype.slice.call(arguments);
                var event = {path: path, args: args};
                var progressEventName;
                
                if (typeof args[args.length - 1] != "function")
                    throw new Error("Missing callback for " + name);

                if (emit("before" + uCaseFirst(name), event) === false)
                    return false;
                
                var original_callback = args.pop();
                args.push(name == "unwatch" && original_callback.__cb__ || cb);
                
                // Add progress event for readFile / writeFile
                if (name == "readFile" || name == "writeFile") {
                    if (name == "readFile")
                        progressEventName = "downloadProgress";
                    else if (name == "writeFile")
                        progressEventName = "uploadProgress";
                        
                    args.push(function(loaded, total){
                        emit(progressEventName, {
                            path     : path,
                            loaded   : loaded,
                            total    : total
                            // complete : loaded == total
                        });
                    });
                }
                
                function cb(err){
                    var result = 0;
                    
                    var hasError = err && typeof err != "boolean";
                    if (hasError) {
                        var errorEvent = { name: name, error: err, args: args };
                        
                        // Error Event
                        if (emit("error", errorEvent) === false) result++;
                        event.error = err;
                    }
                    
                    // After event
                    event.result = Array.prototype.slice.call(arguments);
                    if (emit("after" + uCaseFirst(name), event) === false) 
                        result++;
                
                    // Original Callback
                    if (original_callback.apply(this, arguments) === false)
                        result++;
                    
                    // Assuming that there won't be any other progress events 
                    // when the xhr completes
                    if (progressEventName)
                        emit(progressEventName, { path: path, complete: true });
                    
                    if (hasError && result)
                        emit("userError", errorEvent);
                }
                original_callback.__cb__ = cb;
                
                fn.apply(this, args);
            };
        }
        
        /***** Methods *****/
        
        function getExtension(path){
            path = path.substr(path.lastIndexOf("/") + 1);
            return path.indexOf(".") > -1 
                ? path.substr(path.lastIndexOf(".") + 1)
                : "";
        }
        
        function uCaseFirst(str){
            return str.charAt(0).toUpperCase() + str.substr(1);
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
            loaded = false;
        });
        
        /***** Register and define API *****/
        
        var names = Object.keys(api)
        
        // Wrap the API calls
        names.forEach(function(name){ api[name] = wrap(name, api[name]); });
        
        // Define the before/after events for each call
        var events = [];
        names.forEach(function(n){ 
            events.push("before" + uCaseFirst(n));
            events.push("after" + uCaseFirst(n));
        });
        
        /**
         * Provides access to the filesystem of the workspace.
         * @singleton
         */
        plugin.freezePublicAPI({
            _events : events.push(
                /** 
                 * Fires when a file operation returns an error
                 * @event error
                 * @param {Object} e
                 * @param {Mixed}  e.error the error information returned by the operation
                 * @param {String} e.name  the name of the function that was called
                 **/
                 "error",
                 
                /** 
                 * Fires when a part of a file is downloaded
                 * @event downloadProgress
                 * @param {Object}  e
                 * @param {String}  e.path      the path of the file that this progress event is for
                 * @param {Number}  e.loaded    the number of bytes that have been downloaded
                 * @param {Number}  e.total     the total number of bytes for this file
                 * @param {Boolean} e.complete  whether the download has completed.
                 **/
                "downloadProgress",
                
                /** 
                 * Fires when a part of a file is uploaded
                 * @event uploadProgress
                 * @param {Object}  e
                 * @param {String}  e.path      the path of the file that this progress event is for
                 * @param {Number}  e.loaded    the number of bytes that have been uploaded
                 * @param {Number}  e.total     the total number of bytes for this file
                 * @param {Boolean} e.complete  whether the upload has completed.
                 **/
                "uploadProgress"
            ) && events,
            
            /**
             * Calculates the extension portion of a path string
             * @param path
             */
            getExtension : getExtension,
            
            /**
             * Reads the entire contents from a file in the workspace.
             * 
             * Example:
             * 
             *     fs.readFile('/config/server.js', function (err, data) {
             *         if (err) throw err;
             *         console.log(data);
             *     });
             * 
             * @param {String}   path           the path of the file to read
             * @param {Object}   [encoding]     the encoding of the content for the file
             * @param {Function} callback       called after the file is read
             * @param {Error}    callback.err   the error information returned by the operation
             * @param {String}   callback.data  the contents of the file that was read
             * @fires error
             * @fires downloadProgress
             */
            /** 
             * Fires before a file is read
             * @event beforeReadFile
             * @cancellable
             * @param {Object} e
             * @param {String} e.path the path to the file to read
             * @param {Array}  e.args the arguments to the function
             */
            /**
             * Fires after a file is read
             * @event afterReadFile
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the file to read
             * @param {Array}  e.result  the arguments to the callback
             */
            readFile: api.readFile,
            
            /**
             * Writes a file in the workspace
             * 
             * @param {String}   path          the path of the file to write 
             * @param {String}   data          the content of the file
             * @param {Object}   [encoding]    the encoding of the content for the file
             * @param {Function} callback      called after the file is written
             * @param {Error}    callback.err  the error information returned by the operation
             * @fires error
             * @fires uploadProgress
             */
            /** 
             * Fires before a file is written
             * @event beforeWriteFile
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the file to write
             * @param {Array}  e.args  the arguments to the function
             */
            /** 
             * Fires after a file is written
             * @event afterWriteFile
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the file to write
             * @param {Array}  e.result  the arguments to the callback
             */
            writeFile: api.writeFile,
            
            /**
             * Read the contents of a directory as an array of stat objects.
             * @param {String}   path            the path of the directory to get the listing from
             * @param {Function} callback        called after the file listing is read
             * @param {Error}    callback.err    the error information returned by the operation
             * @param {String[]} callback.files  a list of strings containing the filenames of the files in the directory
             * @fires error
             */
            /** 
             * Fires before a file listing is read
             * @event beforeReaddir
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the directory
             * @param {Array}  e.args  the arguments to the function
             */
            /** 
             * Fires after a file listing is read
             * @event afterReaddir
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the directory
             * @param {Array}  e.result  the arguments to the callback
             */
            readdir: api.readdir,
            
            /**
             * Rename/move a file or directory.
             * @param {String}  from      the current path of the file or directory to move/rename
             * @param {String}  to        the new path of the file or directory
             * @param {Object}  [options] 
             * @param {Boolean} [options.overwrite]  specifying whether an existing file 
             *        should be overwritten. If set to false an error is returned
             *        if a file with the same name already exists in that path.
             * @param {Function} callback            called after the file or directory is moved/renamed
             * @param {Error}    callback.err        the error information returned by the operation
             * @fires error
             */
            /** 
             * Fires before the file or directory is moved/renamed
             * @event beforeRename
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the file or directory
             * @param {Array}  e.args  the arguments to the function
             */
            /** 
             * Fires after the file or directory is moved/renamed
             * @event afterRename
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the file or directory
             * @param {Array}  e.result  the arguments to the callback
             */
            rename: api.rename,
            
            /**
             * Tests if a file or directory exists
             * @param {String}   path             the path of the file or directory to test for
             * @param {Function} callback         called after the test is completed
             * @param {Boolean}  callback.exists  whether the path exists
             * @fires error
             */
            /** 
             * Fires before testing for the existence of a file or directory
             * @event beforeExists
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the file of directory to test for
             * @param {Array}  e.args  the arguments to the function
             */
            /** 
             * Fires after testing for the existence of a file or directory
             * @event afterExists
             * @param {Object} e
             * @param {String} e.path  the path to the file of directory to test for
             * @param {Array}  e.args  the arguments to the function
             */
            exists: api.exists,
            
            /**
             * Loads the stat information for a single path entity.
             * @param {String}   path      the path of the file or directory to stat
             * @param {Function} callback  called after the information is retrieved
             * @param {Error}    callback.err  
             * @param {Object}   callback.data 
             * @param {String}   callback.data.name      The basename of the file path (eg: file.txt).
             * @param {Number}   callback.data.size      The size of the entity in bytes.
             * @param {Number}   callback.data.mtime     The mtime of the file in ms since epoch.
             * @param {Number}   callback.data.mime      The mime type of the entity. 
             *   Directories will have a mime that matches /(directory|directory)$/. 
             *   This implementation will give inode/directory for directories.
             * @param {String}   callback.data.link      If the file is a symlink, 
             *   this property will contain the link data as a string.
             * @param {Object}   callback.data.linkStat  The stat information 
             *   for what the link points to.
             * @param {String}   callback.data.fullPath  The linkStat object 
             *   will have an additional property that's the resolved path relative to the root.
             * @fires error
             */
            /** 
             * Fires before the file information is retrieved
             * @event beforeStat
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the file or directory to stat
             * @param {Array}  e.args  the arguments to the function
             */
            /** 
             * Fires after the file information is retrieved
             * @event afterStat
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the file or directory to stat
             * @param {Array}  e.result  the arguments to the callback
             */
            stat: api.stat,
            
            /**
             * Creates all non-existing directories of the path.
             * @param {String}   path          the path to directory to create
             * @param {Function} callback      called after the directories are created
             * @param {Error}    callback.err  the error information returned by the operation
             * @fires error
             */
            /** 
             * Fires before the directories are created
             * @event beforeMkdirP
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the directories to create
             * @param {Array}  e.args  the arguments to the function
             */
            /** 
             * Fires after the directories are created
             * @event afterMkdirP
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the directories to create
             * @param {Array}  e.result  the arguments to the callback
             */
            mkdirP: api.mkdirP,
            
            /**
             * Create a directory at path. Will error with EEXIST if something is already at the path.
             * @param {Object}   e
             * @param {String}   e.path          the path of the directory to create
             * @param {Function} e.callback      called after the directory is created
             * @param {Error}    e.callback.err  the error information returned by the operation
             * @fires error
             */
            /** 
             * Fires before the directory is created
             * @event beforeMkdir
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the directory is created
             * @param {Array}  e.args  the arguments to the function
             */
            /** 
             * Fires after the directory is created
             * @event afterMkdir
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the directory is created
             * @param {Array}  e.result  the arguments to the callback
             */
            mkdir: api.mkdir,
            
            /**
             * Delete a file at path
             * @param {String}   path          the path of the file or directory to unlink
             * @param {Function} callback      called after the file is unlinked
             * @param {Error}    callback.err  the error information returned by the operation
             * @fires error
             */
            /** 
             * Fires before a file is unlinked
             * @event beforeUnlink
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the file to unlink
             * @param {Array}  e.args  the arguments to the function
             */
            /** 
             * Fires after a file is unlinked
             * @event afterUnlink
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the file to unlink
             * @param {Array}  e.result  the arguments to the callback
             */
            unlink: api.unlink,
            
            /**
             * Delete a file at path.
             * @param {String}   path          the path of the file to delete
             * @param {Function} callback      called after the file is deleted
             * @param {Error}    callback.err  the error information returned by the operation
             * @fires error
             */
            /** 
             * Fires before a file is deleted
             * @event beforeRmfile
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the file to delete
             * @param {Array}  e.args  the arguments to the function
             */
            /** Fires after a file is deleted
             * @event afterRmfile
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the file to delete
             * @param {Array}  e.result  the arguments to the callback
             */
            rmfile: api.rmfile,
            
            /**
             * Delete a directory at path
             * @param {String}   path               the path of the directory to delete
             * @param {Object}   [options] 
             * @param {Boolean}  [options.recursive]  If options.recursive is 
             *   truthy, it will instead shell out to rm -rf after resolving the path.
             * @param {Function} callback           called after the directory is deleted
             * @param {Error}    callback.err       the error information returned by the operation
             * @fires error
             */
            /** Fires before the directory is deleted
             * @event beforeRmdir
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the directory to delete
             * @param {Array}  e.args  the arguments to the function
             */
            /** Fires after the directory is deleted
             * @event afterRmdir
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the directory to delete
             * @param {Array}  e.result  the arguments to the callback
             */
            rmdir: api.rmdir, 
            
            /**
             * Copy a file within the workspace
             * @param {String}  from                  the path of the file or directory to copy
             * @param {String}  to                    the path to where to copy the file or directory
             * @param {Object}  [options] 
             * @param {Boolean} [options.recursive]   specifying whether to recursively copy a directory
             * @param {Boolean} [options.overwrite]   specifying whether an existing file 
             *      at `to` is overwritten. If set to false the name `to` path 
             *      is postfixed (before the extension) with a number to make 
             *      the filename unique (i.e. test.js will become test.1.js).
             * @param {Function} callback             called after the file is copied
             * @param {Error}    callback.err         the error information returned by the operation
             * @param {Object}   callback.result 
             * @param {String}   callback.result.to   the new path of the file that 
             *   is copied. This is only relevant for when overwrite is not set 
             *   or set to false. This function will find a new filename by 
             *   appending a number after the filename, before the extension 
             *   (i.e. test.js will become test.1.js).
             * @fires error
             */
            /** 
             * Fires before the file or directory is copied
             * @event beforeCopy
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the file to copy
             * @param {Array}  e.args  the arguments to the function
             */
            /** 
             * Fires after the file or directory is copied
             * @event afterCopy
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the file to copy
             * @param {Array}  e.result  the arguments to the callback
             */
            copy: api.copy, //path, to, callback
            
            /**
             * Create a special symlink file at path. The symlink data will be 
             * the value of target. No translation of the link data is done. 
             * It's taken literally.
             * @param {String}   path           the path of the file or directory to symlink
             * @param {String}   target         the target of the symlink
             * @param {Function} callback       called after the file or directory is symlinked
             * @param {Error}    callback.err   the error information returned by the operation
             * @param {Object}   callback.data  
             * @fires error
             */
            /** 
             * Fires before the file or directory is symlinked
             * @event beforeSymlink
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the file to symlink
             * @param {Array}  e.args  the arguments to the function
             */
            /** 
             * Fires after the file or directory is symlinked
             * @event afterSymlink
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the file to symlink
             * @param {Array}  e.result  the arguments to the callback
             */
            symlink: api.symlink, //path, target, callback
            
            /**
             * Watches for changes on a file or directory
             * @param {String}   path               the path of the file or directory to watch
             * @param {Function} callback           called after the 
             *   file is watched with event = 'init' or when a file is changed
             *   with an event 'rename' or 'change'
             * @param {Error}    callback.err       the error information returned by the operation
             * @param {String}   callback.event     The name of the event. Can be any 
             *   of the following values: init, delete, change.
             * @param {String}   callback.filename  The name of the file that is 
             *   changed. On some platforms (e.g. OSX) this value is never filled.
             * @fires error
             */
            /** 
             * Fires before a file is watched
             * @event beforeWatch
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the file or directory to watch
             * @param {Array}  e.args  the arguments to the function
             */
            /** 
             * Fires after a file is watched
             * @event afterWatch
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the file or directory to watch
             * @param {Array}  e.result  the arguments to the callback
             */
            watch: api.watch,
            
            /**
             * Stop watching for changes on a file or directory
             * @param {String}   path          the path of the file or directory to unwatch
             * @param {Function} callback      called after the file is unwatched
             * @param {Error}    callback.err  the error information returned by the operation
             * 
             * @fires error
             */
            /** 
             * Fires before a file is unwatched
             * @event beforeUnwatch
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the file or directory to unwatch
             * @param {Array}  e.args  the arguments to the function
             */
            /** 
             * Fires after a file is unwatched
             * @event afterUnwatch
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the file or directory to unwatch
             * @param {Array}  e.result  the arguments to the callback
             */
            unwatch: api.unwatch,
            
            /**
             * Set metadata for a file. This is used by Cloud9 to store data like
             *   the scroll position, selection and undo stack.
             * @param {String}   path          the path of the file or directory to unwatch
             * @param {Object}   data          the metadata for this file
             * @param {Function} callback      called after the metadata is saved
             * @param {Error}    callback.err  the error information returned by the operation
             * @fires error
             */
            /** 
             * Fires before setting metadata
             * @event beforeMetadata
             * @cancellable
             * @param {Object} e
             * @param {String} e.path  the path to the file to set metadata for
             * @param {Array}  e.args  the arguments to the function
             */
            /** 
             * Fires after setting metadata
             * @event afterMetadata
             * @param {Object} e
             * @param {Error}  e.error   the error information returned by the operation
             * @param {String} e.path    the path to the file to set metadata for
             * @param {Array}  e.result  the arguments to the callback
             */
            metadata: api.metadata
        });
        
        register(null, {
            fs: plugin
        });
    }
});
