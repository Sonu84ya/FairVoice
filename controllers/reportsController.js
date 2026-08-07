const path = require('path');
const fs = require('fs');
const pool = require('../config/db');

const VALID_CATEGORIES = new Set([
  'harassment', 'gender_discrimination', 'bullying', 'abuse',
  'unfair_treatment', 'mental_harassment', 'toxic_workplace',
  'safety_violation', 'other'
]);

const ESCALATION_ORDER = ['admin', 'supreme_admin', 'ngo'];

function nextLevel(currentLevel) {
  const idx = ESCALATION_ORDER.indexOf(currentLevel);
  if (idx === -1 || idx === ESCALATION_ORDER.length - 1) return null;
  return ESCALATION_ORDER[idx + 1];
}

async function generateReportCode(conn) {
  const year = new Date().getFullYear();
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS cnt FROM reports WHERE YEAR(created_at) = ?",
    [year]
  );
  const seq = (rows[0].cnt + 1).toString().padStart(6, '0');
  return `GEP-${year}-${seq}`;
}

// Strips reporter identity for anonymous reports before sending to
// admin/supreme_admin/ngo roles. End users always see their own full report.
function sanitizeReportForViewer(report, viewerRole, viewerId) {
  const isOwner = report.reporter_id === viewerId;
  const out = { ...report };
  if (report.is_anonymous && !isOwner && viewerRole !== 'end_user') {
    out.reporter_name = 'Anonymous';
    out.reporter_email = null;
    out.reporter_department = null;
  }
  return out;
}

// ------------------------------------------------------------
// POST /api/reports  (end_user) - create a new report, optional evidence
// ------------------------------------------------------------
async function createReport(req, res) {
  const conn = await pool.getConnection();
  try {
    const {
      category, title, description, incident_date,
      location, accused_info, is_anonymous, priority
    } = req.body;

    if (!category || !VALID_CATEGORIES.has(category)) {
      conn.release();
      return res.status(400).json({ error: 'Please select a valid report category.' });
    }
    if (!title || !title.trim() || !description || !description.trim()) {
      conn.release();
      return res.status(400).json({ error: 'A title and description are required.' });
    }

    const anonymous = is_anonymous === 'true' || is_anonymous === true ? 1 : 0;
    const validPriority = ['low', 'medium', 'high', 'critical'].includes(priority) ? priority : 'medium';

    await conn.beginTransaction();

    const reportCode = await generateReportCode(conn);

    const [result] = await conn.query(
      `INSERT INTO reports
        (report_code, reporter_id, is_anonymous, category, title, description,
         incident_date, location, accused_info, priority, status, current_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 'admin')`,
      [
        reportCode, req.user.id, anonymous, category, title.trim(), description.trim(),
        incident_date || null, location || null, accused_info || null, validPriority
      ]
    );

    const reportId = result.insertId;

    await conn.query(
      `INSERT INTO report_actions (report_id, actor_id, actor_role, action_type, note)
       VALUES (?, ?, ?, 'submitted', 'Report submitted and queued for administrator review.')`,
      [reportId, anonymous ? null : req.user.id, 'end_user']
    );

    // Handle uploaded evidence files (multer has already validated type/size)
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await conn.query(
          `INSERT INTO evidence (report_id, stored_name, original_name, mime_type, size_bytes)
           VALUES (?, ?, ?, ?, ?)`,
          [reportId, file.filename, file.originalname, file.mimetype, file.size]
        );
      }
    }

    await conn.commit();
    conn.release();

    return res.status(201).json({
      message: 'Your report has been submitted securely.',
      report: { id: reportId, report_code: reportCode, status: 'submitted', current_level: 'admin' }
    });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('createReport error:', err);
    return res.status(500).json({ error: 'Something went wrong while submitting your report.' });
  }
}

// ------------------------------------------------------------
// GET /api/reports/mine  (end_user) - all reports filed by the caller
// ------------------------------------------------------------
async function getMyReports(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, report_code, category, title, priority, status, current_level,
              is_anonymous, created_at, updated_at
       FROM reports WHERE reporter_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.json({ reports: rows });
  } catch (err) {
    console.error('getMyReports error:', err);
    return res.status(500).json({ error: 'Could not load your reports.' });
  }
}

// ------------------------------------------------------------
// GET /api/reports/queue  (admin, supreme_admin, ngo)
// Returns the working queue for the caller's level, ordered by
// priority (critical first) then oldest-first (FIFO) - a real queue.
// ------------------------------------------------------------
async function getQueue(req, res) {
  try {
    const level = req.user.role; // admin | supreme_admin | ngo
    if (!['admin', 'supreme_admin', 'ngo'].includes(level)) {
      return res.status(403).json({ error: 'This dashboard is not available for your role.' });
    }

    const [rows] = await pool.query(
      `SELECT r.id, r.report_code, r.category, r.title, r.priority, r.status,
              r.current_level, r.is_anonymous, r.created_at, r.updated_at,
              u.full_name AS reporter_name, u.department AS reporter_department
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_id
       WHERE r.current_level = ?
       ORDER BY FIELD(r.priority, 'critical', 'high', 'medium', 'low'), r.created_at ASC`,
      [level]
    );

    const sanitized = rows.map(r => sanitizeReportForViewer(r, req.user.role, req.user.id));
    return res.json({ queue: sanitized, count: sanitized.length });
  } catch (err) {
    console.error('getQueue error:', err);
    return res.status(500).json({ error: 'Could not load the report queue.' });
  }
}

// ------------------------------------------------------------
// GET /api/reports/all  (admin, supreme_admin, ngo) - full oversight list
// Supreme admin and NGO get full visibility for accountability, per spec.
// ------------------------------------------------------------
async function getAllReports(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.report_code, r.category, r.title, r.priority, r.status,
              r.current_level, r.is_anonymous, r.created_at, r.updated_at,
              u.full_name AS reporter_name, u.department AS reporter_department
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_id
       ORDER BY r.created_at DESC`
    );
    const sanitized = rows.map(r => sanitizeReportForViewer(r, req.user.role, req.user.id));
    return res.json({ reports: sanitized, count: sanitized.length });
  } catch (err) {
    console.error('getAllReports error:', err);
    return res.status(500).json({ error: 'Could not load the report list.' });
  }
}

// ------------------------------------------------------------
// GET /api/reports/:id  - detail + timeline + evidence list
// ------------------------------------------------------------
async function getReportDetail(req, res) {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT r.*, u.full_name AS reporter_name, u.email AS reporter_email,
              u.department AS reporter_department
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_id
       WHERE r.id = ?`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Report not found.' });

    const report = rows[0];

    const isOwner = report.reporter_id === req.user.id;
    const isStaff = ['admin', 'supreme_admin', 'ngo'].includes(req.user.role);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: 'You do not have access to this report.' });
    }

    const [timeline] = await pool.query(
      `SELECT ra.id, ra.action_type, ra.note, ra.created_at, ra.actor_role,
              CASE WHEN ra.actor_id IS NULL THEN NULL ELSE u.full_name END AS actor_name
       FROM report_actions ra
       LEFT JOIN users u ON u.id = ra.actor_id
       WHERE ra.report_id = ? ORDER BY ra.created_at ASC`,
      [id]
    );

    const [evidenceRows] = await pool.query(
      `SELECT id, original_name, mime_type, size_bytes, uploaded_at FROM evidence WHERE report_id = ?`,
      [id]
    );

    const sanitized = sanitizeReportForViewer(report, req.user.role, req.user.id);
    return res.json({ report: sanitized, timeline, evidence: evidenceRows });
  } catch (err) {
    console.error('getReportDetail error:', err);
    return res.status(500).json({ error: 'Could not load this report.' });
  }
}

// ------------------------------------------------------------
// POST /api/reports/:id/actions  (admin, supreme_admin, ngo)
// action_type: comment | escalate | resolve | closed | legal_action
// ------------------------------------------------------------
async function takeAction(req, res) {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { action_type, note } = req.body;
    const role = req.user.role;

    const allowedActions = {
      admin: ['comment', 'escalate', 'resolve', 'closed'],
      supreme_admin: ['comment', 'escalate', 'resolve', 'closed'],
      ngo: ['comment', 'resolve', 'closed', 'legal_action']
    };

    if (!allowedActions[role] || !allowedActions[role].includes(action_type)) {
      conn.release();
      return res.status(403).json({ error: 'That action is not available for your role.' });
    }

    const [rows] = await conn.query('SELECT * FROM reports WHERE id = ?', [id]);
    if (rows.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Report not found.' });
    }
    const report = rows[0];

    if (report.current_level !== role) {
      conn.release();
      return res.status(403).json({ error: 'This report is not currently assigned to your dashboard.' });
    }
    if (['resolved', 'closed', 'legal_action'].includes(report.status)) {
      conn.release();
      return res.status(400).json({ error: 'This report is already closed and cannot be modified.' });
    }

    await conn.beginTransaction();

    let newStatus = report.status;
    let newLevel = report.current_level;

    if (action_type === 'comment') {
      newStatus = role === 'admin' ? 'under_review_admin'
        : role === 'supreme_admin' ? 'under_review_supreme'
        : 'under_review_ngo';
    } else if (action_type === 'escalate') {
      const next = nextLevel(role);
      if (!next) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ error: 'This report is already at the highest level.' });
      }
      newLevel = next;
      newStatus = next === 'supreme_admin' ? 'escalated_supreme' : 'escalated_ngo';
    } else if (action_type === 'resolve') {
      newStatus = 'resolved';
      newLevel = 'closed';
    } else if (action_type === 'closed') {
      newStatus = 'closed';
      newLevel = 'closed';
    } else if (action_type === 'legal_action') {
      newStatus = 'legal_action';
      // Stays with NGO/INGO level while legal proceedings continue.
    }

    await conn.query(
      'UPDATE reports SET status = ?, current_level = ? WHERE id = ?',
      [newStatus, newLevel, id]
    );

    // report_actions.action_type is a MySQL ENUM using past-tense values
    // (escalated/resolved) while the request body uses present-tense verbs
    // (escalate/resolve) - map between them so the INSERT doesn't truncate.
    const actionTypeForLog = {
      comment: 'comment',
      escalate: 'escalated',
      resolve: 'resolved',
      closed: 'closed',
      legal_action: 'legal_action'
    }[action_type];

    await conn.query(
      `INSERT INTO report_actions (report_id, actor_id, actor_role, action_type, note)
       VALUES (?, ?, ?, ?, ?)`,
      [id, req.user.id, role, actionTypeForLog, note || null]
    );

    await conn.commit();
    conn.release();

    return res.json({ message: 'Action recorded.', status: newStatus, current_level: newLevel });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('takeAction error:', err);
    return res.status(500).json({ error: 'Could not record this action.' });
  }
}

// ------------------------------------------------------------
// POST /api/reports/:id/self-escalate  (end_user, report owner only)
// Lets an employee move their own unresolved case forward when they
// feel it isn't being handled - admin -> supreme_admin -> NGO/INGO.
// ------------------------------------------------------------
async function selfEscalate(req, res) {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const [rows] = await conn.query('SELECT * FROM reports WHERE id = ?', [id]);
    if (rows.length === 0) {
      conn.release();
      return res.status(404).json({ error: 'Report not found.' });
    }
    const report = rows[0];

    if (report.reporter_id !== req.user.id) {
      conn.release();
      return res.status(403).json({ error: 'You can only escalate your own reports.' });
    }
    if (['resolved', 'closed', 'legal_action'].includes(report.status)) {
      conn.release();
      return res.status(400).json({ error: 'This report is already closed.' });
    }

    const next = nextLevel(report.current_level);
    if (!next) {
      conn.release();
      return res.status(400).json({ error: 'This report has already reached the NGO/INGO, the highest level.' });
    }

    const newStatus = next === 'supreme_admin' ? 'escalated_supreme' : 'escalated_ngo';

    await conn.beginTransaction();
    await conn.query('UPDATE reports SET status = ?, current_level = ? WHERE id = ?', [newStatus, next, id]);
    await conn.query(
      `INSERT INTO report_actions (report_id, actor_id, actor_role, action_type, note)
       VALUES (?, ?, 'end_user', 'escalated', ?)`,
      [id, req.user.id, `Employee escalated the case to ${next.replace('_', ' ')} after no resolution.`]
    );
    await conn.commit();
    conn.release();

    return res.json({ message: `Your case has been escalated to ${next.replace('_', ' ')}.`, current_level: next, status: newStatus });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error('selfEscalate error:', err);
    return res.status(500).json({ error: 'Could not escalate this report.' });
  }
}

// ------------------------------------------------------------
// GET /api/reports/:id/evidence/:evidenceId - secure, access-controlled download
// ------------------------------------------------------------
async function downloadEvidence(req, res) {
  try {
    const { id, evidenceId } = req.params;

    const [reportRows] = await pool.query('SELECT * FROM reports WHERE id = ?', [id]);
    if (reportRows.length === 0) return res.status(404).json({ error: 'Report not found.' });
    const report = reportRows[0];

    const isOwner = report.reporter_id === req.user.id;
    const isStaff = ['admin', 'supreme_admin', 'ngo'].includes(req.user.role);
    if (!isOwner && !isStaff) {
      return res.status(403).json({ error: 'You do not have access to this evidence.' });
    }

    const [evRows] = await pool.query(
      'SELECT * FROM evidence WHERE id = ? AND report_id = ?', [evidenceId, id]
    );
    if (evRows.length === 0) return res.status(404).json({ error: 'Evidence file not found.' });

    const ev = evRows[0];
    const filePath = path.join(__dirname, '..', 'uploads', ev.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File is missing from storage.' });

    return res.download(filePath, ev.original_name);
  } catch (err) {
    console.error('downloadEvidence error:', err);
    return res.status(500).json({ error: 'Could not download this file.' });
  }
}

// ------------------------------------------------------------
// GET /api/reports/stats  (admin, supreme_admin, ngo) - dashboard summary counts
// ------------------------------------------------------------
async function getStats(req, res) {
  try {
    const level = req.user.role;
    const [[queueCount]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM reports WHERE current_level = ?`, [level]
    );
    const [[criticalCount]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM reports WHERE current_level = ? AND priority IN ('critical','high')`, [level]
    );
    const [[resolvedCount]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM report_actions WHERE actor_role = ? AND action_type = 'resolved'`, [level]
    );
    const [[totalCount]] = await pool.query(`SELECT COUNT(*) AS cnt FROM reports`);

    return res.json({
      pendingInQueue: queueCount.cnt,
      highPriority: criticalCount.cnt,
      resolvedByYou: resolvedCount.cnt,
      totalPlatformReports: totalCount.cnt
    });
  } catch (err) {
    console.error('getStats error:', err);
    return res.status(500).json({ error: 'Could not load dashboard statistics.' });
  }
}

module.exports = {
  createReport, getMyReports, getQueue, getAllReports,
  getReportDetail, takeAction, selfEscalate, downloadEvidence, getStats
};
