/*global describe:false, it:false */

"use client";

require(["lib/architect/architect", "lib/chai/chai"], function (architect, chai) {
    var expect = chai.expect;
    
    expect.setupArchitectTest([
        "plugins/c9.core/ext",
        {
            consumes : ["ext", "Plugin"],
            provides : [],
            setup    : main
        }
    ], architect);
    
    function main(options, imports, register) {
        var ext    = imports.ext;
        var Plugin = imports.Plugin;
        
        describe('plugin', function() {
            it('should expose the constructor arguments', function(done) {
                var deps = [1,2];
                var plugin = new Plugin("Ajax.org", deps);
                
                expect(plugin.developer).to.equal("Ajax.org");
                expect(plugin.deps).to.equal(deps);
                
                done();
            });
            it('should only allow setting the api once', function(done) {
                var plugin = new Plugin("Ajax.org", []);
                
                var func = function(a){};
                plugin.freezePublicAPI({
                    test: func
                });
                
                plugin.test = "nothing";
                expect(plugin.test).to.equal(func);
                
                done();
            });
            it('should give access to the event emitter before freezing the api', function(done) {
                var plugin = new Plugin("Ajax.org", []);
                var emit   = plugin.getEmitter();
                plugin.freezePublicAPI({});
                plugin.on("test", function(){ done(); })
                emit("test");
            });
            it('should not give access to the event emitter after freezing the api', function(done) {
                var plugin = new Plugin("Ajax.org", []);
                plugin.freezePublicAPI({});
                expect(plugin.getEmitter).to.not.ok
                done();
            });
            it('should call load event when name is set', function(done) {
                var plugin = new Plugin("Ajax.org", []);
                plugin.on("load", function(){ done() });
                plugin.name = "test";
            });
            it('should only allow the name to be set once', function(done) {
                var plugin = new Plugin("Ajax.org", []);
                plugin.name = "test";
                expect(function(){ plugin.name = "test2";}).to.throw("Plugin Name Exception");
                done();
            });
            it('should call unload event when unload() is called', function(done) {
                var plugin = new Plugin("Ajax.org", []);
                var loaded = false;
                plugin.on("unload", function error(){ 
                    if (!loaded)
                        throw new Error("shouldn't call unload");
                    done();
                });
                plugin.unload();
                loaded = true;
                plugin.load();
                plugin.unload();
            });
            it('should call disable event when disable() is called', function(done) {
                var plugin = new Plugin("Ajax.org", []);
                plugin.on("disable", function(){ done() });
                plugin.enable();
                plugin.disable();
            });
            it('should call enable event when enable() is called', function(done) {
                var plugin = new Plugin("Ajax.org", []);
                plugin.on("enable", function(){ done() });
                plugin.enable();
            });
            it('should destroy all assets when it\'s unloaded', function(done) {
                var plugin = new Plugin("Ajax.org", []);
                
                var count = 0;
                function check(){
                    if (++count == 4)
                        done();
                }
                
                var el1 = {destroy: check, selectNodes: function(){return []}};
                var el2 = {destroy: check, selectNodes: function(){return []}};
                
                plugin.load();
                
                plugin.on("load", check);
                expect(plugin.listeners("load").length).to.equal(1);
                
                plugin.addElement(el1, el2);
                plugin.addEvent([plugin, "load", check]);
                plugin.addOther(check);
                
                plugin.unload();
                
                if (!plugin.listeners("load").length)
                    check();
            });
            
            //@todo haven't tested getElement
        });
        
        describe('ext', function() {
            it('should register a plugin when the plugin\'s name is set', function(done) {
                var plugin = new Plugin("Ajax.org", []);
                expect(plugin.registered).to.equal(false);
                
                ext.on("register", function reg(){
                    expect(plugin.registered).to.equal(true);
                    done();
                    ext.off("register", reg);
                })
                
                plugin.name = "test";
            });
            it('should call the unregister event when the plugin is unloaded', function(done) {
                var plugin = new Plugin("Ajax.org", []);
                plugin.name = "test";
                
                ext.on("unregister", function unreg(){
                    expect(plugin.registered).to.equal(false);
                    done();
                    ext.off("register", unreg);
                })
                
                plugin.unload();
            });
            it('should return false on unload() when the dependency tree is not in check', function(done) {
                var plugin = new Plugin("Ajax.org", []);
                plugin.name = "test";
                var plugin2 = new Plugin("Ajax.org", ["test"]);
                plugin2.name = "test2";
                
                expect(plugin.unload()).to.equal(false);
                
                done();
            });
        });
        
        onload && onload();
    }
});