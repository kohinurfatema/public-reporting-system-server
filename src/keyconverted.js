const fs = require('fs');
const path = require('path');
const key = fs.readFileSync(path.join(__dirname, 'public-reporting-system-firebase-adminsdk.json'), 'utf8')
const base64 = Buffer.from(key).toString('base64')
console.log(base64)