const express = require('express');
const router = express.Router();
const pool = require('../db');

// Obtener ban por userId
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const [rows] = await pool.execute("SELECT * FROM bans WHERE userId = ?", [userId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "El usuario no está baneado." });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Error al obtener el ban:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// Endpoint de prueba
router.get('/test', (req, res) => {
    res.send('✅ API de bans funcionando');
});

router.post('/', async (req, res) => {
    const { userId, reason } = req.body;
    try {
        await pool.execute('INSERT INTO bans (userId, reason) VALUES (?, ?)', [userId, reason]);
        res.json({ message: 'Ban registrado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al registrar ban' });
    }
});

module.exports = router;
