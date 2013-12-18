/**
 * Completion utilities for language workers.
 * 
 * Import using
 * 
 *     require("plugins/c9.ide.language/complete_util")
 * 
 * @class language.complete_util
 */
define(function(require, exports, module) {

var ID_REGEX = /[a-zA-Z_0-9\$]/;
var REQUIRE_ID_REGEX = /(?!["'])./;

function retrievePrecedingIdentifier(line, offset, regex) {
    regex = regex || ID_REGEX;
    var buf = [];
    for (var i = offset-1; i >= 0; i--) {
        if (regex.test(line[i]))
            buf.push(line[i]);
        else
            break;
    }
    return buf.reverse().join("");
}

function retrieveFollowingIdentifier(line, offset, regex) {
    regex = regex || ID_REGEX;
    var buf = [];
    for (var i = offset; i < line.length; i++) {
        if (regex.test(line[i]))
            buf.push(line[i]);
        else
            break;
    }
    return buf.join("");
}

function prefixBinarySearch(items, prefix) {
    var startIndex = 0;
    var stopIndex = items.length - 1;
    var middle = Math.floor((stopIndex + startIndex) / 2);
    
    while (stopIndex > startIndex && middle >= 0 && items[middle].indexOf(prefix) !== 0) {
        if (prefix < items[middle]) {
            stopIndex = middle - 1;
        }
        else if (prefix > items[middle]) {
            startIndex = middle + 1;
        }
        middle = Math.floor((stopIndex + startIndex) / 2);
    }
    
    // Look back to make sure we haven't skipped any
    while (middle > 0 && items[middle-1].indexOf(prefix) === 0)
        middle--;
    return middle >= 0 ? middle : 0; // ensure we're not returning a negative index
}

function findCompletions(prefix, allIdentifiers) {
    allIdentifiers.sort();
    var startIdx = prefixBinarySearch(allIdentifiers, prefix);
    var matches = [];
    for (var i = startIdx; i < allIdentifiers.length && allIdentifiers[i].indexOf(prefix) === 0; i++)
        matches.push(allIdentifiers[i]);
    return matches;
}

function fetchText(staticPrefix, path) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', staticPrefix + "/" + path, false);
    try {
        xhr.send();
    }
    // Likely we got a cross-script error (equivalent with a 404 in our cloud setup)
    catch(e) {
        return false;
    }
    if (xhr.status === 200)
        return xhr.responseText;
    else
        return false;
}

/**
 * Determine if code completion results triggered for oldLine/oldPos
 * would still be applicable for newLine/newPos
 * (assuming you would filter them for things that no longer apply).
 */
function canCompleteForChangedLine(oldLine, newLine, oldPos, newPos, identifierRegex) {
    if (oldPos.row !== newPos.row)
        return false;
    
    if (oldLine === newLine)
        return true;
        
    if (newLine.indexOf(oldLine) !== 0)
        return false;
        
    var oldPrefix = retrievePrecedingIdentifier(oldLine, oldPos.column, identifierRegex);
    var newPrefix = retrievePrecedingIdentifier(newLine, newPos.column, identifierRegex);
    return newLine.substr(0, newLine.length - newPrefix.length) === oldLine.substr(0, oldLine.length - oldPrefix.length);
}

function precededByIdentifier(line, column, postfix, ace) {
    var id = retrievePrecedingIdentifier(line, column);
    if (postfix) id += postfix;
    return id !== "" && !(id[0] >= '0' && id[0] <= '9') 
        && (inCompletableCodeContext(line, column, id, ace) 
        || isRequireJSCall(line, column, id, ace));
}

function isRequireJSCall(line, column, identifier, ace, noQuote) {
    if (ace.getSession().syntax !== "javascript")
        return false;
    var id = identifier == null ? retrievePrecedingIdentifier(line, column, REQUIRE_ID_REGEX) : identifier;
    var LENGTH = 'require("'.length - (noQuote ? 1 : 0);
    var start = column - id.length - LENGTH;
    var substr = line.substr(start, LENGTH) + (noQuote ? '"' : '');

    return start >= 0 && substr.match(/require\(["']/)
        || line.substr(start + 1, LENGTH).match(/require\(["']/);
}

/**
 * Ensure that code completion is not triggered.
 */
function inCompletableCodeContext(line, column, id, ace) {
    var inMode = null;
    if (line.match(/^\s*\*.+/))
        return false;
    for (var i = 0; i < column; i++) {
        if(line[i] === '"' && !inMode)
            inMode = '"';
        else if(line[i] === '"' && inMode === '"' && line[i-1] !== "\\")
            inMode = null;
        else if(line[i] === "'" && !inMode)
            inMode = "'";
        else if(line[i] === "'" && inMode === "'" && line[i-1] !== "\\")
            inMode = null;
        else if(line[i] === "/" && line[i+1] === "/") {
            inMode = '//';
            i++;
        }
        else if(line[i] === "/" && line[i+1] === "*" && !inMode) {
            if (line.substr(i + 2, 6) === "global")
                continue;
            inMode = '/*';
            i++;
        }
        else if(line[i] === "*" && line[i+1] === "/" && inMode === "/*") {
            inMode = null;
            i++;
        }
        else if(line[i] === "/" && ace.getSession().syntax === "javascript" && !inMode)
            inMode = "/";
        else if(line[i] === "/" && inMode === "/" && line[i-1] !== "\\")
            inMode = null;
    }
    return !inMode;
}

/**
 * @ignore
 * @return {Boolean}
 */
exports.precededByIdentifier = precededByIdentifier;

/**
 * @ignore
 */
exports.isRequireJSCall = isRequireJSCall;

/**
 * @internal Use {@link worker_util#getPrecedingIdentifier() instead.
 */
exports.retrievePrecedingIdentifier = retrievePrecedingIdentifier;

/**
 * @internal Use {@link worker_util#getFollowingIdentifier() instead. 
 */
exports.retrieveFollowingIdentifier = retrieveFollowingIdentifier;

/**
 * @ignore
 */
exports.findCompletions = findCompletions;

/**
 * @ignore
 */
exports.fetchText = fetchText;

/**
 * @ignore
 */
exports.DEFAULT_ID_REGEX = ID_REGEX;

/**
 * @ignore
 */
exports.canCompleteForChangedLine = canCompleteForChangedLine;
});