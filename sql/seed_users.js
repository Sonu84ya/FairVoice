/**
 * Creates one demo account per role so you can log in and test each
 * dashboard immediately. Run with: npm run seed
 * All demo accounts share the password: Password123!
 */
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const demoUsers = [
  { full_name: 'Aisha Karki', email: 'employee@demo.com', role: 'end_user', department: 'Marketing' },
  { full_name: 'Rajesh Admin', email: 'admin@demo.com', role: 'admin', department: 'Human Resources' },
  { full_name: 'Sunita Supreme', email: 'supreme@demo.com', role: 'supreme_admin', department: 'Executive HR' },
  { full_name: 'Global Rights NGO', email: 'ngo@demo.com', role: 'ngo', department: 'External Partner' }
];

async function seed() {
  const password = 'Password123!';
  const hash = await bcrypt.hash(password, 12);

  for (const u of demoUsers) {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [u.email]);
    if (existing.length > 0) {
      console.log(`Skipping ${u.email} (already exists)`);
      continue;
    }
    await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, department) VALUES (?, ?, ?, ?, ?)`,
      [u.full_name, u.email, hash, u.role, u.department]
    );
    console.log(`Created ${u.role} account: ${u.email} / ${password}`);
  }

  console.log('\nSeeding complete. Demo password for all accounts: Password123!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
