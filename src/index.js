const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
// Add this line to import Mongoose
const mongoose = require('mongoose');





const requiredEnv = [
    'MONGODB_URI'
];


requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.warn(`[config] Missing env var: ${key}`);
  }
});





//middleware
app.use(express.json({ limit: '10mb' }));//
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



// Mongo connection
const mongoUri = process.env.MONGODB_URI; //
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

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ message: 'Internal server error' });
});




app.get('/', (req, res) => {
  res.send('reporting system running')
})

const port =process.env.port || 5000;
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
