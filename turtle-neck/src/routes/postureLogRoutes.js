const express = require('express');
const router = express.Router();

const authenticateToken = require('../middleware/authMiddleware');
const postureLogController = require('../controllers/postureLogController');

router.post('/', authenticateToken, postureLogController.createPostureLog);

module.exports = router;