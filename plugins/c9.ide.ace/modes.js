/**
 * Code Editor for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function(require, exports, module) {

var modesByName = require("ace/ext/modelist").modesByName;

var primaryModes = ["c_cpp","clojure","coffee","csharp","css","dart","golang",
    "html","jade","java","javascript","json","less","lua","perl","php","python",
    "ruby","scala","scss","sh","stylus","sql","text","typescript","xml","xquery",
    "yaml"];

var hiddenModes = ["c9search", "text", "snippets"];
var fileExtensions = Object.create(null);
var modesByCaption = Object.create(null);
var customExtensions = Object.create(null);
Object.keys(modesByName).forEach(function(name) {
    var mode = modesByName[name];
    modesByCaption[mode.caption] = mode;
 
    mode.id = name;
    if (primaryModes.indexOf(mode.name) != -1)
        mode.order = 100000;
    else if (hiddenModes.indexOf(mode.name) != -1)
        mode.order = -1;
    else
        mode.order = 0;

    mode.extensions.split("|").forEach(function(ext) {
        fileExtensions[ext] = name;
    });
});


module.exports = {
    byName: modesByName,
    extensions: fileExtensions,
    customExtensions: customExtensions,
    byCaption: modesByCaption
}
});