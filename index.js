const express = require('express');
const cors = require('cors');
const pool = require('./db');
const fetch = require('node-fetch');
require('dotenv').config();


const app = express();
app.use(cors());
app.use(express.json());

// 📌 POST /ban
app.post('/ban', async (req, res) => {
  const { userId, username, reason, moderator } = req.body;
  try {
    await pool.execute(
      'REPLACE INTO bans (userId, username, reason, moderator) VALUES (?, ?, ?, ?)',
      [userId, username, reason, moderator]
    );
    await pool.execute(
      'INSERT INTO mod_stats (moderator, ban_count) VALUES (?, 1) ON DUPLICATE KEY UPDATE ban_count = ban_count + 1',
      [moderator]
    );
    res.status(201).json({ message: 'User banned' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 📌 DELETE /unban/:userId
app.delete('/unban/:userId', async (req, res) => {
  try {
    await pool.execute('DELETE FROM bans WHERE userId = ?', [req.params.userId]);
    res.json({ message: 'User unbanned' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 📌 GET /banlist
app.get('/banlist', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM bans ORDER BY timestamp DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 📌 GET /bantop
app.get('/bantop', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM mod_stats ORDER BY ban_count DESC LIMIT 10');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function getCountryFromIP(ip) {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`);
    const data = await res.json();
    return data.country_name || 'Unknown';
  } catch {
    return 'Unknown';
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
