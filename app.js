const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const cors = require('cors');
const { sessionStore } = require('./database'); 
const contactRoute = require("./routes/Contact");
const userRoute = require("./routes/user");
const leaveRoute = require("./routes/Leave");
const opportunityRoute = require("./routes/opportunity");
const calendarRoute = require("./routes/Calendar");
const EmployesRoute = require("./routes/employes");
const ErrorHandler = require("./middleware/error");
const path = require('path');


const app = express();

app.use(express.json());


//Allows frontend and backend to connect
app.use(cors({
  origin: process.env.Frontend_url,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Cookie', 'Set-Cookie'],
  credentials: true
}));

//for cookies
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
app.use(bodyParser.json({ limit: '50mb' }));

//to save sessions in the db for data to not leak
app.use(session({
  key: 'session_cookie_name',
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true, // Prevents access from JavaScript
    secure: true, // Ensures secure in production
    sameSite: "None",
    path: '/', // Prevents CSRF
    maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
  },
}));


// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'build')));

// Handle all routes and serve your main index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});


//all the api routes
app.use("/api/user", userRoute);
app.use("/api/Contact", contactRoute);
app.use("/api/Leave", leaveRoute);
app.use("/api/Opportunity", opportunityRoute);
app.use("/api/Holiday", calendarRoute);
app.use("/api/Employes", EmployesRoute);

// Error handling middleware
app.use(ErrorHandler);

module.exports = app;
