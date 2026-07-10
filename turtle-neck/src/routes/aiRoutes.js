const express = require('express');
const multer = require('multer');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const AI_BASE_URL = process.env.AI_BASE_URL || 'http://127.0.0.1:8000';

router.get('/health', async (req, res) => {
  try {
    const response = await fetch(`${AI_BASE_URL}/health`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({
      message: 'AI 서버 health check 실패',
      error: error.message,
    });
  }
});

router.post('/process-frame', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '이미지 파일(file)이 필요합니다.' });
    }

    const { session_id } = req.body;

    const form = new FormData();
    const blob = new Blob([req.file.buffer], {
      type: req.file.mimetype || 'image/jpeg',
    });

    form.append('file', blob, req.file.originalname || 'frame.jpg');

    if (session_id) {
      form.append('session_id', session_id);
    }

    const response = await fetch(`${AI_BASE_URL}/process-frame`, {
      method: 'POST',
      body: form,
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({
      message: 'AI 프레임 처리 요청 실패',
      error: error.message,
    });
  }
});

router.post('/reset-session', upload.none(), async (req, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ message: 'session_id가 필요합니다.' });
    }

    const form = new FormData();
    form.append('session_id', session_id);

    const response = await fetch(`${AI_BASE_URL}/reset-session`, {
      method: 'POST',
      body: form,
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({
      message: 'AI 세션 리셋 실패',
      error: error.message,
    });
  }
});

module.exports = router;