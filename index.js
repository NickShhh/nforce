const express = require('express');
const cors = require('cors');
const bansRoutes = require('./routes/bans');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Ruta montada
app.use('/api/bans', bansRoutes);

app.get('/', (req, res) => {
  res.send('🚀 N-FORCE backend API is running.');
});

app.listen(port, () => {
  console.log(`🚀 N-FORCE backend API is running on port ${port}`);
});
