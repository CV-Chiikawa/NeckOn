const express = require('express');
const router = express.Router();

const authenticateToken = require('../middleware/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

router.get('/today', authenticateToken, dashboardController.getTodayDashboard);
router.get('/weekly', authenticateToken, dashboardController.getWeeklyDashboard);

module.exports = router;