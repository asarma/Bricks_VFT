/*
 * jsonalyzer multi-file analysis plugin
 *
 * @copyright 2012, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "ui", "layout", "commands", "ide", "language"
    ];
    main.provides = [];
    return main;

    function main(options, imports, register) {
        throw Error("This plugin hasn't been fully ported to newclient/newcollab yet");
        
        var Plugin   = imports.Plugin;
        var ide = imports.ide;
        var language = require("ext/language/language");

        var stdoutBuffers = {};
        var stderrBuffers = {};
        var saveTriggers = {};
        var firstUsed = false;
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        
        var loaded = false;
        function load(){
            if (loaded) return;
            loaded = true;
            
            ide.addEventListener("init.ext/language/language", function() {
                language.worker.on("linereport_invoke", onWorkerMessage);
                ide.addEventListener("socketMessage", onServerMessage, true);
                ide.addEventListener("afterfilesave", onFileSave);
                // Make sure static base is initialized and kept up-to-date
                language.registerLanguageHandler("ext/linereport/linereport_base");
            });
        }
    
        function onWorkerMessage(event) {
            if (!firstUsed && event.data.path) {
                firstUsed = true;
                onFirstUse(event);
            }
    
            var doc = ide.getActivePage() && ide.getActivePage().$doc;
            var path = event.data.path;
            if (!doc || (path && path !== util.stripWSFromPath(doc.getNode().getAttribute("path"))))
                return;
            function send() {
                ide.send(event.data.command);
            }
            if (!path || !doc.getNode().getAttribute("changed") || doc.getNode().getAttribute("changed") == "0")
                send();
            else
                saveTriggers[path] = send;
        }
    
        function isCollabSlave() {
             var collab = require("core/ext").extLut["ext/collaborate/collaborate"];
             // Use != here instead of !== since we may compare numbers and strings. Yup.
             return collab && collab.ownerUid && collab.myUserId != collab.ownerUid;
        }
    
        function onServerMessage(event) {
            var message = event.message;
            var id = message.extra && message.extra.linereport_id;
            if (!id)
                return;
            switch (message.type) {
                case "npm-module-data": case "other-data":
                    if (event.message.stream === "stdout")
                        stdoutBuffers[id] = (stdoutBuffers[id] || "") + event.message.data;
                    else
                        stderrBuffers[id] = (stderrBuffers[id] || "") + event.message.data;
    
                    break;
                case "npm-module-exit": case "other-exit":
                    language.worker.emit("linereport_invoke_result", {data: {
                        id: id,
                        code: event.message.code,
                        stdout: stdoutBuffers[id] || "",
                        stderr: stderrBuffers[id] || ""
                    }});
                    if (stdoutBuffers[id])
                        delete stdoutBuffers[id];
                    if (stderrBuffers[id])
                        delete stderrBuffers[id];
                    break;
            }
        }
    
        function onFileSave(event) {
            var oldPath = util.stripWSFromPath(event.oldpath);
            if (saveTriggers[oldPath]) {
                saveTriggers[oldPath]();
                delete saveTriggers[oldPath];
            }
        }
    
        function onFirstUse(event) {
            /* How to trigger linereport automatically with the latest
                file state without force-enabling autosave ?
                Collab ?! - maybe
             */
            ide.dispatchEvent("track_action", {
                type: "linereport_firstuse",
                language: event.data.language,
                source: event.data.source
            });
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        
        /***** Register and define API *****/
        
        /**
         * @singleton
         * @ignore
         **/
        plugin.freezePublicAPI({
            
        });
        
        register(null, {});
    }

});