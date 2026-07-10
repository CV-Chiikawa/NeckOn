// 사용자 인증 관련 라우터

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.post('/register', upload.single('profile_image'), authController.register);
router.post('/login', authController.login);
router.get('/me', authenticateToken, authController.me);

module.exports = router;