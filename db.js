require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({

  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT              // Default PostgreSQL port
});

// Test the connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error acquiring client', err.stack);
    return;
  }
  console.log('Database connection successful');
  release();
});

module.exports = pool;