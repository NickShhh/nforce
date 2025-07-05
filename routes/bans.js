const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/is-banned/:userId", async (req, res) => {
  const [rows] = await db.execute("SELECT * FROM bans WHERE userId = ?", [req.params.userId]);
  res.json({ banned: rows.length > 0 });
});

router.post("/ban", async (req, res) => {
  const { userId, username, reason } = req.body;
  await db.execute(
    "INSERT INTO bans (userId, username, reason) VALUES (?, ?, ?)",
    [userId, username, reason || "Sin razón"]
  );
  res.json({ success: true });
});

router.post("/unban", async (req, res) => {
  const { userId } = req.body;
  await db.execute("DELETE FROM bans WHERE userId = ?", [userId]);
  res.json({ success: true });
});

module.exports = router;