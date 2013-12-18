/**
 * jsonalyzer CTAGs-based analyzer
 *
 * @copyright 2013, Ajax.org B.V.
 * @author Lennart Kats <lennart add c9.io>
 */
define(function(require, exports, module) {

// TODO: don't include this directly in packed worker
var ctags = require("./ctags");

var util = require("./ctags_util");

var MAX_DOCHEAD_LENGTH = 80;

var CTAGS_OPTIONS = [
    '--langdef=js',
    '--langmap=js:.js',
    '--regex-js=/([A-Za-z0-9._$]+)[ \\t]*[:=][ \\t]*\\{/\\1/,object/',
    '--regex-js=/([A-Za-z0-9._$()]+)[ \\t]*[:=][ \\t]*function[ \\t]*\\(/\\1/,function/',
    '--regex-js=/function[ \\t]+([A-Za-z0-9._$]+)[ \\t]*\\(([^)])\\)/\\1/,function/',
    '--regex-js=/([A-Za-z0-9._$]+)[ \\t]*[:=][ \\t]*\\[/\\1/,array/',
    '--regex-js=/([^= ]+)[ \\t]*=[ \\t]*[^"]\'[^\']*/\\1/,string/',
    '--regex-js=/([^= ]+)[ \\t]*=[ \\t]*[^\']"[^"]*/\\1/,string/',
    
    '--langdef=rust',
    '--langmap=rust:.rs',
    '--regex-rust=/[ \\t]*fn[ \\t]+([a-zA-Z0-9_]+)/\\1/f,function/',
    '--regex-rust=/[ \\t]*type[ \\t]+([a-zA-Z0-9_]+)/\\1/T,types/',
    '--regex-rust=/[ \\t]*enum[ \\t]+([a-zA-Z0-9_]+)/\\1/T,types/',
    '--regex-rust=/[ \\t]*struct[ \\t]+([a-zA-Z0-9_]+)/\\1/m,types/',
    '--regex-rust=/[ \\t]*class[ \\t]+([a-zA-Z0-9_]+)/\\1/m,types/',
    '--regex-rust=/[ \\t]*mod[ \\t]+([a-zA-Z0-9_]+)/\\1/m,modules/',
    '--regex-rust=/[ \\t]*const[ \\t]+([a-zA-Z0-9_]+)/\\1/m,consts/',
    '--regex-rust=/[ \\t]*trait[ \\t]+([a-zA-Z0-9_]+)/\\1/m,traits/',
    '--regex-rust=/[ \\t]*impl[ \\t]+([a-zA-Z0-9_]+)/\\1/m,impls/',
    '--regex-rust=/[ \\t]*impl[ \\t]+of[ \\t]([a-zA-Z0-9_]+)/\\1/m,impls/',
    
    '--langmap=PHP:+.inc',
    '--PHP-kinds=+cf',
    '--regex-PHP=/abstract class ([^ ]*)/\\1/c/',
    '--regex-PHP=/interface ([^ ]*)/\\1/c/',
    '--regex-PHP=/(public |static |abstract |protected |private )+function ([^ (]*)/\\2/f/',

    '--regex-make=/-D([^ =]+).+$/\\1/d,definition/',
    
    '--langdef=markdown',
    '--langmap=markdown:.markdown',
    '--regex-markdown=/^#[ \\t]+(.*)/\\1/h,heading1/',
    '--regex-markdown=/^##[ \\t]+(.*)/\\1/h,heading2/',
    '--regex-markdown=/^###[ \\t]+(.*)/\\1/h,heading3/',
    
    '--langdef=ActionScript',
    '--langmap=ActionScript:.as',
    '--regex-ActionScript=/^[ \\t]*[(private|public|static)( \\t)]*function[ \\t]+([A-Za-z0-9_]+)[ \\t]*\\(/\\1/f,function/',
    '--regex-ActionScript=/^[ \\t]*[(public)( \\t)]*function[ \\t]+(set|get)[ \\t]+([A-Za-z0-9_]+)[ \\t]*\\(/\\2/p,property/',
    '--regex-ActionScript=/.*\\.prototype\\.([A-Za-z0-9 ]+)=([ \\t]?)function([ \\t]?)*\\(/\\1/f,function/',
];

/**
 * All languages supported by ctags_ex, with their file extensions,
 * and whether it's possible to guess the formal arguments of
 * functions (i.e., they use parantheses + comma separated arguments).
 */
var LANGUAGES = module.exports.LANGUAGES = [
    { guessFargs: true,  extensions: ["as"] },
    { guessFargs: false, extensions: ["asm", "a"] },
    { guessFargs: true,  extensions: ["sh"] },
    { guessFargs: true,  extensions: ["js", "html"] },
    { guessFargs: true,  extensions: ["coffee"] },
    { guessFargs: true,  extensions: ["bas"] },
    { guessFargs: true,  extensions: ["asp"] },
    { guessFargs: true,  extensions: ["c", "cc", "cpp", "cxx", "h", "hh", "hpp"] },
    { guessFargs: true,  extensions: ["cs"] },
    { guessFargs: false, extensions: ["e", "ge"], extractDocs: false}, // Eiffel
    { guessFargs: true,  extensions: ["erl", "hrl"] },
    { guessFargs: true,  extensions: ["lisp", "cl", "lsp"] },
    { guessFargs: true, extensions: ["lua"] },
    { guessFargs: false, extensions: ["cob"] },
    { guessFargs: true,  extensions: ["pas", "p"] },
    { guessFargs: true,  extensions: ["scm", "sm", "scheme", "oak"] },
    { guessFargs: true,  extensions: ["pl", "pm"] },
    { guessFargs: false, extensions: ["prolog"] },
    { guessFargs: false, extensions: ["ltx", "tex", "bib", "sty", "cls", "clo"] },
    { guessFargs: true,  extensions: ["php", "php3", "phtml", "inc"] },
    { guessFargs: true,  extensions: ["py"] },
    { guessFargs: true,  extensions: ["sh"] },
    { guessFargs: false, extensions: ["y", "ym"] },
    { guessFargs: true,  extensions: ["java"] },
    { guessFargs: true,  extensions: ["rb", "ru"] },
    { guessFargs: true,  extensions: ["ss"] }
];

// ctags.FS_createPath("/", "etc", true, true);
// ctags.FS_createDataFile("/etc", ".ctags", "--help\n" + CTAGS_OPTIONS.join("\n"), true, true);

module.exports.analyze = function(path, doc, callback) {
    if (!doc)
        return callback("No contents");
    
    var lines;
    if (doc.getAllLines) {
        lines = doc.getAllLines();
        doc = doc.getValue();
    }
    else {
        if (doc.getValue)
            doc = doc.getValue();
        lines = doc.split(/\n/);
    }
    
    var result = {
        doc: doc ? util.extractDocumentationAtRow(lines, 0) : undefined,
        properties: {}
    };
    
    var isDone = false;
    var language = getLanguage(path);
    var guessFargs = language && language.guessFargs;
    ctags.CTags_setOnTagEntry(function(name, kind, row, sourceFile, language) {
        analyzeTag(lines, name, kind, row, sourceFile, guessFargs, result.properties);
    });
    
    ctags.CTags_setOnParsingCompleted(function() {
        isDone = true;
        callback(null, result);
    });
    
    var filename = path.match(/[^\/]*$/)[0];
    ctags.FS_createPath("/", "data", true, true);
    
    // var start = new Date().getTime();
    try {
        ctags.CTags_parseTempFile(filename, doc);
    } catch (err) {
        if (isDone)
            throw err;
        return callback("Internal error in CTags: " + err);
    }
    // console.log((new Date().getTime() - start) + "ms: " + filename); // DEBUG
    
    // Since the above should run synchronously, we should be done by now;
    // make sure our callback is called
    if (!isDone) {
        callback(ctags.getLog() || "ctags analysis failed (callback not called)");
        callback = function() {
            throw new Error("Callback called too late");
        };
    }
};

function getLanguage(path) {
    var ext = path.substr(path.lastIndexOf(".") + 1);
    return ext && LANGUAGES.filter(function(l) {
        return l.extensions.indexOf(ext) > -1;
    })[0];
}
    
function analyzeTag(lines, name, kind, row, sourceFile, guessFargs, results) {
    var line = lines[row - 1] || "";
    var doc = util.extractDocumentationAtRow(lines, row - 2);

    var docHead = line.length > MAX_DOCHEAD_LENGTH
        ? line.substr(MAX_DOCHEAD_LENGTH) + "..."
        : line;
    if (docHead.indexOf(name) === -1) // sanity check
        docHead = null;
    var icon = getIconForKind(kind);
    
    var result = {
        row: row - 1,
        doc: doc,
        docHead: docHead,
        kind: kind,
        icon: icon
    };
    
    // Mark functions with unknown return type
    if (icon === "method" || icon === "method2") {
        result.guessFargs = guessFargs;
        result.properties = {
            _return: []
        };
    }
    
    results["_" + name] = results["_" + name] || [];
    results["_" + name].push(result);
}

function getIconForKind(kind) {
    // http://ctags.sourceforge.net/FORMAT
    switch (kind) {
        case "member": 
            return "property";
        case "function":
            return "method";
        case "prototype":
            return "method2";
        case "class": case "module": case "typedef":
            return "package";
        default:
            return "property2";
    }
}

});