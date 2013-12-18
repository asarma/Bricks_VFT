define(function(require, exports, module) {
    main.consumes = ["Plugin", "debugger", "net", "proc"];
    main.provides = ["v8debugger"];
    return main;
    
    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var net      = imports.net;
        var proc     = imports.proc;
        var debug    = imports["debugger"];
        
        var Frame           = require("../../data/frame");
        var Source          = require("../../data/source");
        var Breakpoint      = require("../../data/breakpoint");
        var Variable        = require("../../data/variable");
        var Scope           = require("../../data/scope");
        
        var V8Debugger        = require("./lib/V8Debugger");
        var V8DebuggerService = require("./lib/StandaloneV8DebuggerService");

        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit   = plugin.getEmitter();
        emit.setMaxListeners(1000);
        
        var stripPrefix               = (options.basePath || "");
        var breakOnExceptions         = false;
        var breakOnUncaughtExceptions = false;
        var breakpointQueue           = [];
        
        var TYPE = "v8";
        
        var v8dbg, v8ds, state, activeFrame, sources, attached = false;
        
        var scopeTypes = {
            "0" : "global",
            "1" : "local",
            "2" : "with",
            "3" : "function",
            "4" : "catch"
        }
        
        var hasChildren = {
            "error"    : 16,
            "object"   : 8,
            "function" : 4
        }
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            debug.registerDebugger(TYPE, plugin);
        }
        
        function unload(){
            debug.unregisterDebugger(TYPE, plugin);
            loaded = false;
        }
        
        /***** Helper Functions *****/
        
        /**
         * Syncs the debug state to the client
         */
        function sync(breakpoints, reconnect, callback) {
            getSources(function(err, sources) {
                getFrames(function(err, frames) {
                    updateBreakpoints(breakpoints, function(err, breakpoints) {
                        handleDebugBreak(breakpoints, reconnect, frames[0], function(){
                            attached = true;
                            emit("attach", { breakpoints: breakpoints });
                        }, 
                        function() {
                            if (frames && frames.length) //reconnect && 
                                activeFrame = frames[0];
                            
                            // This check is for when the process is not 
                            // started with debug-brk
                            if (activeFrame) {
                                onChangeFrame(activeFrame);
                                emit("break", {
                                    frame  : activeFrame,
                                    frames : frames
                                });
                            }
                            
                            onChangeRunning();
                            callback();
                        });
                    });
                }, true); // The sync backtrace should be silent
            });
        }
        
        function updateBreakpoints(breakpoints, callback){
            function find(bp){
                for (var i = 0, l = breakpoints.length; i < l; i++) {
                    if (breakpoints[i].equals(bp))
                        return breakpoints[i];
                }
            }
            
            var list = breakpoints.slice(0);
            
            listBreakpoints(function(err, remoteBreakpoints){
                if (err) return callback(err);
                
                var found    = [];
                var notfound = [];
                
                remoteBreakpoints.forEach(function(rbp){
                    var bp;
                    if ((bp = find(rbp)))
                        found.push(bp);
                    else
                        notfound.push(rbp);
                });
                
                var i = 0;
                function next(){
                    var bp = list[i++];
                    if (!bp)
                        done();
                    else if (found.indexOf(bp) == -1)
                        setBreakpoint(bp, next);
                    else
                        next();
                }
                
                next();
                
                function done(){
                    notfound.forEach(function(bp){ 
                        bp.serverOnly = true;
                        list.push(bp);
                    });
                    
                    list.sort(function(a, b){
                        if (!a.id && !b.id) return 0;
                        if (!a.id && b.id) return 1;
                        if (a.id && !b.id) return -1;
                        return a.id - b.id;
                    });
                    
                    callback(null, list);
                }
            })
        }
        
        /**
         * Detects a break on a frame or a known breakpoint, otherwise resumes
         */
        function handleDebugBreak(breakpoints, reconnect, frame, attach, callback) {
            if (!v8dbg) {
                console.error("No debugger is set");
                attach();
                return callback();
            }
            
            var bp = breakpoints[0];
            
            // If there's no breakpoint set
            if (!bp) {
                attach();
                
                // If we reconnect to a break then don't resume.
                if (reconnect)
                    callback();
                else
                    resume(callback);
                    
                return;
            }
            
            // Check for a serverOnly breakpoint on line 0
            // this bp, is automatically created by v8 to stop on break
            if (bp.id === 1 && bp.serverOnly && bp.line === 0) {
                // The breakpoint did it's job, now lets remove it
                v8dbg.clearbreakpoint(1, function(){});
                breakpoints.remove(bp);
            }
            
            // Check if there is a real breakpoint here, so we don't resume
            function checkEval(err, variable){
                if (err || isTruthy(variable)) {
                    onChangeFrame(null);
                    attach();
                    resume(callback);
                }
                else {
                    attach();
                    callback();
                }
            }
            
            // @todo this is probably a timing issue
            if (frame) {
                var test = { path: frame.path, line: frame.line };
                for (var bpi, i = 0, l = breakpoints.length; i < l; i++) {
                    if ((bpi = breakpoints[i]).equals(test)) {
                        // If it's not enabled let's continue
                        if (!bpi.enabled)
                            break;
                          
                        // Check a condition if it has it
                        if (bpi.condition) {
                            evaluate(bpi.condition, frame, false, true, checkEval);
                        }
                        else {
                            attach();
                            callback();
                        }
                        return;
                    }
                }
            }
            
            // Resume the process
            if (reconnect) {
                attach();
                callback();
            }
            else {
                onChangeFrame(null);
                attach();
                resume(callback);
            }
        }
        
        /**
         * Removes the path prefix from a string
         */
        function strip(str) {
            return str.lastIndexOf(stripPrefix, 0) === 0
                ? str.slice(stripPrefix.length)
                : str;
        }
    
        /**
         * Returns the unique id of a frame
         */
        function getFrameId(frame){
            return frame.func.name + ":" + frame.func.inferredName 
                + ":" + frame.func.scriptId + ":" 
                + (frame.received && frame.received.ref || "")
                + frame.arguments.map(function(a){return a.value.ref}).join("-");
                
            //return (frame.func.name || frame.func.inferredName || (frame.line + frame.position));
        }
    
        function formatType(value) {
            switch (value.type) {
                case "undefined":
                case "null":
                    return value.type;
                
                case "error":
                    return value.value || "[Error]";
    
                case "boolean":
                case "number":
                    return value.value + "";
                    
                case "string":
                    return JSON.stringify(value.value);
    
                case "object":
                    // text: "#<Student>"
                    var name = value.className || (value.text 
                        ? value.text.replace(/#<(.*)>/, "$1") 
                        : "Object");
                    return "[" + name + "]";
    
                case "function":
                    return "function " + value.inferredName + "()";
    
                default:
                    return value.type;
            }
        }
        
        function isTruthy(variable){
            if ("undefined|null".indexOf(variable.type) > -1)
                return false;
            if ("false|NaN|\"\"".indexOf(variable.value) > -1)
                return false;
            return true;
        }
        
        function frameToString(frame) {
            var str     = [];
            var args    = frame.arguments;
            var argsStr = [];
    
            str.push(frame.func.name || frame.func.inferredName || "anonymous", "(");
            for (var i = 0, l = args.length; i < l; i++) {
                var arg = args[i];
                if (!arg.name)
                    continue;
                argsStr.push(arg.name);
            }
            str.push(argsStr.join(", "), ")");
            return str.join("");
        }
        
        function getPathFromScriptId(scriptId) {
            for (var i = 0; i < sources.length; i++) {
                if (sources[i].id == scriptId)
                    return sources[i].path;
            }
        };
        
        function getScriptIdFromPath(path){
            for (var i = 0; i < sources.length; i++) {
                if (sources[i].path == path)
                    return sources[i].id;
            }
        }

        function getLocalScriptPath(script) {
            var scriptName = script.name || ("-anonymous-" + script.id);
            if (scriptName.substring(0, stripPrefix.length) == stripPrefix)
                scriptName = scriptName.substr(stripPrefix.length);
                
            // windows paths come here independantly from vfs
            return scriptName.replace(/\\/g, "/");
        }
        
        function createFrame(options, script){
            var frame = new Frame({
                index    : options.index,
                name     : apf.escapeXML(frameToString(options)), //dual escape???
                column   : options.column,
                id       : getFrameId(options),
                line     : options.line,
                script   : strip(script.name),
                path     : getLocalScriptPath(script),
                sourceId : options.func.scriptId
            });
            
            var vars = [];
            
            // Arguments
            options.arguments.forEach(function(arg){
                vars.push(createVariable(arg, null, "arguments"));
            });
            
            // Local variables
            options.locals.forEach(function(local){
                if (local.name !== ".arguments")
                    vars.push(createVariable(local, null, "locals"));
            });
            
            // Adding the local object as this
            vars.push(createVariable({
                name  : "this",
                value : options.receiver,
                kind  : "this"
            }));
            
            frame.variables = vars;
            
             /*
             0: Global
             1: Local
             2: With
             3: Closure
             4: Catch >,
                if (scope.type > 1) {*/
            
            frame.scopes = options.scopes.filter(function(scope){
                return scope.type != 1;
            }).reverse().map(function(scope){
                return new Scope({
                    index      : scope.index,
                    type       : scopeTypes[scope.type],
                    frameIndex : frame.index
                });
            });
            
            return frame;
        }
        
        function createVariable(options, name, scope){
            var value = options.value;
            
            var variable = new Variable({
                name      : name || options.name,
                scope     : scope,
                value     : formatType(value),
                type      : value.type,
                ref       : typeof value.ref == "number" 
                    ? value.ref 
                    : value.handle,
                children  : hasChildren[value.type] ? true : false
            });
            
            if (value.prototypeObject)
                variable.prototype = new Variable({
                    tagName : "prototype",
                    name    : "prototype", 
                    type    : "object",
                    ref     : value.prototypeObject.ref
                });
            if (value.protoObject)
                variable.proto = new Variable({ 
                    tagName : "proto",
                    name    : "proto", 
                    type    : "object",
                    ref     : value.protoObject.ref
                });
            if (value.constructorFunction)
                variable.constructorFunction = new Variable({ 
                    tagName : "constructor", 
                    name    : "constructor", 
                    type    : "function",
                    ref     : value.constructorFunction.ref
                });
            return variable;
        }
        
        function createSource(options) {
            return new Source({
                id          : options.id,
                name        : options.name || "anonymous",
                path        : getLocalScriptPath(options),
                text        : strip(options.text || "anonymous"),
                debug       : true,
                lineOffset  : options.lineOffset
            });
        }
        
        function createBreakpoint(options, serverOnly){
            return new Breakpoint({
                id          : options.number,
                path        : getPathFromScriptId(options.script_id),
                line        : options.line,
                column      : options.column,
                condition   : options.condition,
                enabled     : options.active,
                ignoreCount : options.ignoreCount,
                serverOnly  : serverOnly || false
            });
        }
        
        /***** Event Handler *****/
    
        function onChangeRunning(e) {
            if (!v8dbg) {
                state = null;
            } else {
                state = v8dbg.isRunning() ? "running" : "stopped";
            }
    
            emit("stateChange", {state: state});
    
            if (state != "stopped")
                onChangeFrame(null);
        }
        
        function createFrameFromBreak(data){
            // Create a frame from the even information
            return new Frame({
                index    : 0,
                name     : data.invocationText,
                column   : data.sourceColumn,
                id       : String(data.line) + ":" + String(data.sourceColumn),
                line     : data.sourceLine,
                script   : strip(data.script.name),
                path     : getLocalScriptPath(data.script),
                sourceId : data.script.id,
                istop    : true
            });
        }
    
        function onBreak(e) {
            if (!attached) 
                return;
            
            // @todo update breakpoint text?
            
            var frame = createFrameFromBreak(e.data);
            onChangeFrame(frame);
            emit("break", {
                frame : frame
            });
        }
    
        function onException(e) {
            var frame = createFrameFromBreak(e.data);
            
            var options = e.data.exception;
            options.text.match(/^(\w+):(.*)$/);
            var name  = RegExp.$1 || options.className;
            var value = RegExp.$2 || options.text;
            
            options.name     = name;
            options.value    = { 
                value  : value, 
                type   : "error", 
                handle : options.handle
            };
            options.children = true;
            
            var variable = createVariable(options);
            variable.error = true;
            
            lookup(options.properties, false, function(err, properties){
                variable.properties = properties;
                
                emit("exception", {
                    frame     : frame, 
                    exception : variable
                });
            });
        }
    
        function onAfterCompile(e) {
            var queue = breakpointQueue;
            breakpointQueue = [];
            queue.forEach(function(i){
                setBreakpoint(i[0]);
            });
            
            emit("sourcesCompile", {source: createSource(e.data.script)});
        }
    
        function onChangeFrame(frame, silent) {
            activeFrame = frame;
            if (!silent)
                emit("frameActivate", { frame: frame });
        }
    
        /***** Socket *****/
        
        function Socket(port, reconnect) {
            var emit    = this.getEmitter();
            var state, stream;
            
            var PROXY = require("text!../netproxy.js")
                .replace(/\/\/.*/g, "")
                .replace(/[\n\r]/g, "")
                .replace(/\{PORT\}/, port);
            
            this.__defineGetter__("state", function(){ return state; });
            
            function connect() {
                if (state) 
                    return;
                
                if (reconnect)
                    connectToPort();
                else {
                    proc.spawn("node", {
                        args: ["-e", PROXY]
                    }, function(err, process){
                        if (err)
                            return emit("error", err);
                        
                        process.stdout.once("data", function(data){
                            connectToPort();
                        });
                            
                        process.stderr.once("data", function(data){
                            // Perhaps there's alrady a proxy running
                            connectToPort();
                        });
                        
                        // Make sure the process keeps running
                        process.unref();
                    });
                }
                
                state = "connecting";
            }
            
            function connectToPort(){
                net.connect(port + 1, {}, function(err, s){
                    if (err)
                        return emit("error", err);
                    
                    stream = s;
                    stream.on("data", function(data) {
                        emit("data", data);
                    });
                    stream.on("end", function(err){
                        emit("end", err);
                    });
                    stream.on("error", function(err){
                        emit("error", err);
                    });
                    
                    if (reconnect)
                        emit("data", "Content-Length:0\r\n\r\n");
                    
                    state = "connected";
                    emit("connect");
                });
            }
        
            function close(err) {
                stream && stream.end();
                state = null;
                emit("end", err);
            };
        
            function send(msg) {
                stream && stream.write(msg, "utf8");
            };

            // Backward compatibility
            this.addEventListener  = this.on;
            this.removeListener    = this.off;
            this.setMinReceiveSize = function(){};
            
            /**
             * 
             */
            this.connect = connect;
            
            /**
             * 
             */
            this.close = close;
            
            /**
             * 
             */
            this.send = send;
        };
        Socket.prototype = new Plugin();
        
        /***** Methods *****/
        
        function attach(runner, breakpoints, reconnect, callback) {
            if (v8ds)
                v8ds.detach();
            
            var socket = new Socket(runner.debugport, reconnect);
            socket.on("error", function(err) {
                emit("error", err);
            });
            v8ds = new V8DebuggerService(socket);
            v8ds.attach(0, function(err){
                if (err) return callback(err);

                v8dbg = new V8Debugger(0, v8ds);
                
                // register event listeners
                v8dbg.addEventListener("changeRunning", onChangeRunning);
                v8dbg.addEventListener("break", onBreak);
                v8dbg.addEventListener("exception", onException);
                v8dbg.addEventListener("afterCompile", onAfterCompile);
                
                onChangeFrame(null);
                sync(breakpoints, reconnect, callback);
            });
        }
    
        function detach() {
            if (!v8ds)
                return;
            
            v8ds.detach();
            
            onChangeFrame(null);
            onChangeRunning();
            
            if (v8dbg) {
                // on detach remove all event listeners
                v8dbg.removeEventListener("changeRunning", onChangeRunning);
                v8dbg.removeEventListener("break", onBreak);
                v8dbg.removeEventListener("exception", onException);
                v8dbg.removeEventListener("afterCompile", onAfterCompile);
            }
            
            v8ds     = null;
            v8dbg    = null;
            attached = false;
            
            emit("detach");
        }
        
        function getSources(callback) {
            v8dbg.scripts(4, null, false, function(scripts) {
                sources = [];
                for (var i = 0, l = scripts.length; i < l; i++) {
                    var script = scripts[i];
                    if ((script.name || "").indexOf("chrome-extension://") === 0)
                        continue;
                    sources.push(createSource(script));
                }
                callback(null, sources);
                
                emit("sources", {sources: sources})
            });
        }
        
        function getSource(source, callback) {
            v8dbg.scripts(4, [source.id], true, function(scripts) {
                if (!scripts.length)
                    return callback(new Error("File not found : " + source.path));

                callback(null, scripts[0].source);
            });
        }
        
        function getFrames(callback, silent) {
            v8dbg.backtrace(null, null, null, true, function(body, refs) {
                function ref(id) {
                    for (var i = 0; i < refs.length; i++) {
                        if (refs[i].handle == id) {
                            return refs[i];
                        }
                    }
                    return {};
                }
    
                var frames;
                if (body && body.totalFrames > 0) {
                    frames = body && body.frames.map(function(frame){
                        return createFrame(frame, ref(frame.script.ref));
                    }) || [];
        
                    var topFrame = frames[0];
                    if (topFrame)
                        topFrame.istop = true;
                }
                else {
                    frames = [];
                }
                
                emit("getFrames", { frames: frames });
                callback(null, frames);
            });
        }
        
        function getScope(frame, scope, callback) {
            v8dbg.scope(scope.index, frame.index, true, function(body) {
                var variables = body.object.properties.map(function(prop){
                    return createVariable(prop);
                });
                
                scope.variables = variables;
                
                callback(null, variables, scope, frame);
            });
        }
        
        function getProperties(variable, callback) {
            v8dbg.lookup([variable.ref], false, function(body) {
                var props = body[variable.ref].properties || [];
                lookup(props, false, function(err, properties){
                    variable.properties = properties;
                    callback(err, properties, variable);
                });
            });
        }
        
        function stepInto(callback){
            v8dbg.continueScript("in", null, callback);
        }
        
        function stepOver(callback){
            v8dbg.continueScript("next", null, callback);
        }
        
        function stepOut(callback){
            v8dbg.continueScript("out", null, callback);
        }
    
        function resume(callback) {
            v8dbg.continueScript(null, null, callback);
        }
    
        function suspend(callback) {
            v8dbg.suspend(function(){
                emit("suspend");
                callback && callback();
            });
        }
    
        function lookup(props, includeSource, callback) {
            v8dbg.lookup(props.map(function(p){ return p.ref }), 
              includeSource, function(body) {
                if (!body)
                    return callback(new Error("No body received"));
                  
                var properties = props.map(function(prop){ 
                    prop.value = body[prop.ref];
                    return createVariable(prop);
                });
                
                callback(null, properties);
            });
        }
        
        function setScriptSource(script, newSource, previewOnly, callback) {
            var NODE_PREFIX = "(function (exports, require, module, __filename, __dirname) { ";
            var NODE_POSTFIX = "\n});";
            newSource = NODE_PREFIX + newSource + NODE_POSTFIX;
            
            v8dbg.changelive(script.id, newSource, previewOnly, function(e) {
                callback(e);
            });
        };
        
        function restartFrame(frame, callback){
            var frameIndex = frame && typeof frame == "object" ? frame.index : frame;
            v8dbg.restartframe(frameIndex, function(body){
                if (body.result && body.result.stack_update_needs_step_in) {
                    stepInto();
                }
                else {
                    callback.apply(this, arguments);
                }
            });
        }
        
        function evaluate(expression, frame, global, disableBreak, callback) {
            var frameIndex = frame && typeof frame == "object" ? frame.index : frame;
            
            v8dbg.evaluate(expression, frameIndex, global, 
              disableBreak, function(body, refs, error){
                var name = expression.trim();
                if (error) {
                    var err = new Error(error.message);
                    err.name  = name;
                    err.stack = error.stack;
                    return callback(err);
                }
                
                var variable = createVariable({
                    name  : name,
                    value : body
                });
                
                if (variable.children) {
                    lookup(body.properties, false, function(err, properties){
                        variable.properties = properties;
                        callback(null, variable);
                    });
                }
                else {
                    callback(null, variable);
                }
            });
        }
        
        function setBreakpoint(bp, callback){
            var sm       = bp.sourcemap || {};
            var path     = sm.source || bp.path;
            var line     = sm.line || bp.line;
            var column   = sm.column || bp.column;
            var scriptId = getScriptIdFromPath(path);
            
            if (!scriptId) {
                // Wait until source is parsed
                breakpointQueue.push([bp, callback]);
                callback && callback(new Error("Source not available yet. Queuing request."));
                return false;
            }

            v8dbg.setbreakpoint("scriptId", scriptId, line, column, bp.enabled, 
                bp.condition, bp.ignoreCount, function(info){
                    bp.id = info.breakpoint;
                    if (info.actual_locations) {
                        bp.actual = info.actual_locations[0];
                        emit("breakpointUpdate", {breakpoint: bp});
                    }
                    callback && callback(null, bp, info);
                });
            
            return true;
        }
        
        function changeBreakpoint(bp, callback){
            if (breakpointQueue.some(function(i){
                return i[0] === bp;
            })) return;
            
            v8dbg.changebreakpoint(bp.id, bp.enabled, 
                bp.condition, bp.ignoreCount, function(info){
                    callback && callback(null, bp, info);
                });
        }
        
        function clearBreakpoint(bp, callback){
            if (breakpointQueue.some(function(i, index){
                if (i[0] === bp) {
                    breakpointQueue.splice(index, 1);
                    return true;
                }
            })) return;
            
            v8dbg.clearbreakpoint(bp.id, callback)
        }
        
        function listBreakpoints(callback){
            v8dbg.listbreakpoints(function(data){
                breakOnExceptions         = data.breakOnExceptions;
                breakOnUncaughtExceptions = data.breakOnUncaughtExceptions;
                
                callback(null, data.breakpoints.map(function(bp){
                    return createBreakpoint(bp);
                }));
            });
        }
        
        function setVariable(variable, parents, value, frame, callback){
            // Get variable name
            var names = [], scopeNumber, frameIndex = frame.index;
            parents.reverse().forEach(function(p){
                // Assuming scopes are accessible
                if (p.tagName == "variable")
                    names.push(p.name.replace(/"/g, '\\"'));
                else if (p.tagName == "scope")
                    scopeNumber = p.index;
            });
            names.push(variable.name);
            
            function handler(err, body){
                if (err)
                    return callback(err);
                
                variable.value = formatType(body);
                variable.type = body.type;
                variable.ref = body.handle;
                variable.properties = body.properties || [];
                variable.children = (body.properties || "").length ? true : false;
                    
//              @todo - and make this consistent with getProperties
//                if (body.constructorFunction)
//                    value.contructor = body.constructorFunction.ref;
//                if (body.prototypeObject)
//                    value.prototype = body.prototypeObject.ref;
                
                if (variable.children) {
                    lookup(body.properties, false, function(err, properties){
                        variable.properties = properties;
                        callback(null, variable);
                    });
                }
                else {
                    callback(null, variable);
                }
            }
            
            // If it's a local variable set it directly
            if (parents.length == (typeof scopeNumber == "number" ? 1 : 0))
                setLocalVariable(variable, value, scopeNumber || 0, frameIndex, handler);
            // Otherwise set a variable or property
            else
                setAnyVariable(variable, parents[0], value, handler);
        }
        
        function setLocalVariable(variable, value, scopeNumber, frameIndex, callback) {
            v8dbg.setvariablevalue(variable.name, value, scopeNumber, frameIndex, 
              function(body, refs, error){
                // lookup([variable.ref], false, function(err, properties){
                //     variable.properties = properties;
                //     callback(null, variable);
                // });
                
                if (error) {
                    var err = new Error(error.message);
                    err.name  = error.name;
                    err.stack = error.stack;
                    return callback(err);
                }
                
                callback(null, body.newValue);
            });
        }
        
        function setAnyVariable(variable, parent, value, callback){
            var expression = "(function(a, b) { this[a] = b; })"
                + ".call(__cloud9_debugger_self__, \""
                + variable.name + "\", " + value + ")";
            
            v8dbg.simpleevaluate(expression, null, true, [{
                name   : "__cloud9_debugger_self__",
                handle : parent.ref
            }], function(body, refs, error){
                if (error) {
                    var err = new Error(error.message);
                    err.name  = error.name;
                    err.stack = error.stack;
                    return callback(err);
                }
                
                callback(null, body);
            })
        }
        
        function serializeVariable(variable, callback){
            var expr = "(function(fn){ return fn.toString() })"
                + "(__cloud9_debugger_self__)";
                
            v8dbg.simpleevaluate(expr, null, true, [{
                name   : "__cloud9_debugger_self__",
                handle : variable.ref
            }], function(body, refs, error){
                callback(body.value);
            });
        }
        
        function setBreakBehavior(type, enabled, callback){
            breakOnExceptions = enabled ? type == "all" : false;
            breakOnUncaughtExceptions = enabled ? type == "uncaught" : false;
            
            v8dbg.setexceptionbreak(type, enabled, callback);
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
            unload();
        });
        
        /***** Register and define API *****/
        
        /**
         * Debugger implementation for Cloud9 IDE. When you are implementing a 
         * custom debugger, implement this API. If you are looking for the
         * debugger interface of Cloud9 IDE, check out the {@link debugger}.
         * 
         * This interface is defined to be as stateless as possible. By 
         * implementing these methods and events you'll be able to hook your
         * debugger seamlessly into the Cloud9 debugger UI.
         * 
         * See also {@link debugger#registerDebugger}.
         * 
         * @class debugger.implementation
         */
        plugin.freezePublicAPI({
            /**
             * The type of the debugger implementation. This is the identifier 
             * with which the runner selects the debugger implementation.
             * @property {String} type
             * @readonly
             */
            type : TYPE,
            /**
             * @property {null|"running"|"stopped"} state  The state of the debugger process
             * <table>
             * <tr><td>Value</td><td>      Description</td></tr>
             * <tr><td>null</td><td>       process doesn't exist</td></tr>
             * <tr><td>"stopped"</td><td>  paused on breakpoint</td></tr>
             * <tr><td>"running"</td><td>  process is running</td></tr>
             * </table>
             * @readonly
             */
            get state(){ return state; },
            /**
             * Whether the debugger will break when it encounters any exception.
             * This includes exceptions in try/catch blocks.
             * @property {Boolean} breakOnExceptions
             * @readonly
             */
            get breakOnExceptions(){ return breakOnExceptions; },
            /**
             * Whether the debugger will break when it encounters an uncaught 
             * exception.
             * @property {Boolean} breakOnUncaughtExceptions
             * @readonly
             */
            get breakOnUncaughtExceptions(){ return breakOnUncaughtExceptions; },
            
            _events : [
                /**
                 * Fires when the debugger hits a breakpoint.
                 * @event break
                 * @param {Object}           e
                 * @param {debugger.Frame}   e.frame        The frame where the debugger has breaked at.
                 * @param {debugger.Frame[]} [e.frames]     The callstack frames.
                 */
                "break",
                /**
                 * Fires when the {@link #state} property changes
                 * @event stateChange
                 * @param {Object}          e
                 * @param {debugger.Frame}  e.state  The new value of the state property.
                 */
                "stateChange",
                /**
                 * Fires when the debugger hits an exception.
                 * @event exception
                 * @param {Object}          e
                 * @param {debugger.Frame}  e.frame      The frame where the debugger has breaked at.
                 * @param {Error}           e.exception  The exception that the debugger breaked at.
                 */
                "exception",
                /**
                 * Fires when a frame becomes active. This happens when the debugger
                 * hits a breakpoint, or when it starts running again.
                 * @event frameActivate
                 * @param {Object}          e
                 * @param {debugger.Frame/null}  e.frame  The current frame or null if there is no active frame.
                 */
                "frameActivate",
                /**
                 * Fires when the result of the {@link #method-getFrames} call comes in.
                 * @event getFrames
                 * @param {Object}            e
                 * @param {debugger.Frame[]}  e.frames  The frames that were retrieved.
                 */
                "getFrames",
                /**
                 * Fires when the result of the {@link #getSources} call comes in.
                 * @event sources
                 * @param {Object}            e
                 * @param {debugger.Source[]} e.sources  The sources that were retrieved.
                 */
                "sources",
                /**
                 * Fires when a source file is (re-)compiled. In your event 
                 * handler, make sure you check against the sources you already 
                 * have collected to see if you need to update or add your source.
                 * @event sourcesCompile 
                 * @param {Object}          e
                 * @param {debugger.Source} e.file  the source file that is compiled.
                 **/
                "sourcesCompile"
            ],
            
            /**
             * Attaches the debugger to the started process.
             * @param {Object}                runner        A runner as specified by {@link run#run}.
             * @param {debugger.Breakpoint[]} breakpoints   The set of breakpoints that should be set from the start
             */
            attach : attach,
            
            /**
             * Detaches the debugger from the started process.
             */
            detach : detach,
            
            /**
             * Loads all the active sources from the process
             * 
             * @param {Function}          callback          Called when the sources are retrieved.
             * @param {Error}             callback.err      The error object if an error occured.
             * @param {debugger.Source[]} callback.sources  A list of the active sources.
             * @fires sources
             */
            getSources : getSources,
            
            /**
             * Retrieves the contents of a source file
             * @param {debugger.Source} source             The source to retrieve the contents for
             * @param {Function}        callback           Called when the contents is retrieved
             * @param {Error}           callback.err       The error object if an error occured.
             * @param {String}          callback.contents  The contents of the source file
             */
            getSource : getSource,
            
            /**
             * Retrieves the current stack of frames (aka "the call stack") 
             * from the debugger.
             * @param {Function}          callback          Called when the frame are retrieved.
             * @param {Error}             callback.err      The error object if an error occured.
             * @param {debugger.Frame[]}  callback.frames   A list of frames, where index 0 is the frame where the debugger has breaked in.
             * @fires getFrames
             */
            getFrames : getFrames,
            
            /**
             * Retrieves the variables from a scope.
             * @param {debugger.Frame}      frame               The frame to which the scope is related.
             * @param {debugger.Scope}      scope               The scope from which to load the variables.
             * @param {Function}            callback            Called when the variables are loaded
             * @param {Error}               callback.err        The error object if an error occured.
             * @param {debugger.Variable[]} callback.variables  A list of variables defined in the `scope`.
             * @param {debugger.Scope}      callback.scope      The scope to which these variables belong
             * @param {debugger.Frame}      callback.frame      The frame related to the scope.
             */
            getScope : getScope,
            
            /**
             * Retrieves and sets the properties of a variable.
             * @param {debugger.Variable}   variable             The variable for which to retrieve the properties.
             * @param {Function}            callback             Called when the properties are loaded
             * @param {Error}               callback.err         The error object if an error occured.
             * @param {debugger.Variable[]} callback.properties  A list of properties of the variable.
             * @param {debugger.Variable}   callback.variable    The variable to which the properties belong.
             */
            getProperties : getProperties,
            
            /**
             * Step into the next statement.
             */
            stepInto : stepInto,
            
            /**
             * Step over the next statement.
             */
            stepOver : stepOver,
            
            /**
             * Step out of the current statement.
             */
            stepOut : stepOut,
            
            /**
             * Continues execution of a process after it has hit a breakpoint.
             */
            resume : resume,
            
            /**
             * Pauses the execution of a process at the next statement.
             */
            suspend : suspend,
            
            /**
             * Evaluates an expression in a frame or in global space.
             * @param {String}            expression         The expression.
             * @param {debugger.Frame}    frame              The stack frame which serves as the contenxt of the expression.
             * @param {Boolean}           global             Specifies whether to execute the expression in global space.
             * @param {Boolean}           disableBreak       Specifies whether to disabled breaking when executing this expression.
             * @param {Function}          callback           Called after the expression has executed.
             * @param {Error}             callback.err       The error if any error occured.
             * @param {debugger.Variable} callback.variable  The result of the expression.
             */
            evaluate : evaluate,
            
            /**
             * Change a live running source to the latest code state
             * @param {debugger.Source} source        The source file to update.
             * @param {String}          value         The new contents of the source file.
             * @param {Boolean}         previewOnly   
             * @param {Function}        callback      Called after the expression has executed.
             * @param {Error}           callback.err  The error if any error occured.
             */
            setScriptSource : setScriptSource,
            
            /**
             * Adds a breakpoint to a line in a source file.
             * @param {debugger.Breakpoint} breakpoint           The breakpoint to add.
             * @param {Function}            callback             Called after the expression has executed.
             * @param {Error}               callback.err         The error if any error occured.
             * @param {debugger.Breakpoint} callback.breakpoint  The added breakpoint
             * @param {Object}              callback.data        Additional debugger specific information.
             */
            setBreakpoint : setBreakpoint,
            
            /**
             * Updates properties of a breakpoint
             * @param {debugger.Breakpoint} breakpoint  The breakpoint to update.
             * @param {Function}            callback             Called after the expression has executed.
             * @param {Error}               callback.err         The error if any error occured.
             * @param {debugger.Breakpoint} callback.breakpoint  The updated breakpoint
             */
            changeBreakpoint : changeBreakpoint,
            
            /**
             * Removes a breakpoint from a line in a source file.
             * @param {debugger.Breakpoint} breakpoint  The breakpoint to remove.
             * @param {Function}            callback             Called after the expression has executed.
             * @param {Error}               callback.err         The error if any error occured.
             * @param {debugger.Breakpoint} callback.breakpoint  The removed breakpoint
             */
            clearBreakpoint : clearBreakpoint,
            
            /**
             * Retrieves a list of all the breakpoints that are set in the 
             * debugger.
             * @param {Function}              callback              Called when the breakpoints are retrieved.
             * @param {Error}                 callback.err          The error if any error occured.
             * @param {debugger.Breakpoint[]} callback.breakpoints  A list of breakpoints
             */
            listBreakpoints : listBreakpoints,
            
            /**
             * Sets the value of a variable.
             * @param {debugger.Variable}   variable       The variable to set the value of.
             * @param {debugger.Variable[]} parents        The parent variables (i.e. the objects of which the variable is the property).
             * @param {Mixed}               value          The new value of the variable.
             * @param {debugger.Frame}      frame          The frame to which the variable belongs.
             * @param {Function}            callback
             * @param {Function}            callback       Called when the breakpoints are retrieved.
             * @param {Error}               callback.err   The error if any error occured.
             * @param {Object}              callback.data  Additional debugger specific information.
             */
            setVariable : setVariable,
            
            /**
             * 
             */
            restartFrame : restartFrame,
            
            /**
             * 
             */
            serializeVariable : serializeVariable,
            
            /**
             * Defines how the debugger deals with exceptions.
             * @param {"all"/"uncaught"} type          Specifies which errors to break on.
             * @param {Boolean}          enabled       Specifies whether to enable breaking on exceptions.
             * @param {Function}         callback      Called after the setting is changed.
             * @param {Error}            callback.err  The error if any error occured.
             */
            setBreakBehavior : setBreakBehavior
        });
        
        register(null, {
            v8debugger : plugin
        });
    }
});