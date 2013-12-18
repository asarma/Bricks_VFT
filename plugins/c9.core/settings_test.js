/*global describe:false, it:false */

"use client";

require(["lib/architect/architect", "lib/chai/chai"], function (architect, chai) {
    var expect = chai.expect;
    
    var defSettings = "<settings><foo bar=\"foo\"><bar foo=\"bar\">test</bar></foo></settings>";
    
    expect.setupArchitectTest([
        {
            packagePath: "plugins/c9.core/c9",
            
            workspaceId: "user/javruben/dev",
            env: "test",
        },
        "plugins/c9.vfs.client/vfs_client",
        "plugins/c9.vfs.client/endpoint",
        "plugins/c9.ide.auth/auth",
        "plugins/c9.core/ext",
        "plugins/c9.core/http",
        "plugins/c9.ide.ui/lib_apf",
        {
            packagePath : "plugins/c9.core/settings",
            settings : defSettings
        },
        "plugins/c9.ide.ui/ui",
        // Mock plugins
        {
            consumes : [],
            provides : ["fs", "auth.bootstrap", "proc"],
            setup    : expect.html.mocked
        },
        {
            consumes : ["settings"],
            provides : [],
            setup    : main
        }
    ], architect);
    
    function main(options, imports, register) {
        var settings = imports.settings;
        
        describe('settings', function() {
            it('should expose the settings in it\'s model', function(done) {
                expect(settings.model.getXml().xml).to.equal(defSettings);
                done();
            });
            it('should expose the tree via the get method', function(done) {
                expect(settings.get('foo/@bar')).to.equal("foo");
                expect(settings.get('foo/bar')).to.equal("test");
                done();
            });
            it('should allow altering the tree via the set method', function(done) {
                var v = Math.random().toString();
                settings.set('foo/@bar', v)
                expect(settings.get('foo/@bar')).to.equal(v);
                
                v = Math.random().toString();
                settings.set('foo/bar', v)
                expect(settings.get('foo/bar')).to.equal(v);
                
                done();
            });
            it('should allow new settings to be read from xml', function(done) {
                settings.on("read", function c1(){
                    if (expect(settings.get("foo/@bar")).to.equal("foo")) {
                        done();
                        settings.off("read", c1);
                    }
                });
                settings.read(defSettings);
            });
            it('should allow type conversion for JSON and Booleans', function(done) {
                settings.set('foo/@bar', "true")
                expect(settings.getBool('foo/@bar')).to.equal(true);
                
                settings.setJson('foo/bar', {test:1})
                expect(settings.getJson('foo/bar')).property("test").to.equal(1);
                
                done();
            });
            it('should set default values only when they are not set already', function(done) {
                settings.setDefaults('foo', [
                    ["bar", "10"],
                    ["test", "15"]
                ]);
                expect(settings.exist('foo')).to.equal(true);
                expect(settings.get('foo/@bar')).to.not.equal("10");
                expect(settings.get('foo/@test')).to.equal("15");
                
                done();
            });
            it('should set default values the node doesn\'t exist yet', function(done) {
                settings.setDefaults('new', [
                    ["bar", "10"],
                    ["test", "15"]
                ]);
                expect(settings.exist('new')).to.equal(true);
                expect(settings.get('new/@bar')).to.equal("10");
                expect(settings.get('new/@test')).to.equal("15");
                
                done();
            });
        });
        
        onload && onload();
    }
});