const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
require('dotenv').config();

const SALT_ROUNDS = 12;

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, name: user.full_name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

// Employees self-register as end_user. Admin/Supreme Admin/NGO accounts
// are provisioned separately by an existing Supreme Admin (see users routes)
// to prevent someone from granting themselves elevated access.
async function register(req, res) {
  try {
    const { full_name, email, password, department, phone } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ error: 'Full name, email, and password are required.' });
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
       VALUES (?, ?, ?, 'end_user', ?, ?)`,
      [full_name.trim(), email.toLowerCase().trim(), passwordHash, department || null, phone || null]
    );

    const user = {
      id: result.insertId,
      full_name: full_name.trim(),
      email: email.toLowerCase().trim(),
      role: 'end_user'
    };

    const token = signToken(user);
    return res.status(201).json({
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: 'Something went wrong while creating your account.' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ? AND is_active = 1',
      [email.toLowerCase().trim()]
    );

    // Use a generic error for both "no such user" and "wrong password"
    // so we don't leak which emails are registered.
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = rows[0];
    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken(user);
    return res.json({
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, department: user.department }
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Something went wrong while logging in.' });
  }
}

async function me(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT id, full_name, email, role, department, phone, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    return res.json({ user: rows[0] });
  } catch (err) {
    console.error('me error:', err);
    return res.status(500).json({ error: 'Could not load your profile.' });
  }
}

module.exports = { register, login, me };
