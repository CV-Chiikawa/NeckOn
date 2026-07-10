const express = require('express');
const router = express.Router();

const authenticateToken = require('../middleware/authMiddleware');
const pushController = require('../controllers/pushController');

router.post('/send', authenticateToken, pushController.sendPushToUser);

module.exports = router;