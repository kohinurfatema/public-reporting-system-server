const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();



//middleware
app.use(express.json());
app.use(cors());




app.get('/', (req, res) => {
  res.send('reporting system running')
})

const port =process.env.port || 5000;
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
