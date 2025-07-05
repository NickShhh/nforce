const express = require('express');
const router = express.Router();
const pool = require('../db');

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
