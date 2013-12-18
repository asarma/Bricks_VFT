/*global Firmin */
 
define(function(require, exports, module) {
    main.consumes = ["Plugin", "settings"];
    main.provides = ["anims"];
    return main;

    function main(options, imports, register) {
        var Plugin   = imports.Plugin;
        var settings = imports.settings;
        
        require("./lib_firmin");

        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit   = plugin.getEmitter();
        
        var animating = false;
        
        /***** Methods *****/
        
        function animateMultiple(tweens, finish) {
            var shouldAnimate = settings.getBool("user/general/@animateui");
    
            if (shouldAnimate) {
                animating = true;
                
                var duration = 0;
                tweens.forEach(function(options) {
                    var node = options.node;
                    Firmin.animate(node.$ext || node, options, options.duration || 0.2, function() {
                        (node.$ext || node).style[apf.CSSPREFIX + "TransitionDuration"] = "";
                        
                        animating = false;
                    });
                    duration = Math.max(duration, options.duration || 0.2);
                });
    
                setTimeout(function(){
                    finish && finish();
                }, (duration * 1000) + 50);
            }
            else {
                //@todo set value
    
                finish && finish();
            }
        }
    
        function animate(aNode, options, finish){
            var shouldAnimate = settings.getBool("user/general/@animateui");
    
            if (shouldAnimate) {
                animating = true;
                
                Firmin.animate(aNode.$ext || aNode, options, options && options.duration || 0.2, function() {
                    (aNode.$ext || aNode).style[apf.CSSPREFIX + "TransitionDuration"] = "";
                    finish && finish(); //setTimeout(finish, 30);
                    
                    animating = false;
                });
            }
            else {
                //@todo set value
                finish && finish();
            }
        }
    
        function animateSplitBoxNode(aNode, options, finish){
            var shouldAnimate = settings.getBool("user/general/@animateui");
    
            var pNode = aNode.parentNode;
            var firstChild = pNode.getFirstChild();
            var lastChild = pNode.getSecondChild();
            var isFirst, oNode = (isFirst = aNode == firstChild) ? lastChild : firstChild;
            if (oNode == aNode || !oNode.visible)
                throw new Error("animating object that has no partner");
    
            var to2;
            if (pNode.$vbox) {
                to2 = { timingFunction : options.timingFunction };
                if (isFirst)
                    to2.top = (parseInt(options.height, 10) + pNode.$edge[0] + pNode.padding) + "px";
                else
                    to2.bottom = (parseInt(options.height, 10) + pNode.$edge[2] + pNode.padding) + "px";
            }
            else {
                to2 = { timingFunction : options.timingFunction };
                if (isFirst)
                    to2.left = (parseInt(options.width, 10) + pNode.$edge[3] + pNode.padding) + "px";
                else
                    to2.right = (parseInt(options.width, 10) + pNode.$edge[1] + pNode.padding) + "px";
            }
    
            if (shouldAnimate && !options.immediate) {
                emit("animate", {
                    type     : "splitbox",
                    which    : aNode,
                    other    : oNode,
                    options  : options,
                    options2 : to2,
                    duration : options.duration || 0.2
                });
                
                animating = true;
    
                Firmin.animate(aNode.$ext, options, options.duration || 0.2, function() {
                    aNode.$ext.style[apf.CSSPREFIX + "TransitionDuration"] = "";
                });
                Firmin.animate(oNode.$ext, to2, options.duration || 0.2, function() {
                    oNode.$ext.style[apf.CSSPREFIX + "TransitionDuration"] = "";
    
                    if (aNode.parentNode) {
                        if (pNode.$vbox)
                            aNode.setHeight(parseInt(options.height, 10));
                        else
                            aNode.setWidth(parseInt(options.width, 10));
                    }
    
                    finish && finish(); //setTimeout(finish, 30);
                    
                    animating = false;
                });
            }
            else {
                var dir;
                if (pNode.$vbox) {
                    aNode.setHeight(options.height);
                    dir = isFirst ? "top" : "bottom";
                }
                else {
                    aNode.setWidth(options.width);
                    dir = isFirst ? "left" : "right";
                }
                oNode.$ext.style[dir] = to2[dir];
    
                finish && finish();
            }
        }
        
        function emitAnimate(e){
            emit("animate", e);
        }
        
        /***** Register and define API *****/
        
        /**
         * Animation API for Cloud9 IDE. Use this object to animate HTML 
         * elements and APF elements. The implementation uses CSS animations
         * to animate the HTML elements.
         * 
         *     anims.animate(someDiv, { 
         *         width    : "200px", 
         *         duration : 0.2 
         *     }, function(){
         *         console.log("done");
         *     });
         * 
         * @singleton
         **/
        plugin.freezePublicAPI({
            /**
             * Specifies whether at least one animationg is running at this moment.
             * @property {Boolean} animating
             */
            get animating(){ return animating; },
            
            _events : [
                /**
                 * Fires when an animation starts
                 * @event animate
                 * @param {Object}                 e
                 * @param {String}                 e.type             The animation type. Possible values are "splitbox", and others.
                 * @param {HTMLElement/AMLElement} e.which            The element that is animated
                 * @param {HTMLElement/AMLElement} e.other            This is only relevant for a splitbox resize, where there is a 2nd element that is animated.
                 * @param {Object}                 e.options          The options passed to the {@link #method-animate} method.
                 * @param {Object}                 e.options2         This is only relevant for a splitbox resize. There are the options for the 2nd animation.
                 * @param {Number}                 [e.duration=0.2]   The duration of the animation expressed in seconds
                 */
                "animate"
            ],
            
            /**
             * Animate multiple elements and/or multiple properties at the
             * same time. Note that each tween object can specify multiple 
             * css properties by adding the names of the css property as a key
             * and the value as it's value.
             * 
             * Example:
             * 
             *     anims.animateMultiple([{
             *         node   : someDiv,
             *         width  : "200px",
             *         height : "300px"
             *     }, {
             *         node   : anotherDiv,
             *         width  : "100px",
             *         height : "100px"
             *     }], function(){});
             * 
             * @param {Array}                  tweens                   Array of tween elements.
             * @param {HTMLElement/AMLElement} tweens.node              The element that is animated
             * @param {Number}                 [tweens.duration=0.2]    The duration of the animation expressed in seconds.
             * @param {String}                 [tweens.timingFunction]  The [CSS timing function](https://developer.mozilla.org/en-US/docs/Web/CSS/timing-function).
             * @param {Function}               finish                   Called when all animations have completed.
             */
            animateMultiple : animateMultiple,
            
            /**
             * Animates a single element and one or more properties.
             * Note that the tween object can contain multiple 
             * css properties by adding the names of the css property as a key
             * and the value as it's value.
             * 
             * Example:
             * 
             *     anims.animateMultiple({
             *         node   : someDiv,
             *         width  : "200px",
             *         height : "300px"
             *     }, function(){});
             * 
             * @param {HTMLElement/AMLElement} node                    The element that is animated
             * @param {Object}                 tween
             * @param {Number}                 [tween.duration=0.2]    The duration of the animation expressed in seconds.
             * @param {String}                 [tween.timingFunction]  The [CSS timing function](https://developer.mozilla.org/en-US/docs/Web/CSS/timing-function).
             * @param {Function}               finish                  Called when all animations have completed.
             */
            animate : animate,
            
            /**
             * This method is dedicated to animating APF Elements that are
             * part of a splitbox layout element. A splitbox is a box that can 
             * be split in 2 by adding 2 children to it. If you are using a
             * splitbox in your UI and need to animate a child element, then 
             * use this function.
             *
             * Note that the tween object can contain multiple 
             * css properties by adding the names of the css property as a key
             * and the value as it's value.
             * 
             * Example:
             * 
             *     anims.animateSplitBoxNode(panel, {
             *         duration : 0.5,
             *         width    : "200px"
             *     }, function(){})
             * 
             * @param {AMLElement} node                    The element that is animated
             * @param {Object}     tween
             * @param {Number}     [tween.duration=0.2]    The duration of the animation expressed in seconds.
             * @param {String}     [tween.timingFunction]  The [CSS timing function](https://developer.mozilla.org/en-US/docs/Web/CSS/timing-function).
             * @param {Function}   finish                  Called when all animations have completed.
             */
            animateSplitBoxNode : animateSplitBoxNode,
            
            /**
             * Emits the animate event, forcing a resize amongst editors.
             * @param {Object} e
             * @private
             */
            emitAnimate : emitAnimate
        });
        
        register(null, {
            anims: plugin
        });
    }
});