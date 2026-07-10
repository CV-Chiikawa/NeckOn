const express = require('express');

const authenticateToken = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const userController = require('../controllers/userController');

const router = express.Router();

router.get('/me', authenticateToken, userController.getMyProfile);
router.patch(
  '/me',
  authenticateToken,
  upload.single('profile_image'),
  userController.updateMyProfile
);

module.exports = router;
