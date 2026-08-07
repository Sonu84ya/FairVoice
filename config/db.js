const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config();

// If DB_PASSWORD isn't set at all, warn loudly rather than silently
// connecting with an empty password (which is what caused the confusing
// "Access denied ... (using password: NO)" error). This usually means
// backend/.env doesn't exist yet, or wasn't saved as plain UTF-8 text.
if (process.env.DB_PASSWORD === undefined) {
  console.warn('\n⚠️  WARNING: DB_PASSWORD is not set.');
  console.warn(`   Expected to find it in: ${path.join(__dirname, '..', '.env')}`);
  console.warn('   - Make sure that file is named exactly ".env" (not ".env.example")');
  console.warn('   - Make sure it was saved as plain UTF-8 text (Notepad can default to UTF-16 on Windows)');
  console.warn('   - Make sure it sits directly inside the backend/ folder\n');
}

// Connection pool - reused across the whole app for performance.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gender_equality_platform',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true
});

module.exports = pool;
