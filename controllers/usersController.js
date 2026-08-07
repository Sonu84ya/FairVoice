const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const SALT_ROUNDS = 12;

// Only a Supreme Administrator can create Admin / Supreme Admin / NGO
// accounts. This prevents privilege escalation from the public register
// endpoint, which only ever creates end_user accounts.
async function createStaffAccount(req, res) {
  try {
    const { full_name, email, password, role, department, phone } = req.body;
    const allowedRoles = ['admin', 'supreme_admin', 'ngo'];

    if (!full_name || !email || !password || !role) {
      return res.status(400).json({ error: 'Full name, email, password, and role are required.' });
    }
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Role must be admin, supreme_admin, or ngo.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, department, phone)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [full_name.trim(), email.toLowerCase().trim(), passwordHash, role, department || null, phone || null]
    );

    return res.status(201).json({
      message: 'Staff account created.',
      user: { id: result.insertId, full_name: full_name.trim(), email: email.toLowerCase().trim(), role }
    });
  } catch (err) {
    console.error('createStaffAccount error:', err);
    return res.status(500).json({ error: 'Could not create the staff account.' });
  }
}

// Supreme Admin: view all staff (admin/supreme_admin/ngo) for accountability oversight.
async function listStaff(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name, email, role, department, phone, is_active, created_at
       FROM users WHERE role IN ('admin','supreme_admin','ngo') ORDER BY created_at DESC`
    );
    return res.json({ staff: rows });
  } catch (err) {
    console.error('listStaff error:', err);
    return res.status(500).json({ error: 'Could not load staff accounts.' });
  }
}

async function setStaffActive(req, res) {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    await pool.query('UPDATE users SET is_active = ? WHERE id = ? AND role IN ("admin","supreme_admin","ngo")', [is_active ? 1 : 0, id]);
    return res.json({ message: 'Staff account updated.' });
  } catch (err) {
    console.error('setStaffActive error:', err);
    return res.status(500).json({ error: 'Could not update this staff account.' });
  }
}

module.exports = { createStaffAccount, listStaff, setStaffActive };
