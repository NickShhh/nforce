const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: "shinkansen.proxy.rlwy.net",
  port: 23303,
  user: "root",
  password: "oquhiVlMRbvIjHFwyklvMSUaBaMdxKrq",
  database: "railway",
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
