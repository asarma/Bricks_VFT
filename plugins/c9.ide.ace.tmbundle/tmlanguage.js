var fs = require("fs");
var util = require("util");
var lib = require("./lib");
var pathlib = require("path");
var parseLanguage = lib.parsePlist;


/***** regexp tokenizer */
require("amd-loader");

var Tokenizer = require(lib.AceRoot + "ace/tokenizer").Tokenizer;
var Tokenizer = require(lib.AceRoot + "ace/tokenizer_dev").Tokenizer; // todo can't use tokenizer because of max token count
var TextHighlightRules = require(lib.AceRoot + "ace/mode/text_highlight_rules").TextHighlightRules;

var r = new TextHighlightRules()
r.$rules = {
    start: [
        {token: "anchor", regex: /[\^\$]|\\[bBAZzG]/, merge:false},
        {token: "backRef", regex: /\\([1-9]|k(<\w+\b[+-]?\d>|'\w+\b[+-]?\d'))/, merge:false},
        {include: "charTypes", merge:false},
        {token: "charclass", regex: /\[\^?/, push: "charclass", merge:false},
        {token: "alternation", regex: /\|/, merge:false},
        {include: "quantifiers", merge:false},
        {include: "groups", merge:false}
    ],
    charTypes: [
        {token: "char", regex: /\\([tvnrbfae]|[0-8]{1,3}|x[\dA-Fa-f]{2}|x7[\dA-Fa-f]{7})/, merge:false}, // todo \cx
        {token: "charType", regex: /\.|\\[wWsSdDhH]/, merge:false},
        {token: "charProperty", regex: /\\p{\w+}/, merge:false},
        {token: "char", regex: /\\./, merge:false},
    ],
    quantifiers: [
        {token: "quantifier", regex: /([?*+]|{\d+\b,?\d*}|{,\d+})[?+]?/, merge:false}
    ],
    charclass: [
        {include: "charTypes", merge:false},
        {token: "charclass.start", regex: /\[\^?/, push: "charclass", merge:false},
        {token: "charclass.end", regex: /\]/, next: "pop", merge:false}
    ],
    groups: [
        {token: "group", regex: /[(]([?](#|[imx\-]+:?|:|=|!|<=|<!|>|<\w+>|'\w+'|))?|[)]/,
            onMatch: function(val, state, stack) {
                if (!stack.groupNumber)
                    stack.groupNumber = 1;

                var isStart = val !== ")";
                var t = {depth:0,type: isStart ? "group.start" : "group.end", value: val};
                t.groupType = val[2];

                if (val == "(") {
                    t.number = stack.groupNumber++;
                    t.isGroup = true
                } else if (val[2] == "'" || (val[2] == "<" && val.slice(-1) == ">")) {
                    t.name = val.slice(2, -1)
                    t.isGroup = true
                } else if (val[2] == ":") {
                    t.isGroup = true
                }

                if (isStart) {
                    if (stack.groupDepth) {
                        stack[0].hasChildren = true
                    }
                    stack.groupDepth = (stack.groupDepth||0)+1;
                    stack.unshift(t)
                } else {
                    stack.groupDepth --;
                    t.start = stack.shift(t)
                    t.start.end = t
                }
                return [t]
            }, merge:false
        }
    ]
}
r.normalizeRules()
var tmReTokenizer = new Tokenizer(r.getRules());

function last(array) {return array[array.length - 1]}

function tokenize(str) {
    return tmReTokenizer.getLineTokens(str).tokens;
}

function convertHexEscape(tokens) {
    var inChClass = false
    tokens.forEach(function(t) {
        if (t.type == "charclass")
            inChClass = true
        else if (t.type == "charclass.end")
            inChClass = false
        else if (t.type == "charType"){
            if (t.value == "\\h") {
                t.type = "text"
                t.value = inChClass ? "\\da-fA-F" : "[\\da-fA-F]"
            }
            else if (t.value == "\\H") {
                if (inChClass) {
                    console.warn("can't convert \\H in charclass")
                    return;
                }
                t.type = "text"
                t.value = "[^\\da-fA-F]"
            }
        }
    })
    return tokens
}

function convertNewLinesTo$(str) {
    var tokens = tokenize(str);
    for (var i = 0; i < tokens.length; i++) {
        var t= tokens[i]
        if (t.type == "char" && t.value == "\\n") {
            var p = tokens[i + 1] || {}
            if (p.type != "quantifier") {
                t.value="$"
                while (p.value == "\\n" || p.type == "quantifier") {
                    p.value = ""
                    p = tokens[++i + 1] || {}
                }
            } else if (/\?|\*|{,|{0,/.test(p.value)) {
                t.value = p.value=""
            } else
                p.value=""
        }
    }
    return toStr(tokens).replace(/[$]+/g, "$")
}

function toStr(tokens) { return tokens.map(function(x){return x.value}).join("")}

function convertCharacterTypes(str) {
    var tokens = tokenize(str);
    tokens = convertHexEscape(tokens);

    var warn = false
    tokens.forEach(function(t){
        if (t.type == "quantifier") {
            var val = t.value;
            if (val.slice(-1) == "+" && val.length > 1) {
                t.value = val.slice(0, -1)
                warn = val;
            }
        }
    })
    if (warn)
        console.log("converted possesive quantifier " + warn + " to *")
    return toStr(tokens);
}

function removeInlineFlags(str, rule) {
    var tokens = tokenize(str);
    var caseInsensitive = false
    tokens.forEach(function(t, i) {
        if (t.type == "group.start" && /[imsx]/.test(t.value)) {
            if (/i/.test(t.value))
                caseInsensitive = true
            t.value = t.value.replace(/[imsx\-]/g, "")
            var next = tokens[i + 1]
            if (next && next.type == "group.end") {
                t.value = next.value = ""
            }
        }
    })
    if (caseInsensitive && rule)
        rule.caseInsensitive = true
    return toStr(tokens)
}

function convertToNonCapturingGroups(str) {
    var tokens = tokenize(str);
    tokens.forEach(function(t, i) {
        if (t.type == "group.start" && t.value == "(")
            t.value += "?:"
    })
    return toStr(tokens)
}

function simplifyNonCapturingGroups(str) {
    var tokens = tokenize(str);
    var t = tokens[0]
    if (t.type == "group.start" && t.value == "(?:"
        && t.end == last(tokens)) {
        t.value = t.end.value = "";
    }
    var i = 0;
    function iter(f) {
        for (i = 0; i < tokens.length; i++)
            f(tokens[i])
    }
    function iterGroup(end, f) {
        for (var i1 = i + 1; i1 < tokens.length; i1++) {
            var t = tokens[i1]
            if (t == end)
                break;
            var index = f && f(t)
            if (index > i1)
                i1 = index
        }
        return i1
    }

    iter(function (t) {
        if (t.type == "group.start" && t.value == "(?:") {
            if (!t.end)
                return console.error("malformed regex: " + str);

            var canRemove = true
            var next = tokens[tokens.indexOf(t.end, i) + 1]
            if (next && next.type == "quantifier")
                return;
            iterGroup(t.end, function(t) {
                if (t.type == "alternation")
                    canRemove = false;
                else if (t.type == "group.start" && t.end)
                    return iterGroup(t.end)
            })
            if (canRemove)
                t.value = t.end.value = "";
        }
    })

    return toStr(tokens)
}

function removeLookBehinds(str) {
    var tokens = tokenize(str);
    var toRemove = null;
    tokens.forEach(function(t, i) {
        if (!toRemove && t.type == "group.start" && /</.test(t.value)) {
            toRemove = t.end
            toRemove.content = []
        }
        if (toRemove) {
            toRemove.content.push(t.value)
            t.value = ""
        }
        if (t == toRemove) {
            var c = toRemove.content.slice(1, -1).join("")
            if (/\^/.test(c))
                toRemove.value = "(?:" + c +")"

            toRemove = null
        }
    })
    return toStr(tokens)
}

function convertBeginEndBackrefs(rule) {
    if (!/\\\d/.test(rule.end))
        return
    var startTokens = tokenize(rule.begin)
    var endTokens = tokenize(rule.end)


    var groups = {}
    startTokens.forEach(function(t, i) {
        if (t.number && t.end && t.type == "group.start") {
            var endIndex = startTokens.indexOf(t.end, i + 1)
            var content = startTokens.slice(i+1, endIndex)
            groups[t.number] = toStr(content)
        }
    })

    endTokens.forEach(function(t) {
        if (t.type == "backRef") {
            var num = t.value.substr(1)
            if (groups[num])
                t.value = "(?:" + groups[num] + ")"
        }
    })

    rule.end = toStr(endTokens)

    console.warn("Begin-End-Backreference is detected", rule)
}

function checkForNamedCaptures(str) {
    var tokens = tokenize(str);
    tokens.forEach(function(t) {
        if (t.type == "group.start" && t.name)
            console.warn("named capture not implemented", str)
        if (t.type == "backRef")
            console.warn("backRef not implemented ", str)
    })
}

function fixGroups(captures, defaultName, regex) {
    var tokens = tokenize(regex);

    var opened = [], isStart = true, i = 0;
    function open() {
        var t = {value: "(", type: "group.start", isGroup: true}
        opened.push(t)
        tokens.splice(i++, 0, t)
    }
    function close() {
        var t = {value: ")", type: "group.start"}
        t.start = opened.pop()
        t.start.end = t;
        tokens.splice(i++, 0, t)
    }
    function tryOpen(){if (isStart) {open(); isStart = false}}
    function tryClose(){if (opened.length) close()}
    function skip(t) {
        var i1 = tokens.indexOf(t.end, i)
        if (i1 > i)
            i = i1
    }
    function lst(t) {return t[t.length - 1]}
    function iter(f) {
        for (i = 0; i < tokens.length; i++)
            f(tokens[i])
    }
    function iterGroup(end, f) {
        for (var i1 = i + 1; i1 < tokens.length; i1++) {
            var t = tokens[i1]
            if (t == end)
                break;
            f(t)
        }
    }
    function peek() { return tokens[i + 1] || {}}

    // groupify
    iter(function(t){
        if (t.type == "group.start") {
            tryClose()
            isStart = true
            if (!t.hasChildren || t.isSpecial)
                skip(t)
        } else if (t.type == "group.end") {
            isStart = true
            tryClose()
        } else if (t.type == "alternation") {
            isStart = true
            tryClose()
        } else if (t.type != "anchor" && t.type != "quantifier"){
            tryOpen()
        }
    })
    tryClose()

    // remove redundand groups
    var names = [defaultName]
    iter(function(t){
        if (t.type == "group.start" && !t.isSpecial) {
            var captureName = captures[t.number]

            if (!t.hasChildren) {
                t.tokenName = captureName || lst(names)
                skip(t)
            }  else {
                var hasCapture = false
                iterGroup(t.end, function(t1) {
                    if (t1.type == "group.start" && captures[t1.number])
                        hasCapture = true
                })
                if (hasCapture) {
                    t.value = "(?:"
                    if (captureName) {
                        names.push(captureName)
                        t.isTokenGroup = true
                    }
                } else {
                    t.tokenName = captureName || lst(names);
                    iterGroup(t.end, function(t1) {
                        if (t1.value == "(")
                            t1.value = "(?:"
                    })
                }
            }
        } else if (t.type == "group.end") {
            if (t.start.isTokenGroup)
                names.pop()
        }
    });

    // wrap capturing groups with quantifier
    iter(function(t){
        if (t.type == "group.end" && t.start.value == "(" && peek().type == "quantifier") {
            peek().value += ")"
            t.start.value += "(?:"
        }
    });

    var names = []
    tokens.forEach(function(t) {
        if (t.value == "(" || t.value == "((?:" )
            t.tokenName && names.push(t.tokenName)
    })
    return {
        names: names,
        regex: toStr(tokens)
    };
}

/***** converter */

function logDebug(string, obj) {
    console.log(string, obj);
}


// tmLanguage processor

// for tracking token states
var states = {start: []};
var stateName = "start";

function processRules(rules){
    if (rules.patterns)
        states.start = processPatterns(rules.patterns);
    if (rules.repository)
        processRepository(rules.repository);
    return states;
}
function processRepository(r) {
    for (var key in r) {
        var p = r[key];
        if (p.begin)
            var stateObj = [processPattern(r[key])];
        else if (p.patterns && !p.repository)
            var stateObj = processPatterns(p.patterns);
        else
            var stateObj = [processPattern(r[key])];

        if (stateObj)
            states["#" + key] = stateObj;
    }
}
function processPatterns(pl) {
    return pl.map(processPattern);
}
function processPattern(p) {
    if (p.end == "(?!\\G)" && p.patterns && p.patterns.length == 1) {
        var rule = processPattern(p.patterns[0]);
    }
    else if (p.begin != null && p.end != null) {
        convertBeginEndBackrefs(p);

        var rule = simpleRule(p.begin, p.name, p.beginCaptures || p.captures)

        var next = processPatterns(p.patterns || []);
        var endRule = simpleRule(p.end, p.name, p.endCaptures || p.captures);
        endRule.next = "pop";
        if (p.applyEndPatternLast)
            next.push(endRule);
        else
            next.unshift(endRule);

        if (p.name || p.contentName)
            next.push({defaultToken: p.name || p.contentName});

        rule.push = next;

        rule = removeIncludeSelf(rule)
    }
    else if (p.match) {
        var rule = simpleRule(p.match, p.name, p.captures)
    }
    else if (p.include) {
        var rule =  {include: p.include};
    }
    else {
        var rule =  {todo: p};
    }

    if (p.comment)
        rule.comment = (rule.comment || "") +  p.comment;

    if (p.repository)
        processRepository(p.repository);
    return rule;
}
function simpleRule(regex, name, captures) {
    name = name || "text";
    var rule = {token: "", regex: ""};

    var origRegex = regex
    regex = transformRegExp(origRegex, rule);
    if (captures) {
        var tokenArray = [];
        Object.keys(captures).forEach(function(x){
            tokenArray[x] = captures[x] && captures[x].name;
        });

        if (tokenArray.length == 1) {
            name = tokenArray[0];
        } else {
            var fixed = fixGroups(tokenArray, name, regex)
            name = fixed.names;
            regex = fixed.regex;
            if (name.length == 1)
                name = name[0]
        }
    }

    if (typeof name == "string")
        regex = convertToNonCapturingGroups(regex)

    regex = simplifyNonCapturingGroups(regex)

    try {new RegExp(regex);} catch(e) {
        rule.TODO = "FIXME: regexp doesn't have js equivalent";
        rule.originalRegex = origRegex

        // lookbehinds are mostly used to force ordering
        // regex = removeLookBehinds(regex);
    }
    rule.token = name;
    rule.regex = regex;
    return rule;
}

function removeIncludeSelf(rule) {
    if (!rule.push)
        return rule
    var hasSelfInclude = false
    var escapeRule = null
    var complexSelfInclude = false
    rule.push.forEach(function(sub) {
        if (sub.include == "$self") {
            hasSelfInclude = true
        } else if (sub.defaultToken) {
            return
        } else if (sub.next == "pop") {
            escapeRule = sub
        } else
            complexSelfInclude = true
    })

    if (hasSelfInclude) {
        console.warn("can't convert include $self");
        return {todo: rule}
        if (complexSelfInclude) {
            console.warn("can't convert include $self");
            rule.toDo = "include $self not fully supported"
            return rule
        }
        console.warn("include $self not fully supported");
        delete rule.push
        delete escapeRule.next
        rule.includeSelf = true;
        escapeRule.includeSelf = true;
        return [rule, escapeRule]
    }
    return rule
}

// regex transformation

function removeXFlag(str) {
    var m = (str||"").match(/^\(\?([imsx]+)([:)])/);
    if (!m || m[1].indexOf("x") == -1)
        return str;
    flag = m[1].replace(/x/g, "");
    
    str = str.substr(m[0].length);
    if (m[2] == ":" && str.slice(-1) == ")")
        str = str.slice(4, -1);

    str = str.replace(/\\.|\[([^\]\\]|\\.)*?\]|\s+|(?:#[^\n]*)/g, function(s) {
        if (s[0] == "[")
            return s;
        if (s[0] == "\\")
            return /[#\s]/.test(s[1]) ? s[1] : s;
        return "";
    });

    if (flag)
        str = "(?" + flag + ")" + str;
    return str;
}

function transformRegExp(str, rule) {
    str = removeXFlag(str);
    str = convertNewLinesTo$(str)

    str = removeInlineFlags(str, rule)

    str = str.replace(/(\\[xu]){([a-fA-F\d]+)}/g, '$1$2');

    str = convertCharacterTypes(str, rule)

    checkForNamedCaptures(str)

    return str;
}

//
function extractPatterns(tmRules) {
    return  processRules(tmRules);
}

function test(fileName) {
    console.log("testing highlighter");
    try {
        var module = require(fileName);
        var Mode = module[Object.keys(module)[0]];
        var mode = new Mode()
        mode.getLineTokens = tmReTokenizer.getLineTokens
        mode.$tokenizer.getLineTokens("hello world")
    } catch(e) {
        console.log(e);
    }
}

function guessComment(patterns) {
    var comment = {}
    for (var i in patterns) {
        var state = patterns[i];
        state.forEach(function(r) {
            if (typeof r.token == "string") {
                if (/\bcomment\b/.test(r.token)) {
                    comment.line = r.regex
                }
            }
        })
    }

    return comment
}

// cli stuff
var modeTemplate = fs.readFileSync(__dirname + "/mode.tmpl.js", "utf8");
var modeHighlightTemplate = fs.readFileSync(__dirname + "/mode_highlight_rules.tmpl.js", "utf8");

function fetchAndConvert(name) {
    console.log("Converting " + name)
    if (/^http/.test(name)) {
        if (/:\/\/github.com/.test(name)) {
            name = name.replace(/\/blob\//, "/").replace("github.com", "raw.github.com")
        }
        return lib.download(name, function(data) {
            convertTmLanguage(name, data)
        })
    }
    var path = /^(\/|\w:)/.test(name) ? name : process.cwd() + "/" + name
    var tmLanguage = fs.readFileSync(path, "utf8");
    convertTmLanguage(name, tmLanguage)
}


function convertTmLanguage(name, tmLanguage) {
    parseLanguage(tmLanguage, function(language) {
        var highlighterFilename = lib.snakeCase(language.name).replace(/[^\w]/g, "");
        var languageNameSanitized = lib.camelCase(language.name).replace(/[^\w]/g, "");

        var highlighterFile = pathlib.normalize(lib.AceRoot + "ace/mode/" + highlighterFilename + "_highlight_rules.js");
        var modeFile = pathlib.normalize(lib.AceRoot + "ace/mode/" + highlighterFilename + ".js");

        if (devMode) {
            console.log(util.inspect(language.patterns, false, 4));
            console.log(util.inspect(language.repository, false, 4));
        }

        var patterns = extractPatterns(language);
        var uuid = language.uuid
        delete language.uuid
        delete language.patterns
        delete language.repository

        var comment = guessComment(patterns);
        var languageMode = lib.fillTemplate(modeTemplate, {
            language: languageNameSanitized,
            languageHighlightFilename: highlighterFilename,
            lineCommentStart: JSON.stringify(comment.line || "//"),
            blockCommentStart: JSON.stringify(comment.start || "/*"),
            blockCommentEnd: JSON.stringify(comment.end || "*/")
        });


        var languageHighlightRules = lib.fillTemplate(modeHighlightTemplate, {
            language: languageNameSanitized,
            languageTokens: lib.formatJSON(patterns, "    ").trim(),
            uuid: language.uuid,
            name: name,
            metaData: lib.formatJSON(language, "    ").trim()
        });

        if (devMode) {
            console.log(languageMode);
            console.log(languageHighlightRules);
            console.log("Not writing, 'cause we're in dev mode, baby.");
        }
        else {
            fs.writeFileSync(highlighterFile, languageHighlightRules);
            fs.writeFileSync(modeFile, languageMode);
            console.log("created file " + highlighterFile);
            test(modeFile);
        }
    });
}

var args = process.argv.splice(2);
var tmLanguageFile  = args[0];
var devMode         = args[1];
if (tmLanguageFile === undefined) {
    console.error("Please pass in a language file via the command line.");
    process.exit(1);
}
fetchAndConvert(tmLanguageFile);


