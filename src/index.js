// src/index.js

const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const mongoose = require('mongoose');

const stripe = require('stripe')(process.env.STRIPE_SECRET);

// MORGAN for logging (Good practice)
const morgan = require('morgan');

// Initialize Firebase Admin SDK
const { initializeFirebase } = require('./config/firebase');
initializeFirebase();

// IMPORT ROUTERS (Using the router names from your file structure)
const issuesRouter = require('./routes/issueRoutes');
const adminRouter = require('./routes/adminRoutes');
const staffRouter = require('./routes/staffRoutes');
const paymentsRouter = require('./routes/paymentRoutes');
const usersRouter = require('./routes/userRoutes');


const requiredEnv = [
    'MONGODB_URI'
];

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.warn(`[config] Missing env var: ${key}`);
  }
});


// Middleware
app.use(express.json({ limit: '10mb' }));

// CORS Configuration - Fixed to properly handle origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, origin);
    }

    console.warn(`[cors] Blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Use Morgan for request logging
app.use(morgan('dev'));


// Mongo connection
const mongoUri = process.env.MONGODB_URI;
mongoose.set('strictQuery', true);
mongoose
  .connect(mongoUri)
  .then(() => console.log('[mongo] Connected'))
  .catch((err) => console.error('[mongo] Connection error', err.message));


app.get('/', (req, res) => {
  res.json({ status: 'ok', service: process.env.APP_NAME || 'Public Infrastructure Issue Reporting' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: process.env.APP_NAME || 'Public Infrastructure Issue Reporting' });
});


// USE ROUTERS (Matching your preferred structure)
app.use('/issues', issuesRouter);
app.use('/admin', adminRouter);
app.use('/staff', staffRouter);
app.use('/payments', paymentsRouter);
app.use('/users', usersRouter);


// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ message: 'Internal server error' });
});


const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`)
});
