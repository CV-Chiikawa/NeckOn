// 사용자 기기(FCM토큰) 관련 라우터

const express = require('express');
const router = express.Router();

const deviceController = require('../controllers/deviceController');
const authenticateToken = require('../middleware/authMiddleware');

router.post('/register', authenticateToken, deviceController.registerDevice);
router.get('/', authenticateToken, deviceController.getDevices);
router.delete('/', authenticateToken, deviceController.deleteDevice);

module.exports = router;