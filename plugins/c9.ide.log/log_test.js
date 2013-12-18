/*global describe, it, before, test, afterEach */ 

"use client";

require(["lib/architect/architect", "lib/chai/chai", "events"], function (architect, chai, events) {
    var expect = chai.expect;
    var EventEmitter = events.EventEmitter;
    
    expect.setupArchitectTest([
        {
            packagePath : "plugins/c9.core/c9",
            startdate   : new Date(),
            debug       : true,
            hosted      : true,
            local       : false,
            davPrefix   : "/"
        },
        
        "plugins/c9.core/ext",
        "plugins/c9.core/http",
        "plugins/c9.core/util",
        "plugins/c9.ide.ui/lib_apf",
        "plugins/c9.ide.ui/ui",
        "plugins/c9.core/settings",
        {
            packagePath  : "plugins/c9.ide.log/log",
            metricHost   : "0.0.0.0"
        },
        "plugins/c9.vfs.client/vfs_client",
        "plugins/c9.vfs.client/endpoint",
        "plugins/c9.ide.auth/auth",
        "plugins/c9.fs/fs",
        "plugins/c9.fs/proc",
        
        // Mock plugins
        {
            consumes : ["log", "proc"],
            provides : [],
            setup    : main
        },
        {
            consumes : [],
            provides : ["auth.bootstrap"],
            setup    : expect.html.mocked
        },
        {
            consumes : ["proc", "log"],
            provides : [],
            setup    : main
        }
    ], architect);
    
    function main(options, imports, register) {
        var log   = imports.log;
        var proc  = imports.proc;
        
        function Server(callback){
            var _self = this;
            var port, process, buffer = "", timer;
            
            console.log("Starting UDP server...");
            
            // Connect
            proc.spawn("node", {
                args: ["plugins/c9.ide.log/metric_test_udpserver.js"]
            }, function(err, p) {
                if (err)
                    throw err;
                    
                process = p;

                process.stdout.on("error", function(data) {
                    throw data;
                });

                process.stdout.on("data", function(data) {
                    // Get Port
                    if (!port) {
                        var m = data.match(/^port:(\d+)/);
                        if (m) {
                            port = m[1];
                            data = data.split(port)[1];
                            
                            console.log("UDP server started on port " + port);
                            log.setMetricsPort(port, function(err, metricsPort) {
                                if (err)
                                    return console.error(err);
                                
                                callback(_self, port);
                            });
                        } else {
                            process.kill();
                            throw new Error("Expected Port as First "
                                    + "Message. Instead got: " + data);
                        }
                    }
                    
                    if (data) {
                        buffer += data;
                    
                        clearTimeout(timer);
                        timer = setTimeout(function(){
                            _self.emit("data", buffer);
                        }, 500);
                    }
                });
            });
            
            this.kill = function(){
                process.kill();
            };
        }
        Server.prototype = new EventEmitter();
        
        describe('log', function() {
            this.timeout(10000);
            
            before(function(done) {
                localStorage.clear();
                done();
            });
            
            afterEach(function(done) {
                localStorage.clear();
                done();
            });
            
            it('should set the origin used in logging metrics', function(done) {
                // Start UDP Server to listen for metrics being sent
                new Server(function(server, port){
                    server.on("data", function(data){
                        expect(data).to.contain('"origin":"unittest"');
                        done();
                        server.kill();
                    });
                    
                    log.setOrigin("unittest", function(err, results) {
                        expect(err).to.not.ok;
                        expect(results).to.equal("unittest");
                        
                        log.logMetric('test', 'unittest', 1, [], function(err, results) {
                            expect(err).to.not.ok;
                        });
                    });
                });
            });
        
            it('should produce errors about missing/wrong parameters', function(done) {
                log.logMetric('test', 'unittest', 'UIDNaN', [], function(err, results) {
                    expect(err).to.be.a('string');
                    log.logMetric('test', 'unittest', 1, "not_an_array", function(err, results) {
                        expect(err).to.be.a('string');
                        done();
                    });
                });
            });
        
            it('should send a random log message to the Metric server', function(done) {
                // Start UDP Server to listen for metrics being sent
                new Server(function(server, port){
                    server.on("data", function(data){
                        expect(data).to.contain('"type":"test","name":"unittest"');
                        done();
                        server.kill();
                    });

                    log.logMetric('test', 'unittest', 1, [], function(err, results) {
                        expect(err).to.not.ok;
                    });

                });
            });
        
            it('should produce errors about missing/wrong parameters', function(done) {
                log.logEvent('unittest', 'UIDNaN', {}, function(err, results) {
                    expect(err).to.be.a('string');
                });
                done();
            });
        
            it('should send an event to the Metric server', function(done) {
                // Start UDP Server to listen for metrics being sent
                new Server(function(server, port){
                    server.on("data", function(data){
                        expect(data).to.contain('"type":"event","name":"unittest"');
                        done();
                        server.kill();
                    });

                    log.logEvent('unittest', 1, {}, function(err, results) {
                        expect(err).to.be.null;
                    });
                });
            });

            it('should merge consecutive duration timeslots to one event', function(done) {
                // Start UDP Server to listen for metrics being sent
                new Server(function(server, port){
                    var now = Date.now();
                    
                    server.on("data", function(data){
                        expect(data).to.contain('{"origin":"unittest","type":"duration","name":"loggedIn","duration":10000,"uid":1,"params":[],"startTime":' + now);
                        done();
                        server.kill();
                    });

                    var durationSlots = [1200, 1800, 7000];
                    log.logDuration('loggedIn-js', now, 10000, durationSlots, 1, [], function(err, result) {
                        expect(err).to.be.null;
                    });
                });
            });

            it('should ignore negative timeslots at the beginning for total duration', function(done) {
                // Start UDP Server to listen for metrics being sent
                new Server(function(server, port){
                    var now = Date.now();
                    
                    server.on("data", function(data){
                        expect(data).to.contain('{"origin":"unittest","type":"duration","name":"loggedIn","duration":7000,"uid":1,"params":[],"startTime":' + (now + 1500));
                        done();
                        server.kill();
                    });

                    var durationSlots = [-500, -1000, 7000];
                    log.logDuration('loggedIn', now, 7000, durationSlots, 1, [], function(err, result) {
                        expect(err).to.be.null;
                    });
                });
            });

            it('should ignore negative timeslots at the end for total duration', function(done) {
                // Start UDP Server to listen for metrics being sent
                new Server(function(server, port){
                    var now = Date.now();
                    
                    server.on("data", function(data){
                        expect(data).to.contain('{"origin":"unittest","type":"duration","name":"loggedIn","duration":7000,"uid":1,"params":[],"startTime":' + (now));
                        done();
                        server.kill();
                    });

                    var durationSlots = [7000, -500 , -1000];
                    log.logDuration('loggedIn', now, 7000, durationSlots, 1, [], function(err, result) {
                        expect(err).to.be.null;
                    });
                });
            });

            it('should ignore negative timeslots in between for total duration', function(done) {
                // Start UDP Server to listen for metrics being sent
                new Server(function(server, port){
                    var now = Date.now();
                    
                    server.on("data", function(data){
                        expect(data).to.contain('{"origin":"unittest","type":"duration","name":"loggedIn","duration":3000,"uid":1,"params":[],"startTime":' + (now + 7500));
                        expect(data).to.contain('{"origin":"unittest","type":"duration","name":"loggedIn","duration":7000,"uid":1,"params":[],"startTime":' + (now));
                        done();
                        server.kill();
                    });

                    var durationSlots = [7000, -500, 3000];
                    log.logDuration('loggedIn', now, 10000, durationSlots, 1, [], function(err, result) {
                        expect(err).to.be.null;
                    });
                });
            });

        });
        
        onload && onload();
    }

});