const mongoose = require('mongoose');

// Logtimes model
let schema = mongoose.Schema;

let loggerSchema = new schema({
	user: {
		type: mongoose.Schema.Types.Mixed,
	},
	loggedInAt: {
		type: Date,
	},
	loggedOutAt: {
		type: Date,
	},
});

module.exports = mongoose.model('LogTime', loggerSchema);
