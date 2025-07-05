const express = require('express');
const app = express();
const cors = require('cors');
const exploitReportsRoute = require('./routes/exploitReports');
const bansRoute = require('./routes/bans');

app.use(cors());
app.use(express.json());

// Rutas principales
app.use('/api/bans', bansRoute);
app.use('/api/exploit-reports', exploitReportsRoute); // Nueva ruta del anticheat

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 N-FORCE backend API is running on port ${PORT}`);
});
