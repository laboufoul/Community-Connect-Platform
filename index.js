const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const session = require('express-session');
const bodyParser = require('body-parser');
const flash = require('connect-flash');
const bcrypt = require('bcryptjs');
const mongoDBStore = require('connect-mongodb-session')(session);
const xlsxFile = require('read-excel-file/node');
const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const http = require('http');

const authRoute = require('./routes/auth');
const loginRoutes = require('./routes/loginRoute');
const loginSuccessRoutes = require('./routes/loginSucc');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const User = require('./model/User');
const Group = require('./model/Group');
const errorRoutes = require('./routes/errors');

dotenv.config();

// MONGO DB URI
const MONGODB_URI = process.env.MONGO_DB;

const app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server);

app.set('socketio', io);

const groups = [];
const users = [];
let allRecords = 0;

// Session storage in mongodb
const store = new mongoDBStore({
	uri: MONGODB_URI,
	collection: 'sessions',
});

// Session configuration
app.use(
	session({
		secret: process.env.SESSION_SECRET_KEY,
		saveUninitialized: false,
		resave: false,
		store: store,
	})
);

app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));
app.use(express.json());

app.set('view engine', '.ejs');
app.use('/style', express.static('style'));
app.use('/assets', express.static('assets'));
app.use('/lib', express.static('lib'));
app.use('/js', express.static('js'));
app.use('/uploads', express.static('uploads'));

app.use(flash());

//configure multer
AWS.config.update({
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	region: process.env.AWS_REGION,
});
const s3 = new AWS.S3();
var upload = multer({
	storage: multerS3({
		s3: s3,
		bucket: process.env.AWS_BUCKET_NAME,
		acl: 'public-read',
		key: function (req, file, cb) {
			if (file !== undefined) {
				cb(null, Date.now() + path.extname(file.originalname));
			}
		},
	}),
});

app.use(upload.single('post-image'));

// Setting up user in app session
app.use((req, res, next) => {
	if (req.session.user) {
		User.findById(req.session.user._id)
			.then((user) => {
				if (!user) {
					next();
				} else {
					req.user = user;
					next();
				}
			})
			.catch((err) => {
				next(new Error(err));
			});
	} else {
		next();
	}
});

// Route setup
app.use('/', authRoute);
app.use('/login', loginRoutes);
app.use('/login_s', loginSuccessRoutes);
app.use('/users', userRoutes);
app.use('/admin', adminRoutes);
app.use(errorRoutes);

app.use((err, req, res, next) => {
	console.log(err);
	res.render('./errors/500.ejs', {
		pageTitle: 'Something went wrong',
	});
});

let port = process.env.PORT || 5000;

// Seed DB with xlsx data
xlsxFile('./Groups in Community Connect.xlsx').then((rows) => {
	let countIndex = 1;
	for (i in rows) {
		if (i == 0) continue;
		countIndex++;
		users.push({
			name: rows[i][1],
			user_id: rows[i][2],
			EmailID: rows[i][3],
			group: rows[i][4],
			age: rows[i][5],
			gender: rows[i][6],
		});
		let userGroup = rows[i][4].split(',');
		userGroup.forEach((g) => {
			let isAlreadyExist = groups.find((gr) => gr == g);
			if (!isAlreadyExist) groups.push(g.trim());
		});
		if (countIndex == rows.length) {
			allRecords = parseInt(rows.length) - 1;
			all();
		}
	}
});

function all() {
	createGroups();
}

server.listen(port, () => {
	console.log(`Listening at port ${port}`);
	mongoose
		.connect(MONGODB_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		})
		.then(async () => {
			console.log('Connected to DB');
			/* New admin creation */
			let isAdminExist = await User.findOne({ isAdmin: true });
			if (!isAdminExist) {
				const hashPassword = await bcrypt.hash('123456', 12);
				new User({
					EmailID: 'admin@gmail.com',
					password: hashPassword,
					isAdmin: true,
				})
					.save()
					.then(() => {
						console.log('Admin Created');
					})
					.catch((err) => console.log(err));
			}
		})
		.catch((err) => {
			console.log(err);
		});
});

var nsp = io.of('/feeds');
global.nsp = nsp;

// Create user groups
const createGroups = () => {
	let groupIndex = 0;
	groups.map(async (group, index, array) => {
		let isGroupExist = await Group.findOne({ group_name: group });
		if (!isGroupExist) {
			await new Group({
				group_id: Math.random().toString(32).substring(2),
				group_name: group,
				group_desc: 'Lorem Ipsum dolar sit amet',
			}).save();
		}
		groupIndex++;
		if (groupIndex === array.length) {
			createUsers();
		}
	});
};

// Create users
const createUsers = () => {
	users.map(async (user, index, array) => {
		let userGroups = user.group;
		userGroups = userGroups.split(',');
		let foundGroup;
		let arrGr = [];
		let userGroupIndex = 0;

		userGroups.forEach(async (userGroup, index, array) => {
			foundGroup = await Group.findOne({ group_name: userGroup.trim() });
			if (foundGroup) {
				arrGr.push(foundGroup.group_id);
				userGroupIndex++;
				if (array.length == userGroupIndex) isUserDone(user, arrGr);
			}
		});
	});
};

// Check if user already exist in DB
const isUserDone = async (user, gr) => {
	let isUserAlreadyExist = await User.findOne({ user_id: user.user_id });
	if (!isUserAlreadyExist) {
		await new User({
			name: user.name,
			user_id: user.user_id,
			EmailID: user.EmailID,
			isAdmin: false,
			group_id: gr,
		}).save();
	}
};
