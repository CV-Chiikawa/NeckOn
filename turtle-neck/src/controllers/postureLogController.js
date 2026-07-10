const { db } = require('../config/db');
const { sendPushNotificationToUser } = require('../services/pushService');

const ALLOWED_STATUS = ['normal', 'warning', 'danger'];
const DEFAULT_ALERT_DURATION_SECONDS = {
  warning: 30,
  danger: 5,
};
const ALERT_TITLES = {
  warning: 'Posture Warning',
  danger: 'Posture Alert',
};
const MAX_REASONABLE_POSTURE_LOG_SECONDS = 24 * 60 * 60;

function normalizeDurationSeconds(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return null;
  }

  const roundedValue = Math.round(numericValue);

  if (roundedValue > MAX_REASONABLE_POSTURE_LOG_SECONDS) {
    const secondsFromMilliseconds = Math.round(roundedValue / 1000);

    if (secondsFromMilliseconds <= MAX_REASONABLE_POSTURE_LOG_SECONDS) {
      return secondsFromMilliseconds;
    }
  }

  return roundedValue;
}

function normalizeRecordedAt(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString();
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }

      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row);
    });
  });
}

function getAlertThresholdSeconds(status) {
  const envKey = `${status.toUpperCase()}_ALERT_MIN_DURATION_SECONDS`;
  const fromEnv = Number(process.env[envKey]);

  if (Number.isFinite(fromEnv) && fromEnv >= 0) {
    return Math.round(fromEnv);
  }

  return DEFAULT_ALERT_DURATION_SECONDS[status] ?? Number.POSITIVE_INFINITY;
}

function shouldTriggerAlert(status, durationSeconds) {
  if (status !== 'warning' && status !== 'danger') {
    return false;
  }

  return durationSeconds >= getAlertThresholdSeconds(status);
}

function buildAlertMessage(status, durationSeconds) {
  if (status === 'danger') {
    return `Danger posture detected for ${durationSeconds} seconds. Please correct your posture now.`;
  }

  return `Warning posture detected for ${durationSeconds} seconds. Please adjust your posture.`;
}

async function createNotification(userId, status, message) {
  const result = await run(
    'INSERT INTO Notifications (user_id, status, message) VALUES (?, ?, ?)',
    [userId, status, message]
  );

  return result.lastID;
}

async function triggerAlertIfNeeded(userId, status, durationSeconds) {
  if (!shouldTriggerAlert(status, durationSeconds)) {
    return {
      triggered: false,
      threshold_seconds: getAlertThresholdSeconds(status),
    };
  }

  const message = buildAlertMessage(status, durationSeconds);
  const notificationId = await createNotification(userId, status, message);

  try {
    const pushResult = await sendPushNotificationToUser(userId, {
      title: ALERT_TITLES[status],
      body: message,
    });

    return {
      triggered: true,
      threshold_seconds: getAlertThresholdSeconds(status),
      notification_id: notificationId,
      push: pushResult,
    };
  } catch (error) {
    return {
      triggered: true,
      threshold_seconds: getAlertThresholdSeconds(status),
      notification_id: notificationId,
      push: {
        delivered: false,
        reason: 'push_error',
        error: error.message,
      },
    };
  }
}

exports.createPostureLog = async (req, res) => {
  const userId = req.user.id;
  const { status, duration_seconds, recorded_at } = req.body;

  if (!ALLOWED_STATUS.includes(status)) {
    return res.status(400).json({
      message: 'status must be one of normal, warning, or danger.',
    });
  }

  const normalizedDurationSeconds = normalizeDurationSeconds(duration_seconds);

  if (normalizedDurationSeconds === null) {
    return res.status(400).json({
      message: 'duration_seconds must be a number greater than or equal to 0.',
    });
  }

  const normalizedRecordedAt = normalizeRecordedAt(recorded_at);

  if (recorded_at !== undefined && normalizedRecordedAt === null) {
    return res.status(400).json({
      message: 'recorded_at must be a valid datetime string.',
    });
  }

  const insertSql = normalizedRecordedAt
    ? `INSERT INTO PostureLogs (user_id, status, duration_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    : `INSERT INTO PostureLogs (user_id, status, duration_seconds)
       VALUES (?, ?, ?)`;

  const insertValues = normalizedRecordedAt
    ? [userId, status, normalizedDurationSeconds, normalizedRecordedAt, normalizedRecordedAt]
    : [userId, status, normalizedDurationSeconds];

  try {
    const insertResult = await run(insertSql, insertValues);
    const row = await get(
      `SELECT id, user_id, status, duration_seconds, created_at, updated_at
       FROM PostureLogs
       WHERE id = ?`,
      [insertResult.lastID]
    );
    const alert = await triggerAlertIfNeeded(userId, status, normalizedDurationSeconds);

    return res.status(201).json({
      message: 'Posture log saved successfully.',
      data: row,
      alert,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to save posture log.',
      error: error.message,
    });
  }
};
