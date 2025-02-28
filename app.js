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
const helmet = require('helmet');
const path = require('path');


const app = express();

app.use(express.json());

app.options('*', cors());

//Allows frontend and backend to connect
app.use(cors({
  origin: process.env.Frontend_url,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: true
}));

//for cookies
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
app.use(bodyParser.json({ limit: '50mb' }));

//to save sessions in the db for data to not leak
app.use(session({
  key: 'session_cookie_name',
  secret: 'your-secret-key',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
  },
}));

//all the security parameters
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", process.env.Frontend_url],
        fontSrc: ["'self'", "https://fonts.googleapis.com"],
        frameAncestors: ["'none'"], // Prevents clickjacking by disallowing embedding
        objectSrc: ["'none'"], // Blocks plugins and objects
        baseUri: ["'self'"], // Prevents attackers from changing the base URL
        formAction: ["'self'"], // Only allows form submissions to your origin
        upgradeInsecureRequests: [], // Forces HTTP to HTTPS
        blockAllMixedContent: [], // Blocks mixed HTTP/HTTPS content
        reportUri: ["/csp-violation-report-endpoint"], // Logs CSP violations
      },
    },
  })
);

app.use(
  helmet({
    dnsPrefetchControl: true,
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    ieNoOpen: true,
    noSniff: true,
    xssFilter: true,
  })
);

app.use(helmet.hidePoweredBy()); // Hides "X-Powered-By" header
app.use(helmet.noSniff());      // Prevents browsers from sniffing MIME types (X-Content-Type-Options: nosniff)
app.use(helmet.frameguard({ action: 'deny' })); // Prevents clickjacking (X-Frame-Options)
app.use(helmet.xssFilter()); 

app.disable('x-powered-by');

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
