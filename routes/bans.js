const express = require('express');
const router = express.Router();
const pool = require('../db');

// Ruta para añadir un usuario baneado
router.post('/', async (req, res) => {
  const { userId, reason } = req.body;
  if (!userId || !reason) {
    return res.status(400).json({ error: 'Missing userId or reason' });
  }

  try {
    await pool.execute('INSERT INTO bans (userId, reason) VALUES (?, ?)', [userId, reason]);
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
