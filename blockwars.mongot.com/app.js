'use strict';
const http = require('http');
const express = require('express');
const sessions = require('client-sessions');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const flash = require('express-flash');
const middleware = require('../middleware');
const config = require('../config.json');
const app = express();

/**
 * Connect to mongoDB
 */
mongoose.connect(config.PROD_DB)
  .catch(err => console.log(err));
//mongoose.connect(config.PROD_DB);

/**
 * Tell express that we are using pug as view templates
 */
app.set('view engine', 'pug');

/**
 * Use flash messages
 */
app.use(flash());

/**
 * If true the html will not be minified.
 * only uses when developing
 */
//app.locals.pretty = true;

const port = process.env.PORT || 5200;
let server = http.createServer(app).listen(port);

/**
 * Makes it possible to get static files from view
 */
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

/**
 * Service worker
 */
//app.use(require('./serviceworker'));

/**
 * Session rules
 */
//app.set('trust proxy', true);
app.use(
  sessions({
      cookieName: "session",
      secret: "345gyu345g3785g785g578g563gf25673f56734f56723", // Random string as secret
      httpOnly: true, // not letting javascript access cookies
      // ephemeral: true, // delete cookies when the browser is closed
      //secure: true, // only use cookies over https
      duration: 3600 * 1000 * 24 * 365, // cookie expires after one year
      activeDuration: 3600 * 1000 * 24 * 30, // cookie expire after 30 days if user is not active
      cookie: {
          sameSite: 'strict',
          //     maxAge: 3600 * 1000 * 24 * 365,
          //     httpOnly: true,
          //     domain: 'mongot.com'
      }
  })
);
/**
 * Middleware, Refresh session on page loads
 */
app.use(middleware.cookieAuth);

/**
 * Routes
 */
app.use(require('./routes/main'));

// Handle 404
app.use(function (req, res) {
  res.status(400);
  res.render('404');
});

// Handle 500
app.use(function (error, req, res, next) {
  res.status(500);
  res.send('500: Internal Server Error - ' + error);
});

require('./game/server.js').initialize(server);