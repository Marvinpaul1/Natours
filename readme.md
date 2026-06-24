# 🌍 Natours — Learning Documentation

> A personal learning journal for building the **Natours** application from Jonas Schmedtmann's _Node.js, Express, MongoDB & More: The Complete Bootcamp_ on Udemy.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Core Concepts Learned](#core-concepts-learned)
   - [Express Fundamentals](#1-express-fundamentals)
   - [MongoDB & Mongoose](#2-mongodb--mongoose)
   - [Authentication & Security](#3-authentication--security)
   - [Error Handling](#4-error-handling)
   - [Advanced Features](#5-advanced-features)
   - [Server-Side Rendering with Pug](#6-server-side-rendering-with-pug)
   - [Payments with Stripe/Paystack](#7-payments)
5. [API Reference](#api-reference)
6. [Key Bugs & Fixes](#key-bugs--fixes)
7. [Lessons Learned](#lessons-learned)
8. [Resources](#resources)

---

## Project Overview

**Natours** is a tour booking web application. Users can browse tours, read and write reviews, book tours, and manage their profiles. It is built with a REST API backend and a server-side rendered frontend using the MVC (Model-View-Controller) architecture.

### What You Build

| Feature        | Description                                                    |
| -------------- | -------------------------------------------------------------- |
| REST API       | Full CRUD for tours, users, reviews, and bookings              |
| Authentication | JWT-based login, signup, password reset via email              |
| Authorization  | Role-based access (user, guide, lead-guide, admin)             |
| Reviews        | Nested routes, virtual populate, aggregation pipeline          |
| Bookings       | Stripe/Paystack payment integration                            |
| Frontend       | Server-side rendered pages with Pug templates                  |
| Security       | Rate limiting, data sanitization, HTTP headers, XSS protection |
| File Uploads   | User photo upload and image processing with Multer & Sharp     |

---

## Tech Stack

```
Backend     Node.js + Express.js
Database    MongoDB + Mongoose ODM
Templating  Pug (Jade)
Auth        JSON Web Tokens (JWT) + bcryptjs
Email       Nodemailer (Mailtrap for dev, Gmail for prod)
Payments    Paystack (local alternative)
Files       Multer (upload) + Sharp (image processing)
Security    helmet, express-rate-limit, express-mongo-sanitize, xss-clean, hpp
Bundler     Parcel (frontend JS bundling)
```

---

## Project Structure

```
natours/
├── controllers/
│   ├── authController.js       # Signup, login, protect, restrict
│   ├── tourController.js       # Tour CRUD + file upload
│   ├── userController.js       # User CRUD + photo update
│   ├── reviewController.js     # Review CRUD
│   ├── bookingController.js    # Checkout session + webhook
│   ├── viewsController.js      # Pug page rendering
│   └── errorController.js      # Global error handler
│
├── models/
│   ├── tourModel.js            # Tour schema + middleware + statics
│   ├── userModel.js            # User schema + password hashing
│   ├── reviewModel.js          # Review schema + virtual populate
│   └── bookingModel.js         # Booking schema
│
├── routes/
│   ├── tourRoutes.js
│   ├── userRoutes.js
│   ├── reviewRoutes.js
│   ├── bookingRoutes.js
│   └── viewRoutes.js
│
├── views/                      # Pug templates
│   ├── base.pug
│   ├── overview.pug
│   ├── tour.pug
│   ├── login.pug
│   ├── account.pug
│   ├── myTours.pug
│   └── _reviewCard.pug
│
├── public/                     # Static assets
│   ├── css/
│   ├── img/
│   └── js/
│       ├── index.js            # Parcel entry point
│       ├── mapbox.js
│       ├── login.js
│       ├── updateSettings.js
│       └── stripe.js / paystack.js
│
├── utils/
│   ├── appError.js             # Custom AppError class
│   ├── catchAsync.js           # Async error wrapper
│   ├── apiFeatures.js          # Filter, sort, paginate, fields
│   └── email.js                # Email service
│
├── app.js                      # Express app setup
├── server.js                   # Server entry point
└── config.env                  # Environment variables (never commit!)
```

---

## Core Concepts Learned

### 1. Express Fundamentals

#### Middleware Pipeline

Every request in Express flows through a pipeline of middleware functions. Order matters.

```js
// app.js
app.use(express.json()); // Parse JSON body
app.use(cookieParser()); // Parse cookies (needed for JWT from cookies)
app.use(express.static('public')); // Serve static files

// Routes come AFTER body parsers but BEFORE the global error handler
app.use('/api/v1/tours', tourRouter);
app.use('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl}`, 404));
});

app.use(globalErrorHandler); // Always LAST
```

**Key insight:** If you forget `cookieParser()`, your `req.cookies` will be `undefined` and JWT auth from cookies will silently fail.

#### Router Merging (Nested Routes)

Reviews belong to tours. Use `mergeParams` to access the tour ID from within the review router.

```js
// tourRoutes.js
const reviewRouter = require('./reviewRoutes');
router.use('/:tourId/reviews', reviewRouter);

// reviewRoutes.js
const router = express.Router({ mergeParams: true }); // ← critical
router
  .route('/')
  .get(getAllReviews)
  .post(protect, restrictTo('user'), createReview);
```

---

### 2. MongoDB & Mongoose

#### Schema Design Patterns

**Embedding vs Referencing** — Natours uses referencing for users and tours, but embedding for tour locations and start dates.

```js
// Tour model — embedded documents (locations, guides as references)
const tourSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'A tour must have a name'],
    unique: true,
    trim: true,
  },
  guides: [{ type: mongoose.Schema.ObjectId, ref: 'User' }], // referencing
  locations: [
    // embedding
    {
      type: { type: String, default: 'Point', enum: ['Point'] },
      coordinates: [Number],
      address: String,
      description: String,
      day: Number,
    },
  ],
});
```

#### Virtual Populate

Load reviews on a tour without persisting the array in the database.

```js
// tourModel.js
tourSchema.virtual('reviews', {
  ref: 'Review',
  foreignField: 'tour', // field in Review model pointing to Tour
  localField: '_id', // _id of this Tour
});

// In controller, use .populate('reviews') to load them
```

#### Aggregation Pipeline

Calculate average ratings whenever a review is created or deleted.

```js
// reviewModel.js
reviewSchema.statics.calcAverageRatings = async function (tourId) {
  const stats = await this.aggregate([
    { $match: { tour: tourId } },
    {
      $group: {
        _id: '$tour',
        nRating: { $sum: 1 },
        avgRating: { $avg: '$rating' },
      },
    },
  ]);
  if (stats.length > 0) {
    await Tour.findByIdAndUpdate(tourId, {
      ratingsQuantity: stats[0].nRating,
      ratingsAverage: stats[0].avgRating,
    });
  }
};

reviewSchema.post('save', function () {
  this.constructor.calcAverageRatings(this.tour);
});
```

#### Query Middleware (populate)

Auto-populate guide references on any `.find` query.

```js
tourSchema.pre(/^find/, function (next) {
  this.populate({ path: 'guides', select: '-__v -passwordChangedAt' });
  next();
});
```

---

### 3. Authentication & Security

#### The JWT Flow

```
1. User sends email + password → POST /api/v1/users/login
2. Server verifies password (bcrypt.compare)
3. Server signs a JWT: jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '90d' })
4. Token sent to client (cookie + JSON response)
5. Client sends token on protected routes via Authorization header or cookie
6. Server verifies: jwt.verify(token, process.env.JWT_SECRET)
7. Server checks user still exists and hasn't changed password after token was issued
```

#### The `protect` Middleware

```js
exports.protect = catchAsync(async (req, res, next) => {
  // 1. Get token
  let token;
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }
  if (!token) return next(new AppError('You are not logged in.', 401));

  // 2. Verify token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3. Check user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) return next(new AppError('User no longer exists.', 401));

  // 4. Check password not changed after token issued
  if (currentUser.changedPasswordAfter(decoded.iat))
    return next(new AppError('Password recently changed. Log in again.', 401));

  req.user = currentUser;
  res.locals.user = currentUser; // available in Pug templates
  next();
});
```

#### Password Hashing

```js
// userModel.js — pre-save hook
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next(); // only hash if changed
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = undefined; // never persist to DB
  next();
});
```

#### Security Middleware Stack (app.js)

```js
app.use(helmet()); // Set security HTTP headers
app.use('/api', rateLimit({ max: 100, windowMs: 60 * 60 * 1000 })); // Rate limit
app.use(mongoSanitize()); // Prevent NoSQL injection
app.use(xss()); // Prevent XSS attacks
app.use(hpp({ whitelist: ['duration', 'ratingsAverage', 'price'] })); // Prevent param pollution
```

---

### 4. Error Handling

#### The AppError Class

```js
// utils/appError.js
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true; // distinguishes our errors from programmer bugs
    Error.captureStackTrace(this, this.constructor);
  }
}
```

#### The catchAsync Wrapper

Eliminates try/catch blocks in every async controller:

```js
// utils/catchAsync.js
module.exports = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Usage in controller
exports.getTour = catchAsync(async (req, res, next) => {
  const tour = await Tour.findById(req.params.id);
  if (!tour) return next(new AppError('No tour found with that ID', 404));
  res.status(200).json({ status: 'success', data: { tour } });
});
```

#### Global Error Handler

```js
// errorController.js
module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else {
    let error = { ...err, message: err.message };
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError')
      error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
    sendErrorProd(error, req, res);
  }
};
```

---

### 5. Advanced Features

#### APIFeatures Class

Chainable query builder for filtering, sorting, field limiting, and pagination.

```js
// utils/apiFeatures.js
class APIFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  filter() {
    const queryObj = { ...this.queryString };
    ['page', 'sort', 'limit', 'fields'].forEach((el) => delete queryObj[el]);
    let queryStr = JSON.stringify(queryObj).replace(
      /\b(gte|gt|lte|lt)\b/g,
      (m) => `$${m}`,
    );
    this.query = this.query.find(JSON.parse(queryStr));
    return this;
  }

  sort() {
    this.query = this.query.sort(
      this.queryString.sort?.split(',').join(' ') || '-createdAt',
    );
    return this;
  }

  limitFields() {
    this.query = this.query.select(
      this.queryString.fields?.split(',').join(' ') || '-__v',
    );
    return this;
  }

  paginate() {
    const page = +this.queryString.page || 1;
    const limit = +this.queryString.limit || 100;
    this.query = this.query.skip((page - 1) * limit).limit(limit);
    return this;
  }
}

// Usage
const features = new APIFeatures(Tour.find(), req.query)
  .filter()
  .sort()
  .limitFields()
  .paginate();
const tours = await features.query;
```

#### Geospatial Queries

Find tours within a radius of a given location.

```js
// GET /tours-within/:distance/center/:latlng/unit/:unit
exports.getToursWithin = catchAsync(async (req, res, next) => {
  const { distance, latlng, unit } = req.params;
  const [lat, lng] = latlng.split(',');
  const radius = unit === 'mi' ? distance / 3963.2 : distance / 6378.1; // in radians

  const tours = await Tour.find({
    startLocation: { $geoWithin: { $centerSphere: [[lng, lat], radius] } },
  });
  res
    .status(200)
    .json({ status: 'success', results: tours.length, data: { tours } });
});
```

---

### 6. Server-Side Rendering with Pug

#### How viewsController feeds data to templates

```js
// viewsController.js
exports.getTour = catchAsync(async (req, res, next) => {
  const tour = await Tour.findOne({ slug: req.params.slug }).populate({
    path: 'reviews',
    fields: 'review rating user',
  });
  if (!tour) return next(new AppError('There is no tour with that name.', 404));

  res.status(200).render('tour', {
    // renders views/tour.pug
    title: `${tour.name} Tour`,
    tour, // variable available in template as `tour`
  });
});
```

#### Pug Template Syntax

```pug
//- views/tour.pug
extends base

block content
  section.section-header
    .section-header__hero
      .section-header__hero-overlay &nbsp;
      img.section-header__hero-img(src=`/img/tours/${tour.imageCover}` alt=`${tour.name}`)

  //- Loop through reviews
  each review in tour.reviews
    +reviewCard(review)    //- calls the _reviewCard mixin
```

#### Common Template Bug

Variables in Pug must exactly match what the controller passes. A mismatch causes a silent `undefined` or a 500 error.

```js
// ❌ Controller sends: res.render('myReviews', { title, reviews })
// ❌ Template uses: each review in userReviews   ← undefined!

// ✅ Controller sends: res.render('myReviews', { title, userReviews: reviews })
// ✅ Template uses:    each review in userReviews ← works
```

---

### 7. Payments

#### Stripe Flow (original course)

```
1. User clicks "Book Tour"
2. Frontend calls GET /api/v1/bookings/checkout-session/:tourId
3. Controller creates a Stripe Checkout Session, returns session.url
4. Frontend redirects to Stripe hosted page
5. After payment, Stripe redirects to success URL
6. Webhook receives `checkout.session.completed` event
7. Controller creates a Booking document in DB
```

#### Paystack Alternative (for Nigerian projects)

```js
// Initialize payment
const response = await axios.post(
  'https://api.paystack.co/transaction/initialize',
  {
    email: user.email,
    amount: tour.price * 100,
    currency: 'NGN',
    reference,
    metadata,
  },
  { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } },
);
// Redirect to response.data.data.authorization_url

// Verify payment (webhook or manual verification)
const verify = await axios.get(
  `https://api.paystack.co/transaction/verify/${reference}`,
  { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } },
);
if (verify.data.data.status === 'success') {
  await Booking.create({ tour, user, price });
}
```

---

## API Reference

### Tours

| Method | Endpoint                                                   | Access                   | Description              |
| ------ | ---------------------------------------------------------- | ------------------------ | ------------------------ |
| GET    | `/api/v1/tours`                                            | Public                   | Get all tours            |
| GET    | `/api/v1/tours/:id`                                        | Public                   | Get one tour             |
| POST   | `/api/v1/tours`                                            | Admin, Lead-Guide        | Create tour              |
| PATCH  | `/api/v1/tours/:id`                                        | Admin, Lead-Guide        | Update tour              |
| DELETE | `/api/v1/tours/:id`                                        | Admin, Lead-Guide        | Delete tour              |
| GET    | `/api/v1/tours/top-5-cheap`                                | Public                   | Alias: top 5 cheap tours |
| GET    | `/api/v1/tours/tour-stats`                                 | Public                   | Aggregated stats         |
| GET    | `/api/v1/tours/monthly-plan/:year`                         | Admin, Lead-Guide, Guide | Monthly plan             |
| GET    | `/api/v1/tours-within/:distance/center/:latlng/unit/:unit` | Public                   | Tours within radius      |

### Users

| Method | Endpoint                             | Access    | Description             |
| ------ | ------------------------------------ | --------- | ----------------------- |
| POST   | `/api/v1/users/signup`               | Public    | Register                |
| POST   | `/api/v1/users/login`                | Public    | Login                   |
| GET    | `/api/v1/users/logout`               | Public    | Logout (clears cookie)  |
| POST   | `/api/v1/users/forgotPassword`       | Public    | Send reset email        |
| PATCH  | `/api/v1/users/resetPassword/:token` | Public    | Reset password          |
| PATCH  | `/api/v1/users/updateMyPassword`     | Protected | Change password         |
| GET    | `/api/v1/users/me`                   | Protected | Get own profile         |
| PATCH  | `/api/v1/users/updateMe`             | Protected | Update name/email/photo |
| DELETE | `/api/v1/users/deleteMe`             | Protected | Deactivate account      |

### Reviews

| Method | Endpoint                        | Access      | Description             |
| ------ | ------------------------------- | ----------- | ----------------------- |
| GET    | `/api/v1/reviews`               | Public      | Get all reviews         |
| POST   | `/api/v1/reviews`               | User        | Create review           |
| GET    | `/api/v1/tours/:tourId/reviews` | Public      | Get reviews for a tour  |
| POST   | `/api/v1/tours/:tourId/reviews` | User        | Create review on a tour |
| PATCH  | `/api/v1/reviews/:id`           | User, Admin | Update review           |
| DELETE | `/api/v1/reviews/:id`           | User, Admin | Delete review           |

---

## Key Bugs & Fixes

### 1. `req.cookies` is `undefined`

**Symptom:** JWT cookie auth silently fails; user cannot stay logged in across page refreshes.

**Cause:** `cookieParser` middleware was missing or declared after the routes.

**Fix:**

```js
// app.js — must come BEFORE routes
const cookieParser = require('cookie-parser');
app.use(cookieParser());
```

---

### 2. Pug template 500 error — variable mismatch

**Symptom:** `/my-reviews` throws a 500 error. No useful message in the browser.

**Cause:** Controller sends data under one variable name, template iterates over a different name.

**Fix:** Match the variable name exactly between `res.render()` and the Pug template, or alias in the render call:

```js
// viewsController.js
res.render('myReviews', { title: 'My Reviews', userReviews: reviews });

//- myReviews.pug
each review in userReviews
```

---

### 3. Parcel not picking up updated JS

**Symptom:** Changes to frontend `.js` files don't reflect in the browser.

**Cause:** Parcel caches aggressively. Old bundle is served.

**Fix:**

```bash
rm -rf .parcel-cache dist
npx parcel public/js/index.js
```

---

### 4. Review form submits but nothing happens

**Symptom:** Form submit triggers, no error, no success, no review appears.

**Cause (common):** API URL in the frontend points to the wrong path (e.g., `/api/v1/review` instead of `/api/v1/reviews`).

**Fix:** Double-check the exact route defined in the router vs what the frontend JS calls.

```js
// ✅ Correct
await axios.post(`/api/v1/tours/${tourId}/reviews`, { review, rating });
```

---

### 5. `.env` variables not loading

**Symptom:** `process.env.JWT_SECRET` is `undefined`. App crashes or JWT fails silently.

**Cause:** `dotenv.config()` is called after the module that needs the variable.

**Fix:** Always call `dotenv.config()` at the very top of `server.js`, before any other `require()` that uses env vars.

```js
// server.js — FIRST line
const dotenv = require('dotenv');
dotenv.config({ path: './config.env' });

// Everything else below
const app = require('./app');
```

---

## Lessons Learned

**1. I learnt Order matters everywhere.** Middleware order in Express, `dotenv` loading order, and hook execution order in Mongoose — one misplacement causes hard-to-trace bugs.

**2. I learnt to always check variable names between controller and template.** Pug has no type safety. A mismatch between what you send in `res.render()` and what the template uses produces a 500 with minimal feedback.

**3. `catchAsync` is your best friend.** Once you internalize the pattern, async error handling becomes trivial. Without it, every `async` controller needs its own try/catch.

**4. Mongoose middleware (hooks) are powerful but silent.** `pre('save')` doesn't run on `findByIdAndUpdate`. Use `pre('findOneAndUpdate')` and `{ new: true, runValidators: true }` for updates.

**5. Security is a layer, not an afterthought.** Adding `helmet`, `mongoSanitize`, `xss`, and `hpp` at the start is cheap insurance. Retrofitting them is harder.

**6. Virtual populate is cleaner than embedding IDs everywhere.** Keeping reviews in their own collection and using virtual populate keeps the tour documents lean while still allowing easy access.

**7. The aggregation pipeline is worth mastering.** Once you understand `$match`, `$group`, and `$sort`, you can compute analytics directly in MongoDB without pulling data into Node first.

---

## Resources

| Resource             | Link                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | --- |
| Course               | [Udemy — Node.js Bootcamp by Jonas Schmedtmann](https://www.udemy.com/course/nodejs-express-mongodb-bootcamp/) |
| Mongoose Docs        | https://mongoosejs.com/docs/                                                                                   |
| Express Docs         | https://expressjs.com/en/api.html                                                                              |
| JWT Debugger         | https://jwt.io                                                                                                 |
| Pug Docs             | https://pugjs.org/api/getting-started.html                                                                     |
| Paystack Docs        | https://paystack.com/docs/api/                                                                                 |     |
| Mailtrap (dev email) | https://mailtrap.io                                                                                            |
| MongoDB Atlas        | https://www.mongodb.com/atlas                                                                                  |

---
