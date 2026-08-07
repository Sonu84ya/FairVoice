const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { listResources } = require('../controllers/resourcesController');

router.get('/', requireAuth, listResources);

module.exports = router;
