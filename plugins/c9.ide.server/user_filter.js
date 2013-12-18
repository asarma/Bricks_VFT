"use strict";

module.exports = function(user, project) {
    if (user.alpha) return true;
    if (project.contents == "logicblox") return true;
    
    return true;
}
