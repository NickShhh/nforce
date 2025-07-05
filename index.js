const express = require('express');
const app = express();
const cors = require('cors');

// Importar rutas
const bansRoute = require('./routes/bans');
const exploitReportsRoute = require('./routes/exploitReports'); // <--- ¡IMPORTANTE!

app.use(cors());
app.use(express.json());

// Usar rutas
app.use('/api/bans', bansRoute);
app.use('/api/exploit-reports', exploitReportsRoute); // <--- ¡Aquí ya no dará error!

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 N-FORCE backend API is running on port ${PORT}`);
});
