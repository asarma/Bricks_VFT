/**
 * Cloud9 Language Foundation
 *
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "tabManager", "language", "ui" , "menus", "dialog.question",
        "ace", "language.marker", "language", "commands",
        "language.complete"
    ];
    main.provides = ["language.refactor"];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var plugin = new Plugin("Ajax.org", main.consumes);
        var language = imports.language;
        var menus = imports.menus;
        var commands = imports.commands;
        var complete = imports["language.complete"];
        var ui = imports.ui;
        var tabs = imports.tabManager;
        var aceHandle = imports.ace;
        var marker = imports["language.marker"];
        var question = imports["dialog.question"];
        var completeUtil = require("plugins/c9.ide.language/complete_util");
        var PlaceHolder = require("ace/placeholder").PlaceHolder;

        var worker;
        var mnuRename;
        var mnuRename2;
        var placeHolder;
        var oldCommandKey;
        var oldIdentifier;
        var lastAce;
        var isGenericRefactor;
        
        var loaded;
        function load() {
            if (loaded)
                return;
            loaded = true;
            
            language.getWorker(function(err, langWorker) {
                if (err)
                    return console.error(err);
                worker = langWorker;
                worker.on("refactoringsResult", function(event) {
                    enableRefactorings(event);
                });
        
                worker.on("renamePositionsResult", function(event) {
                    if (!tabs.focussedTab || !tabs.focussedTab.editor || tabs.focussedTab.editor.ace !== lastAce || !event.data)
                        return;
                    isGenericRefactor = event.data.isGeneric;
                    initRenameUI(event.data, lastAce);
                    worker.emit("onRenameBegin", {data: {}});
                });
        
                worker.on("commitRenameResult", function(event) {
                    var data = event.data;
                    if (data.err) {
                        question.show(
                            "Rename",
                            "Are you sure you would like to rename '" + data.oldName + "' to '" + data.newName + "'?",
                            data.err,
                            function() { // yes
                                placeHolder.detach();
                                cleanup();
                            },
                            function() { // no
                                cancelRename();
                                cleanup();
                            }
                        );
                    } else {
                        placeHolder.detach();
                        cleanup();
                    }
                });
            });
            
            commands.addCommand({
                name    : "renameVar",
                hint    : "Rename refactor",
                bindKey : {mac: "Option-Command-R", win: "Ctrl-Alt-R"},
                exec: function(editor) {
                    beginRename(editor);
                }
            }, plugin);
            mnuRename = new ui.item({
                disabled: true,
                command: "renameVar",
                caption: "Rename Variable"
            });
            mnuRename2 = new ui.item({
                id : "mnuCtxEditorRename",
                caption : "Rename",
                command: "renameVar"
            });
            menus.addItemByPath("Tools/~", new ui.divider(), 10000, plugin);
            menus.addItemByPath("Tools/Rename Variable", mnuRename, 20000, plugin);
    
            // right click context item in ace
            aceHandle.getElement("menu", function(menu) {
                menus.addItemToMenu(menu, mnuRename2, 750, plugin);
                menu.on("prop.visible", function(e) {
                    // only fire when visibility is set to true
                    if (e.value) {
                        // because of delays we'll enable by default
                        mnuRename2.enable();
                        var ace = tabs.focussedTab.editor.ace;
                        if (ace)
                            worker.emit("refactorings", { data: ace.getSelection().getCursor() });
                    }
                });
            });
        }
        
        function enableRefactorings(event) {
            var names = event.data;
            var enabled = false;
            for (var i = 0; i < names.length; i++) {
                var name = names[i];
                if (name === "renameVariable" || name === "rename") {
                    enabled = true;
                }
            }
            
            if (enabled) {
                mnuRename.enable();
                mnuRename2.enable();
            }
            else {
                mnuRename.disable();
                mnuRename2.disable();
            }
        }
    
        function beginRename(editor) {
            var ace = lastAce = editor.ace;
    
            ace.focus();
            var curPos = ace.getCursorPosition();
            var doc = ace.getSession().getDocument();
            var line = doc.getLine(curPos.row);
            oldIdentifier = getFullIdentifier(line, curPos, ace);
            worker.emit("renamePositions", {data: curPos});
        }
        
        function initRenameUI(data, ace) {
            // Temporarily disable these markers, to prevent weird slow-updating events whilst typing
            marker.disableMarkerType('occurrence_main', ace);
            marker.disableMarkerType('occurrence_other', ace);
            var cursor = ace.getCursorPosition();
    
            var mainPos = data.pos;
            // Exclude the main position from others
            var others = data.others.filter(function (o) {
                return !(o.row === mainPos.row && o.column === mainPos.column);
            });
            placeHolder = new PlaceHolder(ace.session, data.length, mainPos, others, "language_rename_main", "language_rename_other");
            if (cursor.row !== mainPos.row || cursor.column < mainPos.column || cursor.column > mainPos.column + data.length) {
                // Cursor is not "inside" the main identifier, move it there
                ace.moveCursorTo(mainPos.row, mainPos.column);
            }
            placeHolder.showOtherMarkers();
            if (language.isContinuousCompletionEnabled())
                language.setContinuousCompletionEnabled(false);
            
            // Monkey patch
            if (!oldCommandKey) {
                oldCommandKey = ace.keyBinding.onCommandKey;
                ace.keyBinding.onCommandKey = onKeyPress;
            }
    
            if (language.isContinuousCompletionEnabled())
                language.setContinuousCompletionEnabled(false);
            placeHolder.on("cursorLeave", function() {
                commitRename();
            });
        }
    
        function commitRename() {
            // Finished refactoring in editor
            // -> continue with the worker giving the initial refactor cursor position
            var doc = lastAce.getSession().getDocument();
            var oPos = placeHolder.pos;
            var line = doc.getLine(oPos.row);
            var newIdentifier = getFullIdentifier(line, oPos, lastAce);
            worker.emit("commitRename", {data: { oldId: oldIdentifier, newName: newIdentifier.value, isGeneric: isGenericRefactor } });
        }
    
        function cancelRename() {
            if (placeHolder) {
                placeHolder.detach();
                placeHolder.cancel();
            }
            worker.emit("onRenameCancel", {data: {}});
        }
    
        function cleanup() {
            if (language.isContinuousCompletionEnabled())
                language.setContinuousCompletionEnabled(true);
            marker.enableMarkerType('occurrence_main');
            marker.enableMarkerType('occurrence_other');
            placeHolder = null;
            oldIdentifier = null;
            if (oldCommandKey) {
                lastAce.keyBinding.onCommandKey = oldCommandKey;
                oldCommandKey = null;
            }
        }
    
        function onKeyPress(e, hashKey, keyCode) {
            var keyBinding = lastAce.keyBinding;
    
            switch(keyCode) {
                case 32: // Space can't be accepted as it will ruin the logic of retrieveFullIdentifier
                case 27: // Esc
                    cancelRename();
                    e.preventDefault();
                    break;
                case 13: // Enter
                    commitRename();
                    e.preventDefault();
                    break;
                default:
                    oldCommandKey.apply(keyBinding, arguments);
                    break;
            }
        }
    
        function destroy() {
            commands.removeCommand("renameVar");
        }
    
        function getFullIdentifier(line, pos, ace) {
            var regex = complete.getIdentifierRegex(null, ace);
            var prefix = completeUtil.retrievePrecedingIdentifier(line, pos.column, regex);
            var postfix = completeUtil.retrieveFollowingIdentifier(line, pos.column, regex);
            return {
                column: pos.column - prefix.length,
                row: pos.row,
                value: prefix + postfix
            };
        }
        
        plugin.on("load", function(){
            load();
        });
        
        register(null, {
            "language.refactor": plugin
        });
    }
});
