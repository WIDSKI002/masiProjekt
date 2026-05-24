const { Pool } = require('pg');

const pool = new Pool({
  user: 'neondb_owner',
  host: 'ep-divine-wind-amtd9qol-pooler.c-5.us-east-1.aws.neon.tech',
  database: 'neondb',
  password: 'npg_wvg3HFRxT6bQ',
  port: 5432,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;
