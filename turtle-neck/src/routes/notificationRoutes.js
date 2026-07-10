// Notification 관련 라우터

const express = require('express');
const router = express.Router();

const notificationController = require('../controllers/notificationController');
const authenticateToken = require('../middleware/authMiddleware');

router.post('/', authenticateToken, notificationController.createNotification);
router.get('/', authenticateToken, notificationController.getNotifications);

module.exports = router;