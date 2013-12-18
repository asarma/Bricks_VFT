/*global describe it before after bar*/

"use client";

require(["lib/architect/architect", "lib/chai/chai", "/vfs-root"], 
  function (architect, chai, baseProc) {
    var expect = chai.expect;
    
    expect.setupArchitectTest([
        {
            packagePath : "plugins/c9.core/c9",
            startdate   : new Date(),
            debug       : true,
            hosted      : true,
            local       : false,
            workspaceId : "javruben/dev",
            davPrefix   : "/"
        },
        
        "plugins/c9.core/ext",
        "plugins/c9.core/http",
        "plugins/c9.core/util",
        "plugins/c9.ide.ui/lib_apf",
        "plugins/c9.ide.ui/menus",
        {
            packagePath: "plugins/c9.core/settings",
            testing: true
        },
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
        "plugins/c9.ide.editors/metadata",
        "plugins/c9.ide.editors/pane",
        "plugins/c9.ide.editors/tab",
        "plugins/c9.ide.ace/ace",
        {
            packagePath: "plugins/c9.ide.terminal/terminal",
            testing: true
        },
        {
            packagePath: "plugins/c9.vfs.client/vfs_client"
        },
        "plugins/c9.vfs.client/endpoint",
        "plugins/c9.ide.auth/auth",
        "plugins/c9.fs/proc",
        {
            packagePath: "plugins/c9.fs/fs",
            baseProc: baseProc
        },
        "plugins/c9.fs/fs.cache.xml",
        
        "plugins/c9.ide.dialog/dialog",
        "plugins/c9.ide.dialog.common/alert",
        "plugins/c9.ide.dialog.common/confirm",
        "plugins/c9.ide.dialog.common/filechange",
        "plugins/c9.ide.dialog.common/fileoverwrite",
        "plugins/c9.ide.dialog.common/fileremove",
        "plugins/c9.ide.dialog.common/question",
        "plugins/c9.ide.dialog.file/filesave",
        
        // Mock plugins
        {
            consumes : ["apf", "ui", "Plugin"],
            provides : [
                "commands", "menus", "commands", "layout", "watcher", "save", 
                "preferences", "anims", "clipboard", "auth.bootstrap"
            ],
            setup    : expect.html.mocked
        },
        {
            consumes : ["tabManager", "fs", "settings", "metadata", "dialog.filechange"],
            provides : [],
            setup    : main
        }
    ], architect);
    
    function main(options, imports, register) {
        var tabs       = imports.tabManager;
        var fs         = imports.fs;
        var settings   = imports.settings;
        var metadata   = imports.metadata;
        var filechange = imports["dialog.filechange"];
        
        function countEvents(count, expected, done){
            if (count == expected) 
                done();
            else
                throw new Error("Wrong Event Count: "
                    + count + " of " + expected);
        }
        
        expect.html.setConstructor(function(tab){
            if (typeof tab == "object")
                return tab.pane.aml.getPage("editor::" + tab.editorType).$ext;
        });
        
        describe('metadata', function() {
            before(function(done){
                apf.config.setProperty("allow-select", false);
                apf.config.setProperty("allow-blur", false);
                tabs.getPanes()[0].focus();
                
                bar.$ext.style.background = "rgba(220, 220, 220, 0.93)";
                bar.$ext.style.position = "fixed";
                bar.$ext.style.left = "20px";
                bar.$ext.style.right = "20px";
                bar.$ext.style.bottom = "20px";
                bar.$ext.style.height = "33%";
      
                // document.body.style.marginBottom = "33%";
                
                fs.rmdir("/.c9/metadata", { recursive: true }, function(err){
                    if (err) throw err;
                    
                    tabs.openFile("/file.js", true, function(){
                        tabs.openFile("/file.txt", false, function(){
                            tabs.openFile("/fileLink.txt", false, function(){
                                done();
                            });
                        });
                    });
                })
            });
            
            describe("Triggering save", function(){
                it('should trigger save when a tab is active and changed', function(done) {
                    var editor = tabs.focussedTab.editor;
                    fs.once("afterMetadata", function(){
                        fs.exists("/.c9/metadata/workspace/file.js", function(exists){
                            done();
                        });
                    });
                    
                    editor.scrollTo(100, 5);
                    setTimeout(function(){
                        settings.save(true);
                    }, 100);
                });
                it('should trigger save when a tab is changed and closed', function(done) {
                    this.timeout(1000);
                    
                    var tab = tabs.findTab("/file.txt");
                    tabs.focusTab(tab);
                    var editor = tabs.focussedTab.editor;
                    editor.scrollTo(0, 10);
                    
                    fs.once("afterMetadata", function(){
                        fs.exists("/.c9/metadata/workspace/file.txt", function(exists){
                            expect(exists).to.ok;
                            done();
                        });
                    });
                    
                    tab.close();
                });
            });
            describe("Loading metadata", function(){
                it('should load metadata properly when a file has metadata', function(done) {
                    fs.exists("/.c9/metadata/workspace/file.txt", function(exists){
                        expect(exists).to.ok;
                        
                        tabs.openFile("/file.txt", true, function(err, tab){
                            if (err) throw err;
                            
                            var state = tab.document.getState();
                            if (state.ace.selection.start.column === 10
                              && state.ace.selection.start.row === 0
                              && state.ace.selection.end.column === 10
                              && state.ace.selection.end.row === 0
                              && !tab.document.changed)
                                done();
                            else
                                throw new Error("Selection is not correct: ", 
                                    state.ace.selection);
                            
                            tab.close();
                        });
                    });
                });
                it('should load metadata properly even when the file is not active when it\'s opened', function(done) {
                    tabs.openFile("/file.txt", false, function(err, tab){
                        if (err) throw err;
                        
                        tab.activate();
                        
                        var state = tab.document.getState();
                        if (state.ace.selection.start.column === 10
                          && state.ace.selection.start.row === 0
                          && state.ace.selection.end.column === 10
                          && state.ace.selection.end.row === 0
                          && !tab.document.changed)
                            done();
                        else
                            throw new Error("Selection is not correct");
                    });
                });
                it('should load metadata properly for loading an existing pane that is not a file', function(done) {
                    tabs.openEditor("terminal", true, function(err, tab){
                        if (err) throw err;
                        
                        setTimeout(function(){
                            var state    = tab.getState(true);
                            var name     = tab.name;
                            
                            tab.editor.write("ls -l\n");
                            
                            setTimeout(function(){
                                var docstate = tab.getState().document;
                                var value    = docstate.terminal.scrolltop;
                                
                                fs.once("afterUnlink", function(e) {
                                    fs.metadata("/_/_/" + name, docstate, function(err){
                                        if (err) throw err;
                                        
                                        state.name = name;
                                        state.active = true;
                                        
                                        fs.exists("/.c9/metadata/" + name, function(exists){
                                            if (!exists)
                                                throw new Error("File not found");
                                        
                                            fs.once("afterReadFile", function(e){
                                                setTimeout(function(){
                                                    var state = tab.document.getState();
                                                    expect(state.terminal.scrolltop, 
                                                        "State did not get preserved").equals(value);
                                                    done();
                                                }, 1000);
                                            });
                                            tabs.open(state, function(err, pg){
                                                if (err) throw err;
                                                tab = pg;
                                            });
                                        });
                                    });
                                });
                                
                                tab.close();
                                settings.save(true);
                            }, 1000);
                        }, 1000);
                    });
                });
                it('should work well together with state set when opening tab', function(done) {
                    var tab  = tabs.findTab("/file.js");
                    tabs.once("tabDestroy", function(){
                        setTimeout(function(){
                            fs.exists("/.c9/metadata/workspace/file.js", function(exists){
                                expect(exists, "File not found").ok;
                                    
                                tabs.open({
                                    path     : "/file.js",
                                    active   : true,
                                    document : {
                                        ace : {
                                            jump : {
                                                row    : 200,
                                                column : 10,
                                                select : {
                                                    row    : 202,
                                                    column : 20
                                                }
                                            }
                                        }
                                    }
                                }, function(err, tab){
                                    setTimeout(function(){
                                        var state = tab.document.getState();
                                        expect(state.ace.selection.start.column).equals(10);
                                        expect(state.ace.selection.start.row).equals(200);
                                        expect(state.ace.selection.end.column).equals(20);
                                        expect(state.ace.selection.end.row).equals(202);
                                        done();
                                    });
                                })
                            });
                        });
                    });
                    tab.close();
                });
            });
            describe("Content Collision", function(){
                it('should load contents stored in metadata', function(done) {
                    var path = "/collision.js";
                    fs.writeFile(path, String(Date.now()), function(err){
                        if (err) throw err;
                        
                        tabs.openFile(path, true, function(err, tab){
                            if (err) throw err;
                            
                            var state = tab.getState(true);
                            var value = String(Date.now());
                            
                            tab.document.value = value;
                            
                            // Timeout to give the change the chance to propagate
                            setTimeout(function(){
                                fs.once("afterMetadata", function(e){
                                    tabs.open(state, function(err, tab){
                                        expect(tab.document.value).equals(value);
                                        expect(tab.document.undoManager.position).equals(0);
                                        expect(tab.document.undoManager.length).equals(1);
                                        expect(tab.document.changed).equals(true);
                                        done();
                                    });
                                });
                                
                                tab.close(); // Forces saving metadata
                            });
                        });
                    });
                });
                it('should warn if file contents on disk is newer than stored in metadata', function(done) {
                    var path = "/collision.js";
                    fs.writeFile(path, Date.now() + "a", function(err){
                        if (err) throw err;
                        
                        tabs.openFile(path, true, function(err, tab){
                            if (err) throw err;
                            
                            var state = tab.getState(true);
                            var value = Date.now() + "b"
                            
                            tab.document.value = value;
                            
                            // Timeout to give the change the chance to propagate
                            setTimeout(function(){
                                fs.once("afterMetadata", function(e){
                                    setTimeout(function(){
                                        fs.writeFile(path, Date.now() + "c", function(err){
                                            if (err) throw err;
                                            
                                            tabs.open(state, function(err, tab){
                                                setTimeout(function(){
                                                    expect(filechange.getElement("window").visible).ok;
                                                    
                                                    filechange.getElement("useremote").dispatchEvent("click");
                                                    
                                                    setTimeout(function(){
                                                        expect(tab.document.value, "value").not.equals(value);
                                                        expect(tab.document.undoManager.position, "position").equals(2);
                                                        expect(tab.document.undoManager.length, "length").equals(3);
                                                        expect(tab.document.changed, "changed").equals(false);
                                                        done();
                                                    }, 10);
                                                }, 1000);
                                            });
                                        });
                                    }, 1100); // wait at least a second because Node 10 and lower has that change granularity
                                });
                                
                                tab.close(); // Forces saving metadata
                            });
                        });
                    });
                });
                it('should warn remove undo data from metadata if file on disk is different', function(done) {
                    var path = "/collision.js";
                    fs.writeFile(path, Date.now() + "a", function(err){
                        if (err) throw err;
                        
                        tabs.openFile(path, true, function(err, tab){
                            if (err) throw err;
                            
                            var state = tab.getState(true);
                            var value = Date.now() + "b"
                            
                            tab.document.value = value;
                            
                            // Timeout to give the change the chance to propagate
                            setTimeout(function(){
                                tab.document.undoManager.bookmark();
                                expect(tab.document.changed).not.ok;
                                
                                fs.once("afterMetadata", function(e){
                                    setTimeout(function(){
                                        fs.writeFile(path, Date.now() + "c", function(err){
                                            if (err) throw err;
                                            
                                            tabs.open(state, function(err, tab){
                                                setTimeout(function(){
                                                    expect(tab.document.value).not.equals(value);
                                                    expect(tab.document.undoManager.position).equals(-1);
                                                    expect(tab.document.undoManager.length).equals(0);
                                                    expect(tab.document.changed).equals(false);
                                                    
                                                    fs.unlink(path, function(){
                                                        done();
                                                    })
                                                }, 500);
                                            });
                                        });
                                    }, 1100);
                                });
                                
                                tab.close(); // Forces saving metadata
                            });
                        });
                    });
                });
            });
            if (!onload.remain){
                after(function(done){
                    // document.body.style.marginBottom = "";
                    metadata.unload();
                    tabs.unload();
                    bar.destroy(true, true);
                    done();
                });
            }
        });
        
        onload && onload();
    }
});