/*
 * Browser compatibility support for the Cloud9 IDE
 *
 * @copyright 2013, Cloud9 IDE, Inc.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {
    main.consumes = ["Plugin"];
    main.provides = ["browsersupport"];
    return main;

    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var useragent = require("ace/lib/useragent");

        function getIEVersion() {
            return useragent.isIE;
        }

        var plugin = new Plugin("Ajax.org", main.consumes);
        
        /**
         * Browser compatibility support.
         */
        plugin.freezePublicAPI({
            /**
             * Gets Internet Explorer's major version, e.g. 10,
             * or returns null if a different browser is used.
             * 
             * @return {Number}
             */
            getIEVersion: getIEVersion
        });
        register(null, { browsersupport: plugin });
    }
});

// Support __defineGetter__ et al. on IE9
// (always triggers when packed)
try {
   if (!Object.prototype.__defineGetter__ &&
        Object.defineProperty({},"x",{get: function(){return true}}).x) {
        
        // Setter    
        Object.defineProperty(
            Object.prototype, 
            "__defineSetter__",
            {
                enumerable: false, 
                configurable: true,
                value: function(name,func){
                    Object.defineProperty(this,name,{set:func,enumerable: true,configurable: true});
                    
                    // Adding the property to the list (for __lookupSetter__)
                    if(!this.setters) this.setters = {};
                    this.setters[name] = func;
                }
            }
        );
        
        // Lookupsetter
        Object.defineProperty(
            Object.prototype, 
            "__lookupSetter__",
            {
                enumerable: false, 
                configurable: true,
                value: function(name){
                    if(!this.setters) return false;
                    return this.setters[name];
                }
            }
        );
        
        // Getter    
        Object.defineProperty(
            Object.prototype, 
            "__defineGetter__",
            {
                enumerable: false, 
                configurable: true,
                value: function(name,func){
                    Object.defineProperty(this,name,{get:func,enumerable: true,configurable: true});
                    
                    // Adding the property to the list (for __lookupSetter__)
                    if(!this.getters) this.getters = {};
                    this.getters[name] = func;
                }
            }
        );
        
        // Lookupgetter
        Object.defineProperty(
            Object.prototype, 
            "__lookupGetter__",
            {
                enumerable: false, 
                configurable: true,
                value: function(name){
                    if(!this.getters) return false;
                    return this.getters[name];
                }
            }
        );
        
   }

   if (!Array.isArray)
        Array.isArray = function(o) {
            return Object.prototype.toString.call(o) === "[object Array]";
        };
} catch(defPropException) {
   // Forget about it
}


