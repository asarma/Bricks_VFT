/**
 * Ajax.org Code Editor (ACE)
 *
 * @copyright 2010, Ajax.org Services B.V.
 * @license LGPLv3 <http://www.gnu.org/licenses/lgpl-3.0.txt>
 * @author Fabian Jakobs <fabian AT ajax DOT org>
 */
define(function(require, exports, module) {

"use strict";

var Util = require("./util");
var EventEmitter = Util.EventEmitter;
var V8Message = require("./V8Message");

var V8Debugger = module.exports = function(tabId, v8service) {
    this.tabId = tabId;
    this.$running = true;
    this.$service = v8service;

    var pending = this.$pending = {};

    var self = this;
    this.$service.addEventListener("debugger_command_" + tabId, function(e) {
        var response = V8Message.fromObject(e.data);
        //console.log("Incoming debugger message for event " + response.event + " (" + response.request_seq + "): ", response);

        var requestSeq = response.request_seq;
        if (pending[requestSeq]) {
            pending[requestSeq](response.body, response.refs || null,
                !response.success && {message: response.message} || null);
            delete pending[requestSeq];
        }
        else if (response.event) {
            self.emit(response.event, {data: response.body});
        }

        self.$updateRunning(response);
     });
};

(function() {

    Util.implement(this, EventEmitter);

    this.$seq = 0;

    this.$updateRunning = function(response) {
        // workaround for V8 bug
        // http://code.google.com/p/v8/issues/detail?id=724
        if (response.event == "scriptCollected")
            return;

        var running = true;
        if (response.type == "response") {
            running = response.running;
        }
        else if (response.type == "event") {
            if (response.event == "break" || response.event == "exception")
                running = false;
        }

        if (running !== this.$running) {
            this.$running = running;
            this.emit("changeRunning", {data: running});
        }
    };

    this.isRunning = function() {
        return this.$running;
    };

    this.continueScript = function(stepaction, stepcount, callback) {
        var msg = new V8Message("request");
        msg.command = "continue";
        if (stepaction) {
            msg.arguments = {
                stepcount: stepcount || 1,
                stepaction: stepaction
            };
        }
        this.$send(msg, callback);
    };

    this.lookup = function(handles, includeSource, callback) {
        var msg = new V8Message("request");
        msg.command = "lookup";
        msg.arguments = {
            inlineRefs: false,
            handles: handles
        };
        if (includeSource)
            msg.arguments.includesSource = includeSource;

        this.$send(msg, callback);
    };

    this.backtrace = function(fromFrame, toFrame, bottom, inlineRefs, callback) {
        var msg = new V8Message("request");
        msg.command = "backtrace";
        msg.arguments = {
            inlineRefs: !!inlineRefs
        };
        if (typeof fromFrame == "number")
            msg.arguments.fromFrame = fromFrame;

        if (typeof toFrame == "number")
            msg.arguments.toFrame = toFrame;

        if (typeof(bottom) === "boolean")
            msg.arguments.bottom = bottom;

        this.$send(msg, callback);
    };

    this.scope = function(number, frameNumber, inlineRefs, callback) {
        var msg = new V8Message("request");
        msg.command = "scope";
        msg.arguments = {
            number: number,
            inlineRefs: !!inlineRefs
        };

        if (typeof frameNumber == "number")
            msg.arguments.frameNumber = frameNumber;

        this.$send(msg, callback);
    };

    this.version = function(callback) {
        var msg = new V8Message("request");
        msg.command = "version";
        this.$send(msg, callback);
    };

    this.scripts = function(types, ids, includeSource, callback) {
        var msg = new V8Message("request");
        msg.command = "scripts";
        msg.arguments = {
            types: types || V8Debugger.NORMAL_SCRIPTS,
            includeSource: !!includeSource
        };
        if (ids)
            msg.arguments.ids = ids;
        this.$send(msg, function(scripts, refs, err) {
            callback(scripts || [], refs, err);
        });
    };

    this.evaluate = function(expression, frame, global, disableBreak, callback) {
        var _self = this;

        var msg = new V8Message("request");
        msg.command = "evaluate";
        msg.arguments = { expression : expression };
        
        if (typeof frame == "number")
            msg.arguments.frame = frame;
        
        if (global)
            msg.arguments.global = global;
        
        if (disableBreak)
            msg.arguments.disable_break = disableBreak;

        /* evaluation always take place on one single frame, but we need additional variables
         * that are not there, because the v8 debugger only passes variables to the frame that
         * are needed. Therefore we need to push additional items to the stack, and we gain them
         * from the backtrace
         */
        this.backtrace(null, null, false, true, function (resp) {
            // build a hashtable
            var addContext = { };
            
            // run over all frames
            if (resp.totalFrames > 0) {
                for(var ix = 0, frames = resp.frames, frame = frames[ix]; ix < frames.length; frame = frames[++ix]) {
                    // then over all the locals
                    for (var lix = 0, local = frame.locals[lix]; lix < frame.locals.length; local = frame.locals[++lix]) {
                        // check whether a higher frame already has a variable declared under this name
                        // this way we prevent property overwriting
                        if (!addContext[local.name]) {
                            addContext[local.name] = local.value.ref;
                        }
                    }
                }
            }

            // the message needs an array so we map the object to one
            msg.arguments.additional_context = [];
            for (var name in addContext) {
                if (!addContext.hasOwnProperty(name)) continue;

                msg.arguments.additional_context.push({ name: name, handle: addContext[name] });
            }

            // and now send the complete message to the debugger
            _self.$send(msg, callback);
        });
    };
    
    this.simpleevaluate = function(expression, frame, global, additionalContext, callback) {
        var _self = this;

        var msg = new V8Message("request");
        msg.command = "evaluate";
        msg.arguments = { expression : expression };
        
        if (typeof frame == "number")
            msg.arguments.frame = frame;
        
        if (global)
            msg.arguments.global = global;
        
        msg.arguments.disable_break = true;
        
        if (additionalContext)
            msg.arguments.additional_context = additionalContext;
            
        _self.$send(msg, callback);
    }
    
    this.setexceptionbreak = function(type, enabled, callback) {
        var msg = new V8Message("request");
        msg.command = "setexceptionbreak";
        msg.arguments = {
            type: type,
            enabled: enabled
        };
        this.$send(msg, callback);
    };
    
    this.setvariablevalue = function(name, type, scopeNumber, frameIndex, callback) {
        var msg = new V8Message("request");
        msg.command = "setVariableValue";
        
        var value;
        if (type == "undefined")
            value = { type: type };
        else if (type == "null")
            value = { value: null };
        else if (type.charAt(0) == "\"")
            value = { value: JSON.parse(type) };
        else
            value = { value: type };
        
        msg.arguments = {
            name: name,
            scope: {
              number: scopeNumber,
              frameNumber: frameIndex
            },
            newValue: value
        };

        this.$send(msg, callback);
    };

    this.setbreakpoint = function(type, target, line, column, enabled, condition, ignoreCount, callback) {
        var msg = new V8Message("request");
        msg.command = "setbreakpoint";
        msg.arguments = {
            type: type,
            target: target,
            line: line,
            enabled: enabled !== true ? false : true
        };

        if (column)
            msg.arguments.column = column;

        if (condition)
            msg.arguments.condition = condition;

        if (ignoreCount)
            msg.arguments.ignoreCount = ignoreCount;

        this.$send(msg, callback);
    };

    this.changebreakpoint = function(breakpoint, enabled, condition, ignoreCount, callback) {
        var msg = new V8Message("request");
        msg.command = "changebreakpoint";
        msg.arguments = {
            enabled: enabled !== true ? false : true,
            breakpoint: breakpoint
        };

        if (condition)
            msg.arguments.condition = condition;

        if (ignoreCount)
            msg.arguments.ignoreCount = ignoreCount;

        this.$send(msg, callback);
    };

    this.clearbreakpoint = function(breakpoint, callback) {
        var msg = new V8Message("request");
        msg.command = "clearbreakpoint";
        msg.arguments = {
            breakpoint: breakpoint
        };
        this.$send(msg, callback);
    };

    this.listbreakpoints = function(callback) {
        var msg = new V8Message("request");
        msg.command = "listbreakpoints";
        this.$send(msg, callback);
    };

    this.suspend = function(callback) {
        var msg = new V8Message("request");
        msg.command = "suspend";
        this.$send(msg, callback);
    };

    this.changelive = function(scriptId, newSource, previewOnly, callback) {
        var msg = new V8Message("request");
        msg.command = "changelive";
        msg.arguments = {
            script_id: scriptId,
            new_source: newSource,
            preview_only: !!previewOnly
        };

        this.$send(msg, callback);
    };
    
    this.restartframe = function(frameId, callback) {
        var msg = new V8Message("request");
        msg.command = "restartframe";
        msg.arguments = {
            frame: frameId
        };

        this.$send(msg, callback);
    };

    this.$send = function(msg, callback) {
        if (callback)
            this.$pending[msg.seq] = callback;
            
        this.$service.debuggerCommand(this.tabId, msg.stringify());
    };

}).call(V8Debugger.prototype);

V8Debugger.NATIVE_SCRIPTS = 1;
V8Debugger.EXTENSION_SCRIPTS = 2;
V8Debugger.NORMAL_SCRIPTS = 4;

});