const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/usersController');

router.post('/staff', requireAuth, requireRole('supreme_admin'), ctrl.createStaffAccount);
router.get('/staff', requireAuth, requireRole('supreme_admin'), ctrl.listStaff);
router.patch('/staff/:id/active', requireAuth, requireRole('supreme_admin'), ctrl.setStaffActive);

module.exports = router;
