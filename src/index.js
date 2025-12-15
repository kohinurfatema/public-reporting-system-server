// src/index.js

const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const mongoose = require('mongoose');

// 🎯 MORGAN for logging (Good practice)
const morgan = require('morgan');

// Initialize Firebase Admin SDK
const { initializeFirebase } = require('./config/firebase');
initializeFirebase(); 

// 🎯 IMPORT ROUTERS (Using the router names from your file structure)
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


//middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: (origin, callback) => {
    const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
    if (!origin || allowed.length === 0 || allowed.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
// 🎯 Use Morgan for request logging
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


// 🎯 USE ROUTERS (Matching your preferred structure)
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


const port =process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`)
});