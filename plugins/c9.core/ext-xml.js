register:
if (!this.model.data)
                    this.model.load("<plugins />");
        
                if (!this.model.queryNode("plugin[@path=" + util.escapeXpathString(path) + "]"))
                    this.model.appendXml(apf.n("<plugin/>")
                        .attr("name", oExtension.name || "")
                        .attr("path", path)
                        .attr("dev", oExtension.dev || "")
                        .attr("enabled", "1")
                        .attr("userext", "0").node());
                else
                    this.model.setQueryValue("plugin[@path=" + util.escapeXpathString(path) + "]/@enabled", 1);
                    
var initTime = parseInt(this.model.queryValue("plugin[@path=" + escapedPath + "]/@init") || 0);
                this.model.queryNode("plugin[@path=" + escapedPath + "]").setAttribute("hook", Number(new Date() - dt) - initTime);
unregister:
this.model.setQueryValue("plugin[@path=" + util.escapeXpathString(plugin.path) + "]/@enabled", 0);

enable:disable:
            enableExt : function(path) {
                var ext = require(path);
                ext.enable();
                this.model.setQueryValue("plugin[@path=" + util.escapeXpathString(path) + "]/@enabled", 1);
            },
        
            disableExt : function(path) {
                var ext = require(path);
                ext.disable();
                this.model.setQueryValue("plugin[@path=" + util.escapeXpathString(path) + "]/@enabled", 0);
            },
