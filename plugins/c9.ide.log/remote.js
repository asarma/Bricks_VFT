/**
 * Expose API
 */
module.exports = function (vfs, register) {
    var Dgram   = require("dgram");
    var client  = Dgram.createSocket("udp4");
    var Os      = require("os");
    var localIp = getLocalIp();
    var maxudp  = 7000;
    var localIpCached;
      
    stats = metricUDP;

    /**
     * Log stats to the Cloud9 Metric server.
     * @param {String} path     TODO: The path from which the request is coming?
     */
    function stats(path) {
        return function (msg, req) {
            var json = {
                level   : "info",
                ts      : Date.now(),
                source  : path,
                msg     : msg,
                address : localIp
            };
    
            if (req && req.connection) {
                json.req = {
                    ip      : req.connection.remoteAddress,
                    ua      : req.headers["user-agent"],
                    cookie  : req.cookies || req.headers.cookie,
                    url     : req.url,
                    method  : req.method
                };
    
                if (req.session) {
                    json.req.uid       = req.session.uid;
                    json.req.sessionID = req.sessionID;
                }
            }
            stats(json);
        };
    }

    /**
     * Sends data to Cloud9 Metric server, splitting it up into chunks if larger than UDP max.
     * 
     * @param {JSON}     data           JSON data to send to the Metric server.
     * @param {Function} callback       Called when the data is sent.
     * @param {Error}    callback.err   The error information returned.
     * @param {String}   callback.data  Optional message about the status.   
     * @param {Number}   statsPort      Port to send the data over.
     * @param {String}   statsHost      Hostname to send the data to.
     */
    function metricUDP(data, callback, statsPort, statsHost){
        var json, buf;
        try {
            json = JSON.stringify(data);
        }
        catch(e) {
            try {
                buf = new Buffer(JSON.stringify({
                    level : "logfail", 
                    msg   : e.toString()
                }));
                client.send(buf, 0, buf.length, statsPort, statsHost);
                return;
            } catch(ex) {
                console.log("Exception in logging " + e, ex);
                return callback("Parsing the logging data failed");
            }
        }
        
        if (json.length > maxudp) {
            var id = parseInt(Math.random() * 65535, 10) * 1000;
            for (var o = 0, i = 0; o < json.length; o += maxudp, i++) {
                buf = new Buffer(JSON.stringify({
                    level : "chunk", 
                    seq   : id + i, 
                    msg   : json.slice(o, o + maxudp)
                }));
                client.send(buf, 0, buf.length, statsPort, statsHost);
            }
        } else {
            buf = new Buffer(json);
            client.send(buf, 0, buf.length, statsPort, statsHost, 
              function(err, bytes) {
                if (err) 
                    return callback(err);
            });
        }
        
        callback(null, "Data sent to host " + statsHost);
    }

    /**
     * Get the local IP address.
     * @return {String} The local IP address.
     */
    function getLocalIp() {
        if (localIpCached)
            return localIpCached;
    
        var interfaces = Os.networkInterfaces 
            ? Os.networkInterfaces() 
            : Os.getNetworkInterfaces();
            
        var device, addresses, address, i, l;
        for (device in interfaces) {
            if (!interfaces.hasOwnProperty(device))
                continue;
                
            // we only want to know stuff about devices called 'en1' or 'eth0'
            if (!/^e[a-z]*[0-9]+$/.test(device))
                continue;
    
            addresses = interfaces[device];
            for (i = 0, l = addresses.length; i < l; ++i) {
                address = addresses[i];
                
                if (address.family === "IPv4" && !address.internal) {
                    localIpCached = address.address;
                    return localIpCached;
                }
            }
        }
    }
     
    register(null, {
        log : metricUDP
    });
};