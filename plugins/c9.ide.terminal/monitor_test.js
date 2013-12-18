/*global describe it before*/

"use server";
"use mocha";

if (typeof process !== "undefined")
    require("amd-loader");

define(function(require, exports, module) {
    var assert  = require("chai").assert;
    var Monitor = require("./monitor");
    var monitor;
    
    (global.window || (window = {})).cloud9config = {
        workspaceId: "use/mostafaeweda/demo-project"
    };
    
    function assertC9Notif() {
        assert.ok(monitor.$terminal.$data.indexOf("Cloud9") > 0);
    }
    
    describe('Terminal Monitor', function() {
        before(function(done) {
            var mockedTerminal = {
                $data: "",
                write: function (str) {
                    this.$data += str;
                },
                writeln: function (str) {
                    this.$data += str + "\r\n";
                }
            };
            
            monitor = new Monitor(mockedTerminal);
            
            done();
        });
    
        it("test no errors or warnings", function(done) {
            monitor.checkErrors("mostafaeweda@demo-project (~/app1) $ ");
            assert.equal(monitor.$terminal.$data.indexOf("Cloud9"), -1);
            done();
        });
    
        it("test sudo access erro", function (done) {
            monitor.checkErrors("bash: /usr/bin/sudo: Permission denied");
            assertC9Notif();
            var data = monitor.$terminal.$data;
            console.log(data);
            assert.ok(data.indexOf("sudo access") > 0);
            done();
        });
    
        it("test rails/sinatra address in use error", function(done) {
            monitor.checkErrors("WARN  TCPServer Error: Address already in use - bind(2)");
            assertC9Notif();
            var data = monitor.$terminal.$data;
            console.log(data);
            assert.ok(data.indexOf("For rails") > 0);
            done();
        });
    
        it("test rails/sinatra permission error", function(done) {
            monitor.checkErrors("WARN  TCPServer Error: Permission denied - bind(2)");
            assertC9Notif();
            var data = monitor.$terminal.$data;
            console.log(data);
            assert.ok(data.indexOf("For Sinatra") > 0);
            done();
        });
    
        it("test node address in use error", function(done) {
            monitor.checkErrors("events.js:48\n\
        throw arguments[1]; // Unhandled 'error' event\n\
Error: listen EADDRINUSE\n\
    at errnoException (net.js:670:11)\n\
at Array.0 (net.js:771:26)\n\
at EventEmitter._tickCallback (node.js:190:38)\n");
            assertC9Notif();
            var data = monitor.$terminal.$data;
            console.log(data);
            assert.ok(data.indexOf("Node:") > 0);
            done();
        });
    
        it("test node permission error", function(done) {
            monitor.checkErrors("events.js:48\n\
        throw arguments[1]; // Unhandled 'error' event\n\
Error: listen EACCESS\n\
    at errnoException (net.js:670:11)\n\
at Array.0 (net.js:771:26)\n\
at EventEmitter._tickCallback (node.js:190:38)\n");
            assertC9Notif();
            var data = monitor.$terminal.$data;
            console.log(data);
            assert.ok(data.indexOf("Node:") > 0);
            done();
        });
    
        it("test django erro", function (done) {
            monitor.checkErrors("Error: You don't have permission to access that port.\n");
            assertC9Notif();
            var data = monitor.$terminal.$data;
            console.log(data);
            assert.ok(data.indexOf("Django app") > 0);
            done();
        });
    
        it("test nothing running", function (next) {
            monitor.checkRunningApp("");
            var _self = this;
            setTimeout(function() {
                assert.equal(_self.monitor.$terminal.$data.indexOf("Cloud9"), -1);
                next();
            }, 10);
        });
    
        it("test express running", function (next) {
            monitor.checkRunningApp("mostafaeweda@demo-project\r\nExpress server listening on port 8080");
            var _self = this;
            setTimeout(function(){
                _self.assertC9Notif();
                var data = _self.monitor.$terminal.$data;
                console.log(data);
                assert.ok(data.indexOf("https://demo-project.mostafaeweda.c9.io") > 0);
                next();
            }, 10);
        });
    
        it("test Webrick rails/sinatra running", function (next) {
            monitor.checkRunningApp("mostafaeweda@demo-project\r\n\
                INFO  WEBrick::HTTPServer#start: pid=5462 port=8080");
            var _self = this;
            setTimeout(function(){
                _self.assertC9Notif();
                var data = _self.monitor.$terminal.$data;
                console.log(data);
                assert.ok(data.indexOf("https://demo-project.mostafaeweda.c9.io") > 0);
                next();
            }, 10);
        });
    
        it("test Django rails/sinatra running", function (next) {
            monitor.checkRunningApp("mostafaeweda@demo-project\r\n\
Django version 1.4.1, using settings 'hellowrold2.settings'\r\n\
Development server is running at http://127.11.82.129:8080/\r\n\
Quit the server with CONTROL-C.\r\n");
            var _self = this;
            setTimeout(function(){
                _self.assertC9Notif();
                var data = _self.monitor.$terminal.$data;
                console.log(data);
                assert.ok(data.indexOf("https://demo-project.mostafaeweda.c9.io") > 0);
                next();
            }, 10);
        });
    
    });

});