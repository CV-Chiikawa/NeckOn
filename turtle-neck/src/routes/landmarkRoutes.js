// Landmark 관련 라우터

const express = require('express');
const router = express.Router();

const landmarkController = require('../controllers/landmarkController');
const authenticateToken = require('../middleware/authMiddleware');

router.post('/', authenticateToken, landmarkController.createLandmark);
router.get('/latest', authenticateToken, landmarkController.getLatestLandmark);

module.exports = router;