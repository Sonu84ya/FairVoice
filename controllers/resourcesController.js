const pool = require('../config/db');

async function listResources(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, description, resource_type, contact_info FROM resources WHERE is_active = 1 ORDER BY resource_type, title'
    );
    return res.json({ resources: rows });
  } catch (err) {
    console.error('listResources error:', err);
    return res.status(500).json({ error: 'Could not load support resources.' });
  }
}

module.exports = { listResources };
