/**
 * Inference-based JavaScript jump to dejufinition.
 *
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {

var baseLanguageHandler = require('plugins/c9.ide.language/base_handler');
var handler = module.exports = Object.create(baseLanguageHandler);
var infer = require("./infer");
var path = require("./path");
var astUpdater = require("./ast_updater");

handler.handlesLanguage = function(language) {
    return language === 'javascript';
};

handler.jumpToDefinition = function(doc, fullAst, pos, currentNode, callback) {
    if (!fullAst || !currentNode)
        return callback();
    
    var results = [];
    var basePath = path.getBasePath(handler.path, handler.workspaceDir);
    var filePath = path.canonicalizePath(handler.path, basePath);
    
    astUpdater.updateOrReanalyze(doc, fullAst, filePath, basePath, pos, function(fullAst, currentNode) {
        currentNode.rewrite(
            'PropAccess(o, p)', function(b, node) {
                var values = infer.inferValues(b.o);
                values.forEach(function(v) {
                    jumpToProperty(v, b.p.value, results);
                });
            },
            'Var(v)', function(b, node) {
                jumpToVar(node, results);
            },
            'Call(Var("require"), [String(_)])', function(b, node) {
                jumpToRequire(node, results);
            },
            'Var("require")', function(b, node) {
                if (node.parent &&
                    node.parent.isMatch('Call(Var("require"), [_])'))
                jumpToRequire(node.parent, results);
            },
            'String(_)', function(b, node) {
                if (node.parent && node.parent.parent &&
                    node.parent.parent.isMatch('Call(Var("require"), [_])'))
                jumpToRequire(node.parent.parent, results);
            }
        );
    });
        
    callback(results);
};

var jumpToRequire = function(node, results) {
    var values = infer.inferValues(node);
    values.forEach(function(v) {
        if (v.path)
            results.push({
                path: v.path,
                row: v.row,
                icon: "package"
            });
    });
};

var jumpToProperty = module.exports.jumpToProperty = function(value, property, results) {
    var prop = value.properties && value.properties["_" + property];
    if (prop && prop[0])
        prop = prop[0];
    if (!prop || (!value.path && !prop.path && !prop.row))
        return;
    results.push({
        row: prop.row,
        column: prop.column,
        path: prop.path || value.path,
        icon: "property"
    });
};

var jumpToVar = function(node, results) {
    var values = infer.inferValues(node);
    values.forEach(function(v) {
        if (!v.path && !v.row)
            return;
        results.push({
            row: v.row,
            path: v.path,
            icon: "property"
        });
    });
};

});

