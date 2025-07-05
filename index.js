// index.js
const express = require('express');
const cors = require('cors');
const app = express();
const bansRoutes = require('./routes/bans');

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api', bansRoutes);

app.get('/', (req, res) => {
  res.send('🚀 N-FORCE backend API is running.');
});

app.listen(PORT, () => {
  console.log(`🚀 N-FORCE backend running on port ${PORT}`);
});
