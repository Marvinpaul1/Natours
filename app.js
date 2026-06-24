/* eslint-disable */
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('mongo-sanitize');
const xss = require('xss');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const compression = require('compression');

const AppError = require('./utils/appErr');
const globalErrorHandler = require('./controllers/errController');
const tourRouter = require('./routes/tourRoutes');
const userRouter = require('./routes/userRoutes');
const reviewRouter = require('./routes/reviewRoutes');
const bookingRouter = require('./routes/bookingRoutes');
const viewRouter = require('./routes/viewRoutes');

const app = express();

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// 1) GLOBAL MIDDLEWARES
// Serving static files
app.use(express.static(path.join(__dirname, 'public')));

// Set security HTTP headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ' https://unpkg.com'],
        styleSrc: ["'self'", "'unsafe-inline'", ' https://unpkg.com'],
        // This line allow the parcel webs0cket connection
        connectSrc: [
          "'self'",
          'ws://127.0.0.1:1234/',
          'https://*.openstreetmap.org',
          'https://checkout.paystack.com',
        ],
        // This line allow images from openStreetMap
        imgSrc: [
          "'self'",
          'data:',
          'https://unpkg.com',
          'https://*.openstreetmap.org',
        ],

        // This line stops Helmet from forcing Http to Https locally
        upgradeInsecureRequests: null,
      },
    },
  }),
);

// Development logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Limit requests from same API
const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: 'Too many requests from this IP, please try again in an hour!',
});
app.use('/api', limiter);

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use((req, res, next) => {
  // 1) Sanitize against NoSql query injection
  const cleanBody = mongoSanitize(req.body);
  const cleanQuery = mongoSanitize(req.query);
  const cleanParams = mongoSanitize(req.params);

  // 2) Sanitize against XSS (convert object to string, clean them and parse them back if needed)
  if (req.body) req.body = JSON.parse(xss(JSON.stringify(cleanBody)));
  if (req.query) req.query = JSON.parse(xss(JSON.stringify(cleanQuery)));
  if (req.params) req.params = JSON.parse(xss(JSON.stringify(cleanParams)));

  next();
});

// Prevent parameter pollution
app.use(
  hpp({
    whitelist: [
      'duration',
      'ratingsQuantity',
      'ratingsAverage',
      'maxGroupSize',
      'difficulty',
      'price',
    ],
  }),
);

app.use(compression());

// Test middleware
app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();

  next();
});

// 3) ROUTES
app.use('/api/v1/tours', tourRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/reviews', reviewRouter);
app.use('/api/v1/bookings', bookingRouter);
app.use('/', viewRouter);

app.all(/('*')/, (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
