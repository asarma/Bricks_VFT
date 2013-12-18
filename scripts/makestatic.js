#!/usr/bin/env node
"use strict";

require("amd-loader");
var optimist = require("optimist");
var path = require("path");
var architect = require("architect");
    
var options = optimist(process.argv)
    .usage("Usage: $0 [--help]")
    .alias("s", "settings")
    .default("settings", "devel")
    .describe("settings", "Settings file to use")
    .alias("d", "dest")
    .default("dest", __dirname + "/../build/static")
    .describe("symlink", "Whether to symlink files instead of copying")
    .boolean("symlink")
    .describe("dest", "destination folder for the static files")
    .boolean("help")
    .describe("help", "Show command line options.");
    
var argv = options.argv;

if (argv.help) {
    options.showHelp();
    process.exit();
}

var config = argv._[2] || "ide";
var settings = argv.settings;

main(config, settings, function(err) {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    process.exit(0);
});

function main(config, settings, callback) {
    
    if (config[0] !== "/")
        config = path.join(__dirname, "/../configs/", config);
   
    settings = require(path.join(__dirname, "/../settings", settings));
    
    var plugins = require(config)(settings(), options)
        .map(function(plugin) {
            if (plugin.packagePath && plugin.packagePath == "connect-architect/connect") {
                plugin.packagePath = "./c9.static/connect";
            }
            else if (plugin.packagePath && plugin.packagePath == "connect-architect/connect.static") {
                plugin.packagePath ="./c9.static/connect-static";
            }
            return plugin;
        })
        .concat("./c9.static/makestatic");
    
    architect.resolveConfig(plugins, __dirname + "/../plugins", function(err, config) {
        if (err) return callback(err);
        
        var app = architect.createApp(config, function (err, app) {
            if (err) {
                return callback(err);
            }
            if (argv.symlink)
                app.services.makestatic.symlink(argv.dest, callback);
            else
                app.services.makestatic.copy(argv.dest, callback);
        });
        
        app.on("service", function(name, plugin) {
            if (typeof plugin !== "function")
                plugin.name = name; 
        });
    });
        
}

