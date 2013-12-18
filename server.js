#!/usr/bin/env node
"use strict";

require("amd-loader");
var path      = require('path');
var architect = require("architect");
var optimist  = require("optimist");

if (process.version.match(/^v0/) && parseFloat(process.version.substr(3)) < 10) {
    console.warn("You're using Node.js version " + process.version 
        + ". Version 0.10 or higher is recommended. Some features will not work.");
}

var DEFAULT_CONFIG   = "s";
var DEFAULT_SETTINGS = "devel";

var shortcuts = {
    "dev"  : ["ide", "vfs", "api", "proxy", "redis", "legacy", "-s", "devel"],
    "beta" : ["ide", "vfs", "proxy", "-s", "beta"],
    "ci" : ["ide", "vfs", "proxy", "-s", "ci"],
    "s"    : ["standalone", "-s", "standalone"]
};

module.exports = main;

if (!module.parent)
    main(process.argv.slice(2));

function main(argv, config, callback) {
    var options = optimist(argv)
        .usage("Usage: $0 [CONFIG_NAME] [--help]")
        .alias("s", "settings")
        .default("settings", DEFAULT_SETTINGS)
        .describe("settings", "Settings file to use")
        .boolean("help")
        .describe("help", "Show command line options.");

    var configs = options.argv._;
    if (!configs.length) 
        configs = [DEFAULT_CONFIG || config];
    
    configs.forEach(function(config) {
        if (shortcuts[config]) {
            return main(shortcuts[config].concat(argv.filter(function(arg) {
                return arg != config;
            })), null, callback);
        }
        else {
            start(config, options, callback);
        }
    });    
}

function start(configName, options, callback) {
    var argv = options.argv;
    var settingsName = argv.settings;
    
    if (typeof settingsName != "string")
        settingsName = settingsName.pop();
    
    var configPath = configName;
    if (configPath[0] !== "/")
        configPath = path.join(__dirname, "/configs/", configName);
   
    var settings = require(path.join(__dirname, "./settings", settingsName));
    
    var plugins = require(configPath)(settings(), options);
    
    if (argv.help) {
        options.usage("Usage: $0 " + configName);
        options.showHelp();
    }
    
    if (!plugins)
        return;
    
    architect.resolveConfig(plugins, __dirname + "/plugins", function(err, config) {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        
        var app = architect.createApp(config, function (err, app) {
            if (err) {
                console.error("Error while starting the '%s':", configPath);
                console.log(err, err.stack);
                process.exit(1);
            }
            console.log("Started '%s' with config '%s'!", configPath, settingsName);
            
            callback && callback();
        });
        
        app.on("service", function(name, plugin) {
            if (typeof plugin !== "function")
                plugin.name = name; 
        });
    });
}