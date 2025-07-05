const express = require('express');
const router = express.Router();
const pool = require('../db');


router.post('/', async (req, res) => {
  const { userId, reason, bannedBy } = req.body;

  try {
    const [result] = await pool.execute(
      'INSERT INTO bans (userId, reason, bannedBy) VALUES (?, ?, ?)',
      [userId, reason, bannedBy || 'System']
    );

    res.status(201).json({ message: 'Ban registrado exitosamente', id: result.insertId });
  } catch (error) {
    console.error('Error al registrar el ban:', error);
    res.status(500).json({ error: 'Error al registrar el ban' });
  }
});


// Crear un ban (POST /api/bans)
router.post('/', async (req, res) => {
    const { userId, reason } = req.body;
    if (!userId || !reason) {
        return res.status(400).json({ message: 'Faltan campos requeridos' });
    }

    try {
        await pool.execute(
            'INSERT INTO bans (userId, reason) VALUES (?, ?)',
            [userId, reason]
        );
        res.status(201).json({ message: 'Ban registrado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al registrar el ban' });
    }
});

// Obtener un ban por userId (GET /api/bans/:userId)
router.get('/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const [rows] = await pool.execute(
            'SELECT * FROM bans WHERE userId = ?',
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'No se encontró el ban' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener el ban' });
    }
});

// Obtener todos los bans (GET /api/bans)
router.get('/', async (_req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM bans');
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al obtener los bans' });
    }
});

// Eliminar un ban por userId (DELETE /api/bans/:userId)
router.delete('/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const [result] = await pool.execute(
            'DELETE FROM bans WHERE userId = ?',
            [userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'No se encontró el ban para eliminar' });
        }

        res.json({ message: 'Ban eliminado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al eliminar el ban' });
    }
});

// Actualizar un ban por userId (PUT /api/bans/:userId)
router.put('/:userId', async (req, res) => {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason) {
        return res.status(400).json({ message: 'Se requiere una razón para actualizar' });
    }

    try {
        const [result] = await pool.execute(
            'UPDATE bans SET reason = ? WHERE userId = ?',
            [reason, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'No se encontró el ban para actualizar' });
        }

        res.json({ message: 'Ban actualizado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error al actualizar el ban' });
    }
});

module.exports = router;
