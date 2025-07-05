// routes/bans.js
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/bans/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const [rows] = await db.execute('SELECT * FROM bans WHERE userId = ?', [userId]);

    if (rows.length > 0) {
      res.json({ banned: true, data: rows[0] });
    } else {
      res.json({ banned: false });
    }
  } catch (err) {
    console.error('Error checking ban:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
