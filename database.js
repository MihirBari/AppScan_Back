const mysql = require('mysql');
const MySQLStore = require('express-mysql-session')(require('express-session'));
require('dotenv').config({ path: 'config/.env' });

const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT,
  connectTimeout: 10000,  // 10 seconds
  acquireTimeout: 10000,  // 10 seconds
  debug: false,
});

pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    if (err.code === 'ETIMEDOUT') {
      console.error('Connection timed out. Please check your database server and network configuration.');
    } else {
      console.error('Error details:', err);
    }
    return;
  }
  console.log('Database connected as id', connection.threadId);
  connection.release();
});

const sessionStore = new MySQLStore({}, pool);
 
module.exports = { pool, sessionStore };
