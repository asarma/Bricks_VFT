/*global describe, it, after */

"use client";

require(["lib/architect/architect", "lib/chai/chai"], function (architect, chai) {
    var expect = chai.expect;
    
    expect.setupArchitectTest([
        "plugins/c9.ide.ui/lib_apf",
        {
            packagePath  : "plugins/c9.ide.ui/ui",
            staticPrefix : "plugins/c9.ide.ui"
        },
        
        "plugins/c9.core/ext",
        {
            packagePath: "plugins/c9.ide.layout.classic/layout",
            staticPrefix: "plugins/c9.ide.layout.classic"
        },
        
        // Mock plugins
        {
            consumes : [],
            provides : [
                "util", "settings", "c9", "dialog.alert"
            ],
            setup    : expect.html.mocked
        },
        {
            consumes : ["layout"],
            provides : [],
            setup    : main
        }
    ], architect);
    
    function main(options, imports, register) {
        var layout = imports.layout;
        
        describe('layout', function() {
            it('should show an error notification', function() {
                layout.showError("Test");
                expect.html(document.querySelector(".errorlabel")).visible;
                expect.html(document.querySelector(".errorlabel")).text(/Test/);
            });
            it('should hide the error notification', function(done) {
                layout.hideError("Test");
                setTimeout(function(){
                    expect.html(document.querySelector(".errorlabel")).not.visible;
                    done();
                }, 1000);
            });
        });
        
        if (!onload.remain){
            describe("unload()", function(){
                it('should destroy all ui elements when it is unloaded', function() {
                    layout.unload();
                });
            });
            
            //@todo Idea: show in the tabs whether the editor is running atm
            // @todo test fs integration
            
            after(function(done){
                document.body.style.marginBottom = "";
                done();
            });
        }
        
        onload && onload();
    }
});