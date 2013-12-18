/**
 * Cloud9 Language Foundation
 *
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {
    main.consumes = [
        "Plugin", "tabManager", "language", "ui"
    ];
    main.provides = ["language.marker"];
    return main;

    function main(options, imports, register) {
        var language = imports.language;
        var tabs = imports.tabManager;
        var ui = imports.ui;

        var Range = require("ace/range").Range;
        var Anchor = require('ace/anchor').Anchor;

        function SimpleAnchor(row, column) {
            this.row = row;
            this.column = column || 0;
        }

        SimpleAnchor.prototype.onChange = Anchor.prototype.onChange;
        SimpleAnchor.prototype.setPosition = function(row, column) {
            this.row = row;
            this.column = column;
        };

        language.on("initWorker", function(e){
            ui.insertCss(require("text!./marker.css"), language);

            e.worker.on("markers", function(event) {
                if (language.disabled) return;
                
                var tab = tabs.findTab(event.data.path);
                if (!tab) return;
                
                var editor = tab.editor;
                addMarkers(event, editor.ace);
            });
            
            e.worker.on("change", function(event, worker) {
                onChange(worker.$doc, event);
            });
        });

        var disabledMarkerTypes = {};
    
        function removeMarkers(session) {
            var markers = session.markerAnchors;
            for (var i = 0; i < markers.length; i++) {
                session.removeMarker(markers[i].id);
            }
            session.markerAnchors = [];
            session.setAnnotations([]);
        }
    
        function addMarkers(event, editor) {
            var annos = event.data;
            if(!editor)
                return;
            
            var mySession = editor.session;
            if (!mySession.markerAnchors) mySession.markerAnchors = [];
            removeMarkers(mySession);
            mySession.languageAnnos = [];
            
            var sel = editor.getSelectionRange();
            var showOccurenceMarkers = sel.isEmpty() ? true
                : sel.isMultiLine() ? false : null;
            var occurrenceMarkers = [];
            annos.forEach(function(anno) {
                // Certain annotations can temporarily be disabled
                if (disabledMarkerTypes[anno.type])
                    return;
                // Multi-line markers are not supported, and typically are a result from a bad error recover, ignore
                if(anno.pos.el && anno.pos.sl !== anno.pos.el)
                    return;
                
                var pos = anno.pos || {};
                
                var range = new Range(pos.sl, pos.sc || 0, pos.el, pos.ec || 0);
                if (anno.type == "occurrence_other" || anno.type == "occurrence_main") {
                    if (!showOccurenceMarkers) {
                        if (showOccurenceMarkers === false)
                            return;
                        if (range.containsRange(sel))
                            showOccurenceMarkers = true;
                        occurrenceMarkers.push(mySession.markerAnchors.length);
                    }
                }

                mySession.markerAnchors.push(anno);
                
                anno.start = new SimpleAnchor(pos.sl, pos.sc);
                
                if (pos.sc !== undefined && pos.ec !== undefined) {
                    anno.range = range;
                    anno.id = mySession.addMarker(anno.range, "language_highlight_" + (anno.type ? anno.type : "default"));
                    anno.range.start = anno.start;
                    anno.colDiff = pos.ec - pos.sc;
                    anno.rowDiff = pos.el - pos.sl;
                }

                if (!anno.message)
                    return;
                var gutterAnno = {
                    guttertext: anno.message,
                    type: anno.level || "warning",
                    text: anno.message,
                    pos: anno.pos,
                    resolutions: anno.resolutions,
                    row: pos.sl
                };
                anno.gutterAnno = gutterAnno;
                mySession.languageAnnos.push(gutterAnno);
            });
            
            if (!showOccurenceMarkers) {
                for (var i = occurrenceMarkers.length; i--;) {
                    var markerI = occurrenceMarkers[i];
                    mySession.removeMarker(mySession.markerAnchors[markerI].id);
                    mySession.markerAnchors.splice(markerI, 1);
                }
            }
            
            mySession.setAnnotations(mySession.languageAnnos);
        }
    
        /**
         * Temporarily disable certain types of markers (e.g. when refactoring)
         */
        function disableMarkerType(type, ace) {
            disabledMarkerTypes[type] = true;
            var session = ace.getSession();
            var markers = session.getMarkers(false);
            for (var id in markers) {
                // All language analysis' markers are prefixed with language_highlight
                if (markers[id].clazz === 'language_highlight_' + type)
                    session.removeMarker(id);
            }
        }
    
        function enableMarkerType(type) {
            disabledMarkerTypes[type] = false;
        }
    
        /**
         * Called when text in editor is updated
         * This attempts to predict how the worker is going to adapt markers based on the given edit
         * it does so instanteously, rather than with a 500ms delay, thereby avoid ugly box bouncing etc.
         */
        function onChange(session, event) {
            var range = event.data.range;
            var isInserting = event.data.action[0] !== "r";
            var text = event.data.text;
            var adaptingId = text && text.search(/[^a-zA-Z0-9\$_]/) === -1;
            var languageAnnos = [];
            var markers = session.markerAnchors || [];
            var foundOne = false;
            var marker, start;
            if (!isInserting) { // Removing some text
                // Run through markers
                for (var i = markers.length; i--;) {
                    marker = markers[i];
                    
                    if (!range.compareInside(marker.start.row, marker.start.column)) {
                        session.removeMarker(marker.id);
                        foundOne = true;
                        continue;
                    }
                    else if (adaptingId && marker.range && marker.range.contains(range.start.row, range.start.column)) {
                        foundOne = true;
                        marker.colDiff -= text.length;
                    }
                    
                    start = marker.start;
                    start.onChange(event);
                    if (marker.range) {
                        marker.range.end.row = start.row + marker.rowDiff;
                        marker.range.end.column = start.column + marker.colDiff;
                    }

                    if (marker.gutterAnno) {
                        languageAnnos.push(marker.gutterAnno);
                        marker.gutterAnno.row = marker.start.row;
                    }
                }
                // Didn't find any markers, therefore there will not be any anchors or annotations either
                if (!foundOne)
                    return;
            }
            else { // Inserting some text
                // Run through markers
                for (var i = markers.length; i--;) {
                    marker = markers[i];
                    // Only if inserting an identifier
                    if (marker.range && marker.range.contains(range.start.row, range.start.column)) {
                        foundOne = true;
                        if (adaptingId) {
                            marker.colDiff += text.length;
                        } else if (Range.comparePoints(range.start, marker.range.start) > 0)
                            session.removeMarker(marker.id);
                    }
                    
                    start = marker.start;
                    start.onChange(event);
                    if (marker.range) {
                        marker.range.end.row = start.row + marker.rowDiff;
                        marker.range.end.column = start.column + marker.colDiff;
                    }
                    
                    if (marker.gutterAnno) {
                        languageAnnos.push(marker.gutterAnno);
                        marker.gutterAnno.row = marker.start.row;
                    }
                }
            }
            session._dispatchEvent("changeBackMarker");
            session.setAnnotations(languageAnnos);
        }
        
        register(null, {
            "language.marker": {
                disableMarkerType : disableMarkerType,
                enableMarkerType : enableMarkerType
            }
        });
    }
});