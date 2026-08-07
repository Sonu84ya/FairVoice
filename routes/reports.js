const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/reportsController');

// End user
router.post('/', requireAuth, requireRole('end_user'), upload.array('evidence', 5), ctrl.createReport);
router.get('/mine', requireAuth, requireRole('end_user'), ctrl.getMyReports);
router.post('/:id/self-escalate', requireAuth, requireRole('end_user'), ctrl.selfEscalate);

// Admin / Supreme Admin / NGO
router.get('/queue', requireAuth, requireRole('admin', 'supreme_admin', 'ngo'), ctrl.getQueue);
router.get('/all', requireAuth, requireRole('admin', 'supreme_admin', 'ngo'), ctrl.getAllReports);
router.get('/stats', requireAuth, requireRole('admin', 'supreme_admin', 'ngo'), ctrl.getStats);
router.post('/:id/actions', requireAuth, requireRole('admin', 'supreme_admin', 'ngo'), ctrl.takeAction);

// Shared (access-controlled inside controller)
router.get('/:id', requireAuth, ctrl.getReportDetail);
router.get('/:id/evidence/:evidenceId', requireAuth, ctrl.downloadEvidence);

module.exports = router;
