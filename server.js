const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('./config/db');
const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const userRoutes = require('./routes/users');
const resourceRoutes = require('./routes/resources');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/resources', resourceRoutes);

// Multer/general error handler - keeps error messages user-friendly
app.use((err, req, res, next) => {
  if (err && err.message) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'An unexpected error occurred.' });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

const PORT = process.env.PORT || 4000;

// Test the database connection BEFORE claiming the server is up. Without
// this, a bad .env silently starts an API that looks healthy but fails
// on the very first real request (e.g. login) with a confusing error.
async function start() {
  try {
    const conn = await pool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
    console.log('✅ Database connection verified.');
  } catch (err) {
    console.error('\n❌ Could not connect to the database. The server will not start.');
    console.error(`   Reason: ${err.code || err.message}`);
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   Your DB_USER / DB_PASSWORD in backend/.env do not match MySQL.');
      console.error('   Double-check backend/.env exists (not just .env.example) and has the right password.');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('   MySQL does not appear to be running. Start the MySQL service and try again.');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.error('   The database itself does not exist yet. Run backend/sql/schema.sql first.');
    }
    console.error('');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Gender Equality Platform API running on port ${PORT}`);
  });
}

start();
