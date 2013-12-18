define(function(require, exports, module) {
    main.consumes = [
        "PreferencePanel", "commands", "settings", "ui", "util", "Form"
    ];
    main.provides = ["preferences.keybindings"];
    return main;

    function main(options, imports, register) {
        var PreferencePanel = imports.PreferencePanel;
        var commands        = imports.commands;
        var settings        = imports.settings;
        var ui              = imports.ui;
        var util            = imports.util;
        
        /***** Initialization *****/
        
        var plugin = new PreferencePanel("Ajax.org", main.consumes, {
            caption : "Key Bindings",
            form    : true,
            index   : 200
        });
        // var emit   = plugin.getEmitter();
        
        var model = new ui.model();
        var dgCommands, changed;
        
        var loaded = false;
        function load() {
            if (loaded) return false;
            loaded = true;
            
            settings.on("user/keybindings", function(){
                var platform = settings.get("user/keybindings/@platform");
                if (platform == "auto")
                    platform = apf.isMac ? "mac" : "win";
                    
                if (commands.platform != platform)
                    commands.changePlatform(platform);
            });
            
            settings.on("read", updateCommandsFromSettings);
            settings.on("write", function(){
                if (changed && model.data) {
                    var nodes = model.queryNodes("//command");
                    var cmd, node, data  = [];
                    for (var i = 0, l = nodes.length; i < l; i++) {
                        node = getObject(nodes[i]);
                        cmd  = commands.commands[node.name]
                        if (node.disabled
                          || cmd.originalBindKey && (node.mac || null) 
                            != (cmd.originalBindKey.mac || null)
                          || cmd.originalBindKey && (node.win || null) 
                            != (cmd.originalBindKey.win || null))
                            data.push(node);
                    }
    
                    settings.setJson("user/keybindings", data);
                }
                
                changed = false;
            });
            
            var timer;
            model.on("update", function(){
                clearTimeout(timer);
                timer = setTimeout(function(){
                    changed = true;
                    settings.save();
                }, 1000);
            });
            
            commands.on("update", function(){
                changed = true;
                reloadModel();
                updateCommandsFromSettings();
            });
            
            reloadModel();
        }
        
        var drawn;
        function draw(e){
            if (drawn) return;
            drawn = true;
            
            plugin.form.add([
                {
                   type     : "dropdown",
                   title    : "Keybindings Set",
                   path     : "user/keybindings/@preset",
                   items    : [
                       {caption: "Default", value: "default"},
                       {caption: "Custom", value: "custom"}
                   ],
                   position : 100
                },
                {
                   type     : "dropdown",
                   title    : "Operating System",
                   path     : "user/keybindings/@platform",
                   items    : [
                       {caption: "Auto", value: "auto"},
                       {caption: "Apple OSX", value: "mac"},
                       {caption: "Windows / Linux", value: "win"},
                   ],
                   position : 110
                },
                {
                    type     : "custom",
                    title    : "Keybindings Editor",
                    position : 120,
                    node     : new ui.hsplitbox({
                        height     : 200,
                        padding    : 5,
                        anchors    : "80 0 0 0",
                        edge       : "10 10 10 10",
                        childNodes : [
                            new ui.list({
                                "id"      : "lstCmdGroups",
                                "width"   : 110,
                                "model"   : model,
                                "each"    : "[group]",
                                "caption" : "[@name]",
                                "skin"    : "lineselect"
                            }),
                            dgCommands = new ui.datagrid({
                                "id"      : "dgCommands",
                                "model"   : "{lstCmdGroups.selected}",
                                "class"   : "noscrollbar",
                                "each"    : "[command]",
                                childNodes : [
                                    new ui.BindingColumnRule({
                                        caption : "Active",
                                        width   : "5%",
                                        match   : "[@enabled]",
                                        value   : "{apf.isTrue([@enabled]) ? 'Yes' : 'No'}",
                                        editor  : "checkbox",
                                        skin    : "checkbox_black"
                                    }),
                                    new ui.BindingColumnRule({
                                        caption : "Name",
                                        width   : "20%",
                                        value   : "[@name]"
                                    }),
                                    new ui.BindingColumnRule({
                                        caption : "Mac OSX",
                                        css     : "colsel",
                                        width   : "15%",
                                        match   : "[@keys-mac]",
                                        value   : "{apf.hotkeys.toMacNotation([@keys-mac])}",
                                        editor  : "textbox"
                                    }),
                                    new ui.BindingColumnRule({
                                        caption : "Windows / Linux",
                                        width   : "15%",
                                        value   : "[@keys-win]",
                                        editor  : "textbox"
                                    }),
                                    new ui.BindingColumnRule({
                                        caption : "Description",
                                        width   : "45%",
                                        value   : "[@info]"
                                    }),
                                    new apf.actions()
                                ]
                            })
                        ]
                    })
                }
            ], commands);
        
            dgCommands.on("afterchange", function(e){
                var cmd, node = e.xmlNode;
                var name = node.getAttribute("name");
                for (var i = 0; i < commands.length; i++) {
                    if (commands[i].name == name) {
                        cmd = commands[i]
                        break;
                    }
                }
                if (cmd) {
                    cmd.bindKey["mac"] = node.getAttribute("keys-mac") || null;
                    cmd.bindKey["win"] = node.getAttribute("keys-win") || null;
                    cmd.disabled = ui.isFalse(node.getAttribute("enabled"));
                    // @todo updateCommand
                }
            });
            
            dgCommands.on("editor.create", function(e){
                var tb = e.editor;
                
                var keys = require("ace/lib/keys");
                
                tb.onkeypress= function(e){
                    apf.stopEvent(e);
                }
                tb.onkeydown = function(e){
                    apf.stopEvent(e);
                    
                    var key = [];
                    
                    if (e.ctrlKey)  key.push("Ctrl");
                    if (e.metaKey)  key.push(apf.isMac ? "Command" : "Meta");
                    if (e.altKey)   key.push(apf.isMac ? "Option" : "Alt");
                    if (e.shiftKey) key.push("Shift");
                    
                    // do not allow binding to enter and escape without modifiers
                    if (!key.length) {
                        if (e.keyCode == 27)
                            return;
                        if (e.keyCode == 13) {
                            var node   = dgCommands.selected;
                            var name   = node.getAttribute("name");
                            var newKey = node.getAttribute("keys-mac");
                            
                            // Make sure key is not already used
                            // @todo
                            
                            // Add key
                            commands.bindKey(newKey, commands.commands[name]);
                            
                            return;
                        }
                    }
                    
                    if (keys[e.keyCode]) {
                        if (!keys.MODIFIER_KEYS[e.keyCode])
                           key.push(keys[e.keyCode].toUpperCase());
                    } 
                    else if (e.htmlEvent.keyIdentifier.substr(0, 2) == "U+") {
                        key.push(String.fromCharCode(
                            parseInt(e.htmlEvent.keyIdentifier.substr(2), 16)
                        ));
                    }
                    
                    tb.change(key.join("-"));
                    
                    return false;
                }
            });
        }
        
        /***** Methods *****/
        
        function updateCommandsFromSettings(){
            var cmds = settings.getJson("user/keybindings");
            if (cmds) {
                cmds.forEach(function(cmd){
                    var fc = commands.commands[cmd.name];
                    if (fc) {
                        var b = fc.bindKey;
                        b.mac = cmd.mac;
                        b.win = cmd.win;
                    }
                });
            }
        }
        
        function getObject(node){
            return {
                name     : node.getAttribute("name"),
                disabled : ui.isFalse(node.getAttribute("enabled")),
                mac      : node.getAttribute("keys-mac"),
                win      : node.getAttribute("keys-win")
            }
        }
        
        function reloadModel(){
            model.clear();
            model.load("<commands />");
            
            Object.keys(commands.commands).forEach(function(name){
                var item        = commands.commands[name];
                var groupName   = item.group || "General";
                var group       = model.queryNode("group[@name=" + 
                    util.escapeXpathString(groupName) + "]");
                    
                if (!group) {
                    group = model.appendXml("<group name='" 
                        + apf.escapeXML(groupName) + "' />")
                }
                group.appendChild(apf.n("<command />")
                    .attr("name", item.name)
                    .attr("enabled", "true")
                    .attr("info", item.hint || "")
                    .attr("keys-mac", item.bindKey && item.bindKey["mac"] || "")
                    .attr("keys-win", item.bindKey && item.bindKey["win"] || "")
                    .node()
                )
            });
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function() {
            load();
        });
        plugin.on("draw", function(e) {
            draw(e);
        });
        plugin.on("enable", function() {
            
        });
        plugin.on("disable", function() {
            
        });
        plugin.on("unload", function() {
            loaded = false;
            drawn  = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * 
         **/
        plugin.freezePublicAPI({
            
        });
        
        register(null, { 
            "preferences.keybindings" : plugin 
        });
    }
});