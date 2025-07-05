// db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'shinkansen.proxy.rlwy.net',
  user: 'root',
  password: 'oquhiVlMRbvIjHFwyklvMSUaBaMdxKrq',
  database: 'railway',
  port: 23303,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
