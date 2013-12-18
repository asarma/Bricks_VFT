module.exports = function (vfs, register) {
	//@todo hook into vfs and notify client of changes

    register(null, {
    	connect: function(callback){
    		var stream;
    		callback(null, stream);
    	},
    	remove: function (a, b, callback) {
			callback();
		}
	});
};	