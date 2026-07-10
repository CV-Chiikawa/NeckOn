// Express app setup and route registration

const fs = require('fs');
const cors = require('cors');
const express = require('express');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const contactRoutes = require('./routes/contactRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const landmarkRoutes = require('./routes/landmarkRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const postureLogRoutes = require('./routes/postureLogRoutes');
const postureRoutes = require('./routes/postureRoutes');
const pushRoutes = require('./routes/pushRoutes');
const snapshotRoutes = require('./routes/snapshotRoutes');
const userRoutes = require('./routes/userRoutes');
const aiRoutes = require('./routes/aiRoutes');

const app = express();
const uploadsDir = path.join(__dirname, '../public/uploads');
const frontendDistCandidates = [
  process.env.FRONTEND_DIST_PATH,
  path.resolve(__dirname, '../../../AIX_Front/dist'),
].filter(Boolean);
const frontendDistDir = frontendDistCandidates.find((candidate) => fs.existsSync(candidate));
const frontendIndexFile = frontendDistDir
  ? path.join(frontendDistDir, 'index.html')
  : null;
const frontendRoutes = [
  '/',
  '/login',
  '/signup-agree',
  '/signup',
  '/dashboard',
  '/dashboardSummary',
  '/mypage',
];
const apiPrefixes = [
  '/auth',
  '/landmark',
  '/notifications',
  '/devices',
  '/users',
  '/posture',
  '/push',
  '/health',
  '/uploads',
  '/ai',
  '/contacts',
  '/snapshots',
];
const apiPaths = [
  '/dashboard/today',
  '/dashboard/weekly',
];

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));

if (frontendDistDir) {
  app.use(express.static(frontendDistDir));
}

app.get(frontendRoutes, (req, res, next) => {
  if (!frontendIndexFile || !req.accepts('html')) {
    next();
    return;
  }

  res.sendFile(frontendIndexFile);
});

app.use('/push', pushRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
  });
});

app.use('/auth', authRoutes);
app.use('/contacts', contactRoutes);
app.use('/landmark', landmarkRoutes);
app.use('/notifications', notificationRoutes);
app.use('/devices', deviceRoutes);
app.use('/users', userRoutes);
app.use('/snapshots', snapshotRoutes);
app.use('/posture/log', postureLogRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/posture', postureRoutes);
app.use('/ai', aiRoutes);

app.use((err, req, res, next) => {
  if (!err) {
    next();
    return;
  }

  if (err.name === 'MulterError') {
    return res.status(400).json({
      message: err.message,
    });
  }

  return res.status(err.status || 500).json({
    message: err.message || 'Server error occurred.',
  });
});

app.use((req, res, next) => {
  const isApiRequest =
    apiPrefixes.some(
      (prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`)
    ) ||
    apiPaths.some(
      (apiPath) => req.path === apiPath || req.path.startsWith(`${apiPath}/`)
    );

  if (!frontendIndexFile || req.method !== 'GET' || isApiRequest || !req.accepts('html')) {
    next();
    return;
  }

  res.sendFile(frontendIndexFile);
});

app.use((req, res) => {
  res.status(404).json({
    message: 'Requested route was not found.',
  });
});

module.exports = app;
