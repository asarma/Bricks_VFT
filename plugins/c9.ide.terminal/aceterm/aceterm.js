
define(function(require, exports, module) {
    var InputHandler = require("./input");
    var MouseHandler = require("./mouse");
    
    // Ace
    var dom                 = require("ace/lib/dom");
    var Range               = require("ace/range").Range;
    var AceEditor           = require("ace/editor").Editor;
    var EditSession         = require("ace/edit_session").EditSession;
    var MultiSelect         = require("ace/multi_select").MultiSelect;
    var VirtualRenderer     = require("ace/virtual_renderer").VirtualRenderer;
    
    var Terminal = require("./libterm");
    
    // TODO
    var Aceterm = function(w, h, writeCb) {
        var terminal = new Terminal(w, h, writeCb);
        terminal.aceSession = Aceterm.createSession(terminal);
        
        return terminal;
    };
    
    Aceterm.createEditor = function(container, theme) {
        // Create Ace editor instance
        var ace = new AceEditor(new VirtualRenderer(container, theme));
        new MultiSelect(ace);
        
        ace.setStyle("terminal");
        
        // todo move ace colors to container
        var scroller = ace.renderer.scroller;
        scroller.style.color = "inherit";
        scroller.style.background = "inherit";
        
        ace.setOptions({
            showPrintMargin: false,
            showGutter: false,
            // readOnly: true,
            scrollPastEnd: 0
        });
        
        ace.renderer.setScrollMargin(1, 0);
       
        ace.renderer.on("resize", function(oldSize, renderer) {
            var session = renderer.session;
            var size = renderer.$size;
            var dh = size.scrollerHeight - oldSize.scrollerHeight;
            if (dh < 0) {
                var oldMaxScrollTop = renderer.layerConfig.maxHeight
                    - oldSize.scrollerHeight + renderer.scrollMargin.v;
                var scrollTop = session.getScrollTop();
                if (scrollTop > oldMaxScrollTop - renderer.layerConfig.lineHeight) {
                    session.setScrollTop(scrollTop - dh);
                }
                    session.maxScrollTop = 0;
                
            }
            if (session.resize) {
                session.resize();
            }
            
            return;
            var h = ace.renderer.layerConfig.lineHeight;
            
            if (!h)
                return;
            if (session.resize) {
                session.resize();
            }
            
            // if (session.getScrollTop() >= (session.maxScrollTop || 0) - 2 * h) {
            //     session.setScrollTop(Number.MAX_VALUE);
            //     session.maxScrollTop = 0;
            // } 
            // session.$scrollMarginUpdatePending = true;
            
            console.log(session.getScrollTop(), ace.renderer.$size)
            
            var height = ace.renderer.$size.height - 1;
            var extra = height % h;
            extra = 1
            ace.renderer.setScrollMargin(1, extra - 1);
            
            if (session.getScrollTop() === 0) {
                session.setScrollTop(-1);
            }
            
        });
        
        
        
        // permanently hide hor scrollbar
        ace.renderer.scrollBarH.setVisible(false);
        ace.renderer.scrollBarH.setVisible=function(){};
        
        ace.renderer.setOption("vScrollBarAlwaysVisible", true);
        ace.renderer.scrollBarV.element.style.overflowY = "auto";
        
        // todo may be useful to move "changeEditor" event into ace
        ace.on("changeSession", function(e) {
            if (e.oldSession) {
                e.oldSession._signal("changeEditor", {oldEditor: ace});
                if (e.oldSession.ace == ace)
                    e.oldSession.ace = null;
            }
            if (e.session) {
                if (e.session.ace) {
                    console.warn("aceterm session isn't detached");
                }
                e.session.ace = ace;
                e.session._signal("changeEditor", {editor: ace});
            }
        });
        
        initView(ace);
        ace.termInputHandler = new InputHandler(ace);
        ace.termMouseHandler = new MouseHandler(ace);
        
        return ace;
    };
    
    Aceterm.createSession = function(term) {
        var session = new EditSession("");
        session.setScrollTop(-1);
        session.term = term;
        
        term.copyMode = true;
        
        var noScrollbar = function() {
            return (term.applicationKeypad || term.mouseEvents);
        };
        term.noScrollbar = noScrollbar;
        
        session.doc.getLength = function() {
            if (noScrollbar())
                return term.lines.length - term.ybase;
            return term.lines.length;
        };
        session.doc.getLine = function(row, newLineChar) {
            if (noScrollbar()) {
                row += term.ybase;
            }
            var line = term.lines[row] || [];
            var str = "";
            for (var l = line.length; l--;)
                if (line[l][1])
                    break;
            for (var i = 0; i <= l; i++)
                str += line[i][1] || " ";

            if (newLineChar && !line.wrapped)
                str += newLineChar;

            return str;
        };
        
        session.doc.getLines = function(start, end) {
            var lines = [];
            for (var i = start; i < end; i++) {
                lines.push(this.getLine(i));
            }
            return lines;
        };
        session.doc.$lines = null;
        
        session.doc.getTextRange = function(range) {
            var start = range.start.row;
            var end = range.end.row;
            if (start === end) {
                return this.getLine(start).substring(range.start.column, range.end.column);
            }
            var newLineChar = this.getNewLineCharacter();
            var str = this.getLine(start++, newLineChar).substring(range.start.column);
            while (start < end) {
                str += this.getLine(start++, newLineChar);
            }
            str += this.getLine(end, newLineChar).substring(0, range.end.column);
            return str;
        };
        session.$computeWidth =
        session.getScreenWidth = function () {
            return this.term.cols;
        };
        
        session.doc.insert = function(pos, str) {
            session.send(str);
            return pos;
        };
        
        var range = session.selection.getRange();
        range.cursor = range.start = range.end;
        
        var dummyDelta = {data:{action:"insertText", range: range.clone(), text:""}};

        session.on("changeEditor", function() {
            if (session.selectionRange)
                return;
            session.selectionRange = range;
            session.ace.addSelectionMarker(range);
        });
                
        
        function debug(term) {
            console.log([term.applicationKeypad,
                [term.x10Mouse,term.vt200Mouse, term.normalMouse] + "",
                (function(n){return n&&[n.x,n.y,n.ydisp,n.ybase,n.lines.length]})(term.normal)+"",
                (function(n){return[n.x,n.y,n.ydisp,n.ybase,n.lines.length]})(term)+""
            ]);
        }
        session.term.refreshView = function(start, end) {
            var ace = session.ace;
            if (!ace)
                return;

            var term = session.term;
            var renderer = ace.renderer;

            // debug(term);
            
            range.cursor.row = term.y;
            var scrollTop = 0;
            var h = ace.renderer.layerConfig.lineHeight;
            if (!noScrollbar()) {
                range.cursor.row += term.ybase;
                start += term.ybase;
                end += term.ybase;
                
                scrollTop = term.ybase * h;
                var maxScrollTop = Math.min(session.maxScrollTop, scrollTop);
                if (session.getScrollTop() < (maxScrollTop || 0) - 2 * h)
                    scrollTop = null;
            }
            
            if (ace.isMousePressed)
                scrollTop = null;

            if (scrollTop !== null) {
                session.setScrollTop(scrollTop || -1);
                session.maxScrollTop = scrollTop;
                
                if (session.$scrollMarginUpdatePending) {
                    // session.$scrollMarginUpdatePending = false;
                    // var height = renderer.$size.height;
                    // renderer.setScrollMargin(1, height - 2 - term.rows * h);
                }
            } else
                renderer.$loop.schedule(renderer.CHANGE_SCROLL);
            
            renderer.updateLines(start, end);
            range.cursor.column = term.x;
            if (scrollTop !== null)
                session.selection.setSelectionRange(range);

            // needed for things like search to work correctly
            session.doc._signal("change", dummyDelta);
        };
        session.term.on("input", function() {
            if (session.maxScrollTop) {
                session.maxScrollTop = 0;
                session.setScrollTop(Number.MAX_VALUE);
            }
        });
        session.setScrollLeft = function (scrollLeft) {
            if (scrollLeft) {
                this.$scrollLeft = 0;
                this._signal("changeScrollLeft", 0);
            }
        };
    
        session.send = function(str) {
            this.term.send(str);
        };
        
        return session;
    };
    
    module.exports = Aceterm;
    
    function initCursor() {
        this.cursorClass = "reverse-video";
        this.getCursorNode = function() {
            if (!this.textLayer.$cur) {
                this.textLayer.$cur =
                    this.textLayer.element.querySelector(".reverse-video");
            }
            
            return this.textLayer.$cur || {};
        };
        this.hideCursor = function() {
            this.isVisible = false;
            dom.addCssClass(this.element, "ace_hidden-cursors");
            this.restartTimer();
        };
    
        this.showCursor = function() {
            this.isVisible = true;
            dom.removeCssClass(this.element, "ace_hidden-cursors");
            this.restartTimer();
        };
    
        this.restartTimer = function() {
            clearInterval(this.intervalId);
            clearTimeout(this.timeoutId);
            
            this.getCursorNode().className = this.cursorClass;
    
            if (!this.blinkInterval || !this.isVisible || !Terminal.cursorBlink)
                return;
    
            this.intervalId = setInterval(function() {
                if (this.renderer.$loop.changes) return;
                var node = this.getCursorNode();
                node.className = node.className ? "" : this.cursorClass;
            }.bind(this), 500);
        };
    
        this.update = function(config) {
            this.config = config;
    
            var pixelPos = this.getPixelPosition(null, true);

            this.restartTimer();

            // cache for textarea and gutter highlight
            this.$pixelPos = pixelPos;
            this.restartTimer();
        };
    }
    
    function initView(ace) {
        initCursor.call(ace.renderer.$cursorLayer);
        ace.renderer.$cursorLayer.renderer = ace.renderer;
        ace.renderer.$cursorLayer.textLayer = ace.renderer.$textLayer;
        
        // allow for 1px of cursor outline
        ace.renderer.content.style.overflow = "visible";
        ace.renderer.$textLayer.element.style.overflow = "visible";
        
        ace.renderer.$textLayer.$renderLine = Aceterm.renderLine;
            
        ace.renderer.$textLayer.$renderLineInner = Aceterm.renderLineInner;
        
        ace.setOption("showPrintMargin", false);
        ace.setOption("highlightActiveLine", false);
    }
    
    Aceterm.renderLine = function(stringBuilder, row, onlyContents, foldLine) {
        if (!onlyContents) {
            stringBuilder.push(
                "<div class='ace_line' style='height:", this.config.lineHeight, "px'>"
            );
        }
        this.$renderLineInner(stringBuilder, row);
    
        if (!onlyContents)
            stringBuilder.push("</div>");
    };
    
    Aceterm.renderLineInner = function(stringBuilder, row) {
        var term = this.session.term;
        if (!term)
            return;
        var fgColor, bgColor, flags;
        var width = term.cols;
        var cursorY = term.y;
        
        if (term.noScrollbar()) {
            row += term.ybase;
        }
        
        cursorY += term.ybase;
        
        
        var line = term.lines[row] || [];
        var out = '';
    
        var x = row === cursorY && term.cursorState && !term.cursorHidden
            ? term.x
            : -1;

        var defAttr = term.defAttr;
        var attr = defAttr;
        for (var i = 0; i < width; i++) {
            var data = line[i][0];
            var ch = line[i][1];
    
            if (i === x) data = -1;
    
            if (data !== attr) {
                if (attr !== defAttr)
                    out += '</span>';
                if (data === defAttr) {
                    // do nothing
                } else if (data === -1) {
                    out += '<span class="reverse-video">';
                    this.$cur = null;
                } else {
                    out += '<span style="';

                    bgColor = data & 0x1ff;
                    fgColor = (data >> 9) & 0x1ff;
                    flags = data >> 18;

                    if (flags & 1) {
                        if (this.allowBoldFonts)
                            out += 'font-weight:bold;';
                        // see: XTerm*boldColors
                        if (fgColor < 8)
                            fgColor += 8;
                    }

                    if (flags & 2)
                        out += 'text-decoration:underline;';

                    if (bgColor === 256) {
                        if (fgColor !== 257)
                            out += 'color:' + (
                                Terminal.overridenColors[fgColor] ||
                                Terminal.colors[fgColor]
                            ) + ';';
                    } else {
                        out += 'background-color:' + Terminal.colors[bgColor] + ';';
                        if (fgColor !== 257)
                            out += 'color:' + Terminal.colors[fgColor] + ';';
                        out += 'display:inline-block" class="aceterm-line-bg" l="' + i;
                    }
                    out += '">';
                }
            }
    
            
            if (ch <= ' ')
                out += '\xa0';
            else if (ch == '&')
                out += '&#38;';
            else if (ch == '<')
                out += '&#60;';
            else
                out += ch;
    
            attr = data;
        }
    
        if (attr !== defAttr)
            out += '</span>';
        stringBuilder.push(out);
    };

});