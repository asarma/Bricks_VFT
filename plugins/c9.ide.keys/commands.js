define(function(require, exports, module) {
    main.consumes = ["Plugin", "settings"];
    main.provides = ["commands"];
    return main;
    
    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var settings = imports.settings;
        
        var lang           = require("ace/lib/lang");
        var event          = require("ace/lib/event");
        var KeyBinding     = require("ace/keyboard/keybinding").KeyBinding;
        var CommandManager = require("ace/commands/command_manager").CommandManager;
        
        /***** Initialization *****/
        
        var nav            = navigator.platform.toLowerCase();
        var platform       = nav.indexOf("mac") > -1 ? "mac" : "win";
        
        var commandManager = new CommandManager(platform);
        var commands       = commandManager.commands;
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit   = plugin.getEmitter();
        
        // Use our exec function
        commandManager.exec = exec;
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            var kb = new KeyBinding({
                commands : commandManager,
                fake     : true
            });
            event.addCommandKeyListener(document.documentElement, kb.onCommandKey.bind(kb));
            
            settings.on("read", function(e){
                settings.setDefaults("user/keybindings", [
                    ["preset", "default"],
                    ["platform", "auto"]
                ]);
                
                var platform = settings.get("user/keybindings/@platform");
                if (platform && platform != "auto")
                    changePlatform(platform);
            });
        }
        
        /***** Methods *****/
        
        function changePlatform(value){
            platform = value == "auto"
                ? (apf.isMac ? "mac" : "win")
                : value;
            
            Object.keys(commands).forEach(function(name){
                var command    = commands[name];
                var displayKey = command.bindKey || command.nativeKey;
                if (displayKey)
                    plugin.commandManager
                        .setProperty(command.name, displayKey[platform]);
            });
        }
    
        function getHotkey(command){
            return commands[command].bindKey[platform];
        }
        
        var markDirty = lang.delayedCall(function(){
            emit("update");
        }, 500);
        
        function exec(command, editor, args, e){
            if (typeof command === 'string')
                command = commands[command];
            
            if (!command)
                return false;
        
            if (!editor || editor.fake)
                editor = emit("getEditor");
            
            if (Array.isArray(command)) {
                for (var i = command.length; i--; ) {
                    var cmd = command[i];
                    if (!cmd.isAvailable || cmd.isAvailable(editor, args, e))
                        break;
                    else
                        cmd = null;
                }
                if (!cmd)
                    return;
                command = cmd;
            } 
            else if (command.isAvailable && !command.isAvailable(editor, args, e))
                return; //Disable commands for other contexts

            if (command.findEditor)
                editor = command.findEditor(editor);
            
            if (editor && editor.$readOnly && !command.readOnly)
                return false;

            var execEvent = {
                editor  : editor,
                command : command,
                args    : args
            };
            
            var retvalue;
            if (editor && editor.commands) {
                retvalue = editor.commands._emit("exec", execEvent);
                editor.commands._signal("afterExec", execEvent);
            } else {
                retvalue = commandManager._emit("exec", execEvent);
            }

            if (retvalue !== false && args) {
                // e.returnValue = false;
                // e.preventDefault();
                if (typeof apf != "undefined")
                    apf.queue.empty();
            }
            return retvalue !== false;
        }
        
        function addCommand(command, hostPlugin, asDefault){
            plugin.commandManager[command.name] = "";
            
            if (command.readOnly === undefined)
                command.readOnly = true;
            
            commandManager.addCommand.apply(commandManager, arguments);
            var displayKey = command.bindKey || command.nativeKey;
            if (displayKey)
                plugin.commandManager
                    .setProperty(command.name, displayKey[platform]);

            if (!command.originalBindKey)
                command.originalBindKey = command.bindKey 
                    || (command.bindKey = { mac: "", win: "" });
            
            hostPlugin.addOther(function(){
                removeCommand(command.name);
            });
            
            markDirty.schedule();
            return command;
        }
        
        function addCommands(list, hostPlugin, asDefault){
            list && Object.keys(list).forEach(function(name) {
                var command = list[name];
                if (typeof command === "string")
                    return bindKey(command, name, asDefault);
    
                if (typeof command === "function")
                    command = { exec: command };
    
                if (!command.name)
                    command.name = name;
                    
                if (asDefault && commands[command.name])
                    return;
                    
                command.isDefault = asDefault;
    
                addCommand(command, hostPlugin, asDefault);
            });
        }
        
        function removeCommands(commands){
            Object.keys(commands).forEach(function(name) {
                removeCommand(commands[name]);
            });
        }
        
        function removeCommand(command, context){
            var name = (typeof command === 'string' ? command : command.name);

            if (plugin.commandManager[name])
                plugin.commandManager.setProperty(name, "");

            command = commands[name];
            delete commands[name];
        
            var ckb = commandManager.commandKeyBinding;
            for (var hashId in ckb) {
                for (var key in ckb[hashId]) {
                    var cl = ckb[hashId][key];
                    if (cl == command) {
                        delete ckb[hashId][key];
                    } else if (cl && cl.indexOf && cl.splice) {
                        var i = cl.indexOf(command);
                        if (i != -1)
                            cl.splice(i, 1);
                    }
                }
            }
        }
        
        function bindKey(key, command, asDefault) {
            if(!key)
                return;

            var ckb = commandManager.commandKeyBinding;
            key.split("|").forEach(function(keyPart) {
                var binding = commandManager.parseKeys(keyPart, command);
                var hashId  = binding.hashId;
                var hash    = (ckb[hashId] || (ckb[hashId] = {}));
                
                if (!hash[binding.key]) {
                    hash[binding.key] = command;
                } else {
                    if (!Array.isArray(hash[binding.key]))
                        hash[binding.key] = [hash[binding.key]];
                    
                    if (asDefault || command.isDefault)
                        hash[binding.key].unshift(command);
                    else
                        hash[binding.key].push(command);
                }
            }, this);
            
            plugin.commandManager
                .setProperty(command.name, key);
        }
        
        commandManager.bindKey = bindKey
        
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
        
        /**
         * Manages the commands and the key bindings for Cloud9 IDE.
         * 
         * Commands are named items that represent functionality that can be 
         * triggered by a user by pressing a combination of keys at the same
         * time. Commands can also be executed via code:
         * 
         *     // Saves the currently focussed tab (if any)
         *     commands.exec("save");
         * 
         * You can also specify arguments to commands
         * 
         *     // Runs the file /example.js with argument --test
         *     var editor = tabs.findPage("/example.js").editor;
         *     commands.exec("run", editor, ["--test"]);
         * 
         * This example shows how you can define a command. This command is
         * available when there is a current editor and it's an {@link ace.Ace Ace} 
         * editor.
         * 
         *     commands.addCommand({
         *         name        : "gotoline",
         *         group       : "ace",
         *         hint        : "Triggers the goto line dialog",
         *         bindKey     : { mac: "Command-L", win: "Ctrl-G" },
         *         isAvailable : function(editor){
         *             return editor && editor.type == "ace";
         *         },
         *         exec : function() {
         *             gotoline();
         *         }
         *     }, plugin);
         * 
         * This example is also from the gotoline plugin. In this example the
         * bind key is a commonly used key: Escape. There are many commands that
         * bind this key and the isAvailable function determines which command 
         * will be executed. The first command found for which the isAvailable
         * function returns true will be used. In this case it returns true when
         * the gotoline dialog is visible (which is only visible when it has 
         * focus).
         * 
         *     commands.addCommand({
         *         bindKey     : { mac: "ESC", win: "ESC" },
         *         isAvailable : function(editor){ return win && win.visible; },
         *         exec        : function() {
         *             hide();
         *             var tab = tabs.focussedTab;
         *             tab && tabs.focusTab(tab);
         *             
         *             if (originalLine) {
         *                 execGotoLine(originalLine, originalColumn, true);
         *                 originalPath = originalColumn = originalLine = undefined;
         *             }
         *         }
         *     }, plugin);
         * 
         * Commands are generally used by buttons and menu items to attach
         * functionality to them:
         * 
         *     menus.addItemByPath("Edit/Cut", new MenuItem({ command : "cut" }), 400, plugin);
         *     menus.addItemByPath("Edit/Copy", new MenuItem({ command : "copy" }), 500, plugin);
         *     menus.addItemByPath("Edit/Paste", new MenuItem({ command : "paste" }), 600, plugin);
         * 
         * Or to ui.button elements:
         * 
         *     var button = new ui.button({ caption: "Save", command: "save" });
         * 
         * Users are able to change the key bindings of each command in the
         * key bindings editor. They are also able to set
         * key bindings for commands that have been defined without a key
         * binding.
         * 
         * @singleton
         */
        plugin.freezePublicAPI({
            /**
             * @ignore
             */
            commandManager : (typeof apf != "undefined" 
                ? new apf.Class().$init() : 
                { setProperty : function(x,y){ this[x] = y } }),
            
            /**
             * A hash table of all the commands. The index is the name of the
             * command.
             * 
             * See {@link #addCommand} for a description of the command object.
             * 
             * @property {Object[]} commands
             * @readonly
             */
            get commands(){ return commands; },
            
            /**
             * The operating system that is being run.
             * @property {String} platform  Possible values are "mac", "win".
             * @readonly
             */
            get platform(){ return platform; },
            
            /**
             * By default the key bindings for the platform that the user is
             * currently running are choosen. Using this function the chosen
             * platform can be changed.
             * @param {String} platform  The platform to change the key binding 
             *   set to. Possible values are "auto", "mac" or "win".
             */
            changePlatform : changePlatform,
            
            /**
             * Retrieves a string that specifies the current hotkey for a 
             * command. The (modifier) keys are space or dash (-) separated.
             * Special named keys are: 
             * 
             * * Ctrl
             * * Command
             * * Alt
             * * Option
             * * Shift
             * * Meta
             * * Tab
             * * Esc
             * * Enter
             * * F1-F12
             * * Up
             * * Down
             * * Left
             * * Right
             * * PgUp
             * * PgDown
             * * Home
             * * End
             * 
             * @param {String} name  the name of the command.
             * @return {String}
             */
            getHotkey : getHotkey,
            
            /**
             * Executes the action tied to a command. This method will call
             * the `isAvailable` method for a command and will not execute if 
             * the command is not available. If there are multiple commands
             * with the same name, the command for which the `isAvailable`
             * method returns true first will be executed.
             * @param {String} command  the name of the command to execute
             * @param {Editor} editor   the editor that is the context for the
             *   command.
             * @param {Array}  args     a list of arguments to pass to the
             *   command.
             * @return {Boolean} Specifies whether the command was executed 
             *   succesfully.
             */
            exec : exec,
            
            /**
             * Adds a command to the list of available commands.
             * 
             * @param {Object}   command                The command definition 
             *   to add.
             * @param {String}   command.name           The name of this command
             * @param {Object}   [command.bindKey]      Object containing an entry 
             *   for each platform. The (modifier) keys are space or dash (-) 
             *   separated. Special named keys are: 
             * 
             * Ctrl, Command, Alt, Option, Shift, Meta, Tab, Esc, Enter, F1-F12, 
             * Up, Down, Left, Right, PgUp, PgDown, Home, End
             * 
             * Example:
             * 
             *     bindKey : { mac: "Command-Option-Z", win: "Ctrl-Alt-Z" }
             * 
             * @param {String}   [command.bindKey.win]  The bind key for windows 
             *   and unix.
             * @param {String}   [command.bindKey.mac]  The bind key for mac. 
             * @param {String}   [command.hint]         A description of this 
             *   command. This is displayed in the key bindings editor.
             * @param {String}   [command.group]        The group to which this 
             *   command belongs. This is used by the key bindings editor to 
             *   group the commands.This function should return true when the 
             *   command is available and otherwise return false. Make sure that 
             *   you implement this to be as exact as possible.
             * @param {Function} [command.isAvailable]  This function should 
             *   return true when the command is available and otherwise return 
             *   false. Make sure that you implement this to be as exact as 
             *   possible.
             * @param {Function} command.exec           This function is called 
             *   when the command is triggered for execution.
             * @param {Plugin}   plugin   The plugin responsible for adding the 
             *   command.
             * @return {Object}                         The  command definition
             */
            addCommand : addCommand,
            
            /**
             * Adds multiple commands to the list of available commands.
             * @param {Object[]} list    The list of commands to add. 
             *   See {@link #addCommand} for a description of the object 
             *   definition.
             * @param {Plugin}   plugin  The plugin responsible for adding the 
             *   commands.
             */
            addCommands : addCommands,
            
            /**
             * Remove multiple commands from the list of available commans.
             * @param {String[]} list    The list of names of commands to remove. 
             */
            removeCommands : removeCommands,
            
            /**
             * Remove a command from the list of available commands
             * @param {String} name  the name of the command to remove.
             */
            removeCommand : removeCommand,
            
            /**
             * Set a new bind key for a command
             * @param {String} key      the description of the keys to press. 
             *   See {@link #getHotkey} for the way to construct this string.
             * @param {String} command  The command object as described by
             *   {@link #addCommand}
             */
            bindKey : bindKey
        });
        
        register(null, {
            commands: plugin
        });
    }
});