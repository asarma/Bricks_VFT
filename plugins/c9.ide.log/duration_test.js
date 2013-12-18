/*global describe, it, before, test */ 

"use client";

require(["lib/architect/architect", "lib/chai/chai", "/vfs-root", "events"], 
  function (architect, chai, baseProc, events) {
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
        "plugins/c9.core/settings",
        {
            packagePath  : "plugins/c9.ide.ui/ui",
            staticPrefix : "plugins/c9.ide.ui"
        },
        "plugins/c9.ide.editors/document",
        "plugins/c9.ide.editors/undomanager",
        {
            packagePath: "plugins/c9.ide.editors/editors",
            defaultEditor: "texteditor"
        },
        "plugins/c9.ide.editors/editor",
        "plugins/c9.ide.editors/tabmanager",
        "plugins/c9.ide.editors/pane",
        "plugins/c9.ide.editors/tab",
        "plugins/c9.ide.editors/texteditor",
        "plugins/c9.vfs.client/vfs_client",
        "plugins/c9.vfs.client/endpoint",
        "plugins/c9.ide.auth/auth",
        {
            packagePath: "plugins/c9.fs/fs",
            baseProc: baseProc
        },
        "plugins/c9.fs/fs.cache.xml",
        {
            packagePath  : "plugins/c9.ide.log/log",
            metricHost   : "0.0.0.0",
            testing      : true
        },
        {
            packagePath: "plugins/c9.ide.log/duration",
        },
        {
            packagePath: "plugins/c9.ide.info/info",
            user: {
                id: "example",
                name: "example",
                fullname: "example",
                email: "example",
                pubkey: "example"
            },
            project: {
                id: "example",
                name: "example",
                contents: "example",
                descr: "example"
            }
        },
        "plugins/c9.fs/proc",
        
        // Mock plugins
        {
            consumes : ["apf", "ui", "Plugin"],
            provides : [
                "commands", "menus", "commands", "layout", "watcher", 
                "save", "anims", "clipboard", "dialog.alert", "auth.bootstrap"
            ],
            setup    : expect.html.mocked
        },
        {
            consumes : ["log", "proc", "duration", "tabManager"],
            provides : [],
            setup    : main
        }
    ], architect);

    function getLocalStorageData() {
        var localStorageData = "";
        for (var i = 0; i < localStorage.length; i++ ) {
            var key = localStorage.key(i);
            var item = localStorage.getItem(key);
            if (item) 
                localStorageData += key + " = " + item + ", ";
        }
        return localStorageData;
    }

    function main(options, imports, register) {
        var duration   = imports.duration;
        var proc       = imports.proc;
        var tabs       = imports.tabManager;
        var log        = imports.log;

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
                            data = data.split(port)[1].trim();
                            
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
        
        describe('duration', function() {
            this.timeout(10000);
            
            before(function(done){
                apf.config.setProperty("allow-select", false);
                apf.config.setProperty("allow-blur", false);
                
                bar.$ext.style.background = "rgba(220, 220, 220, 0.93)";
                bar.$ext.style.position = "fixed";
                bar.$ext.style.left = "20px";
                bar.$ext.style.right = "20px";
                bar.$ext.style.bottom = "20px";
                bar.$ext.style.height = "33%";
      
                document.body.style.marginBottom = "33%";
                localStorage.clear();
                done();
            });

            afterEach(function(done) {
                localStorage.clear();
                done();
            });

            describe("logDuration()", function() {
                it('should log loggedIn duration to localStorage', function(done) {
                    // first, log some duration to the localStorage
                    duration.setLastStartTime('loggedIn');
                    duration.logDurationTime('loggedIn');
                    
                    // check the localStorage for the right duration
                    var localStorageData = getLocalStorageData();
                    expect(localStorageData).to.contain('loggedIn');
                    done();
                });                 
                
                it('should send custom (loggedIn) duration data to the Metric server', function(done) {
                    // Start UDP Server to listen for metrics being sent
                    new Server(function(server, port){
                        server.on("data", function(data){
                            expect(data).to.contain('"type":"duration","name":"loggedIn","duration"');
                            done();
                            server.kill();
                        });
                        
                        duration.setLastStartTime('loggedIn');
                        setTimeout(function() {
                            duration.logDurationTime('loggedIn');
                            log.writeLocalStatsToDWH('duration', 1, 1);
                        }, 10);
                    });                    
                });
                
                it('should log windowFocused duration to localStorage', function(done) {
                    // first, log some duration to the localStorage
                    duration.setLastStartTime('windowFocused', true);
                    setTimeout(function() {
                        duration.logDurationTime('windowFocused');
                    }, 10);
                    
                    setTimeout(function() {
                        var localStorageData = getLocalStorageData();
                        expect(localStorageData).to.contain('windowFocused');
                        done();
                    }, 10);
                });                

                it('should send custom (windowFocused) duration data to the Metric server', function(done) {
                    // Start UDP Server to listen for metrics being sent
                    new Server(function(server, port){
                        server.on("data", function(data){
                            expect(data).to.contain('"type":"duration","name":"windowFocused","duration"');
                            done();
                            server.kill();
                        });
                        
                        tabs.openFile("/file.js", function() {});
                        tabs.focusTab("/file.js");
                        duration.setLastStartTime('windowFocused');
                        setTimeout(function() {
                            duration.logDurationTime('windowFocused', 'js');
                            log.writeLocalStatsToDWH('duration', 1, 1);
                        }, 10);
                    });                    
                });
                
                it('should log active duration for two different files to localStorage', function(done) {
                    // first, log some duration to the localStorage
                    
                    // first do some activity in file 1
                    tabs.openFile("/file.js", function() {});
                    tabs.focusTab("/file.js");
                    duration.startActive = Date.now() - 10;
                    var event = new MouseEvent('click', {
                        'view': window,
                        'bubbles': true,
                        'cancelable': true
                    });
                    document.dispatchEvent(event);
                    duration.logDurationTime('active', "js");
                    
                    // wait for a second to log this activity, then do some activity in file 2
                    setTimeout(function() {
                        tabs.openFile("/file.txt", function(){});
                        tabs.findTab("/file.txt").activate();
                        tabs.focusTab("/file.txt");
                        var event = new MouseEvent('click', {
                            'view': window,
                            'bubbles': true,
                            'cancelable': true
                        });
                        document.dispatchEvent(event);
                        duration.logDurationTime('active', "txt");
                        
                        // now check if they're both in local Storage
                        setTimeout(function() {
                            var localStorageData = getLocalStorageData();
                            expect(localStorageData).to.contain('active');
                            expect(localStorageData).to.contain('js');
                            expect(localStorageData).to.contain('txt');
                            done();
                        }, 10);
                    }, 100);
                    
                }); 

                it('should log active duration for two different files to localStorage on switching tabs', function(done) {
                    // first do some activity in file 1
                    tabs.openFile("/file.js", function() {});
                    tabs.focusTab("/file.js");
                    
                    // wait for a second to log this activity, then do some activity in file 2
                    setTimeout(function() {
                        tabs.openFile("/file.txt", function(){});
                        tabs.findTab("/file.txt").activate();
                        tabs.focusTab("/file.txt");
                        
                        // now check if they're both in local Storage
                        setTimeout(function() {
                            var localStorageData = getLocalStorageData();
                            expect(localStorageData).to.contain('active');
                            expect(localStorageData).to.contain('js');
                            expect(localStorageData).to.contain('txt');
                            done();
                        }, 10);
                    }, 100);
                    
                }); 

                it('should send custom (active) duration data to the Metric server', function(done) {
                    // Start UDP Server to listen for metrics being sent
                    new Server(function(server, port){
                        server.on("data", function(data){
                            expect(data).to.contain('"type":"duration","name":"active","duration"');
                            done();
                            server.kill();
                        });
                        
                        tabs.openFile("/file.js", function() {});
                        tabs.focusTab("/file.js");
                        duration.setLastStartTime('active');
                        setTimeout(function() {
                            duration.logDurationTime('active', 'js');
                            log.writeLocalStatsToDWH('duration', 1, 1);
                        }, 10);
                    });          
                });
                
            });

        });
        
        onload && onload();
    }

});