const express = require('express');

const contactController = require('../controllers/contactController');
const authenticateToken = require('../middleware/authMiddleware');
const contactUpload = require('../middleware/contactUploadMiddleware');

const router = express.Router();

router.post(
  '/',
  authenticateToken,
  contactUpload.array('attachments', 5),
  contactController.createContact
);

module.exports = router;
