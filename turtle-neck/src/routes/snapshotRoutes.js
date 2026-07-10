const express = require('express');

const authenticateToken = require('../middleware/authMiddleware');
const snapshotUpload = require('../middleware/snapshotUploadMiddleware');
const snapshotController = require('../controllers/snapshotController');

const router = express.Router();

router.get('/', authenticateToken, snapshotController.listSnapshots);
router.post(
  '/',
  authenticateToken,
  snapshotUpload.single('snapshot_image'),
  snapshotController.createSnapshot
);
router.delete('/', authenticateToken, snapshotController.deleteSnapshots);

module.exports = router;
