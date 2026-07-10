const { db } = require('../config/db');
const calculateLandmarkFeatures = require('../utils/calculateLandmarkFeatures');
const {
  analyzePostureWithAi,
  resetAiPostureSession,
} = require('../services/aiPostureService');
const { sendPushNotificationToUser } = require('../services/pushService');

const WARNING_HEAD_ANGLE_DEGREES = 55;
const DANGER_HEAD_ANGLE_DEGREES = 50;
const HEARTBEAT_STATUS_TO_LOG_STATUS = {
  good: 'normal',
  caution: 'warning',
  bad: 'danger',
};
const BAD_ALERT_TITLE = 'Posture Alert';
const DEFAULT_HEARTBEAT_IDLE_TIMEOUT_SECONDS = 60;

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

function normalizeHeadAngle(angle) {
  const numericAngle = Number(angle);

  if (Number.isNaN(numericAngle)) {
    return null;
  }

  return Number(
    (
      Math.atan2(
        Math.abs(Math.sin((numericAngle * Math.PI) / 180)),
        Math.abs(Math.cos((numericAngle * Math.PI) / 180))
      ) *
      (180 / Math.PI)
    ).toFixed(4)
  );
}

function classifyPostureByAngle(angle) {
  if (angle === null) {
    return 'unknown';
  }

  if (angle <= DANGER_HEAD_ANGLE_DEGREES) {
    return 'danger';
  }

  if (angle <= WARNING_HEAD_ANGLE_DEGREES) {
    return 'warning';
  }

  return 'normal';
}

function isValidHeartbeatStatus(status) {
  return status === 'good' || status === 'caution' || status === 'bad';
}

function getBadAlertThresholdSeconds() {
  const fromEnv = Number(process.env.BAD_ALERT_MIN_DURATION_SECONDS);

  if (Number.isFinite(fromEnv) && fromEnv >= 0) {
    return Math.round(fromEnv);
  }

  return 5;
}

function getHeartbeatIdleTimeoutSeconds() {
  const fromEnv = Number(process.env.HEARTBEAT_IDLE_TIMEOUT_SECONDS);

  if (Number.isFinite(fromEnv) && fromEnv >= 0) {
    return Math.round(fromEnv);
  }

  return DEFAULT_HEARTBEAT_IDLE_TIMEOUT_SECONDS;
}

function getElapsedSeconds(startedAt, endedAt) {
  const startedAtMs = new Date(startedAt).getTime();
  const endedAtMs = new Date(endedAt).getTime();

  if (Number.isNaN(startedAtMs) || Number.isNaN(endedAtMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
}

function isHeartbeatStateStale(state, now) {
  const idleTimeoutSeconds = getHeartbeatIdleTimeoutSeconds();

  if (idleTimeoutSeconds === 0) {
    return false;
  }

  return getElapsedSeconds(state.last_seen_at, now) > idleTimeoutSeconds;
}

async function createNotification(userId, status, message) {
  const result = await run(
    'INSERT INTO Notifications (user_id, status, message) VALUES (?, ?, ?)',
    [userId, status, message]
  );

  return result.lastID;
}

async function savePostureSegment(userId, rawStatus, startedAt, endedAt) {
  const mappedStatus = HEARTBEAT_STATUS_TO_LOG_STATUS[rawStatus];
  const durationSeconds = getElapsedSeconds(startedAt, endedAt);

  if (!mappedStatus || durationSeconds <= 0) {
    return null;
  }

  const result = await run(
    `INSERT INTO PostureLogs (user_id, status, duration_seconds, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, mappedStatus, durationSeconds, endedAt, endedAt]
  );

  return get(
    `SELECT id, user_id, status, duration_seconds, created_at, updated_at
     FROM PostureLogs
     WHERE id = ?`,
    [result.lastID]
  );
}

async function triggerBadAlert(userId, durationSeconds) {
  const message = `Bad posture detected for ${durationSeconds} seconds. Please correct your posture now.`;
  const notificationId = await createNotification(userId, 'danger', message);

  try {
    const push = await sendPushNotificationToUser(userId, {
      title: BAD_ALERT_TITLE,
      body: message,
    });

    return {
      triggered: true,
      notification_id: notificationId,
      threshold_seconds: getBadAlertThresholdSeconds(),
      push,
    };
  } catch (error) {
    return {
      triggered: true,
      notification_id: notificationId,
      threshold_seconds: getBadAlertThresholdSeconds(),
      push: {
        delivered: false,
        reason: 'push_error',
        error: error.message,
      },
    };
  }
}

exports.analyzePosture = (req, res) => {
  const userId = req.user.id;

  let currentFeatures;

  try {
    currentFeatures = calculateLandmarkFeatures(req.body);
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }

  db.get(
    `
      SELECT *
      FROM LandMark
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId],
    async (err, baseline) => {
      if (err) {
        return res.status(500).json({
          message: 'Failed to fetch baseline posture.',
          error: err.message,
        });
      }

      if (!baseline) {
        return res.status(404).json({
          message: 'No baseline posture data found. Save a baseline posture first.',
        });
      }

      const forwardDistanceDiff =
        currentFeatures.forward_distance - baseline.forward_distance;
      const noseShoulderDistanceDiff =
        currentFeatures.nose_shoulder_distance - baseline.nose_shoulder_distance;

      const currentHeadAngle = normalizeHeadAngle(currentFeatures.head_angle);
      const baselineHeadAngle = normalizeHeadAngle(baseline.head_angle);
      const headAngleDiff =
        baselineHeadAngle === null
          ? null
          : Number((currentHeadAngle - baselineHeadAngle).toFixed(4));

      const status = classifyPostureByAngle(currentHeadAngle);
      let ai = null;
      let aiError = null;

      try {
        ai = await analyzePostureWithAi({
          userId,
          frameDataUrl: req.body?.frame_data_url,
        });
      } catch (error) {
        aiError = error.message;
      }

      const finalStatus = ai?.status || status;

      return res.status(200).json({
        message: 'Posture analyzed successfully.',
        data: {
          source: ai?.status ? 'external-ai' : 'simple-rule',
          current: currentFeatures,
          baseline: {
            forward_distance: baseline.forward_distance,
            nose_shoulder_distance: baseline.nose_shoulder_distance,
            head_angle: baselineHeadAngle,
          },
          diff: {
            forward_distance_diff: Number(forwardDistanceDiff.toFixed(4)),
            nose_shoulder_distance_diff: Number(noseShoulderDistanceDiff.toFixed(4)),
            head_angle_diff: headAngleDiff,
          },
          thresholds: {
            warning_head_angle_max: WARNING_HEAD_ANGLE_DEGREES,
            danger_head_angle_max: DANGER_HEAD_ANGLE_DEGREES,
          },
          angle_assessment: {
            current_head_angle: currentHeadAngle,
            baseline_head_angle: baselineHeadAngle,
          },
          status: finalStatus,
          ai: ai
            ? {
                ...ai,
                error: null,
              }
            : {
                enabled: false,
                error: aiError,
              },
          rule_status: status,
        },
      });
    }
  );
};

exports.resetAiBaseline = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await resetAiPostureSession(userId);

    return res.status(200).json({
      message: result.reset
        ? 'AI posture session reset successfully.'
        : 'AI posture service is not enabled.',
      data: result,
    });
  } catch (error) {
    return res.status(502).json({
      message: 'Failed to reset AI posture session.',
      error: error.message,
    });
  }
};

exports.processHeartbeat = async (req, res) => {
  const userId = req.user.id;
  const { status } = req.body;

  if (!isValidHeartbeatStatus(status)) {
    return res.status(400).json({
      message: 'status must be one of good, caution, or bad.',
    });
  }

  const now = new Date().toISOString();

  try {
    const currentState = await get(
      `SELECT id, user_id, current_status, started_at, last_seen_at, alert_sent
       FROM PostureHeartbeatState
       WHERE user_id = ?`,
      [userId]
    );

    if (!currentState) {
      await run(
        `INSERT INTO PostureHeartbeatState
         (user_id, current_status, started_at, last_seen_at, alert_sent, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId, status, now, now]
      );

      return res.status(200).json({
        message: 'Heartbeat state started.',
        data: {
          status,
          previous_segment: null,
          current_duration_seconds: 0,
          alert: {
            triggered: false,
            threshold_seconds: getBadAlertThresholdSeconds(),
          },
        },
      });
    }

    if (isHeartbeatStateStale(currentState, now)) {
      const previousSegment = await savePostureSegment(
        userId,
        currentState.current_status,
        currentState.started_at,
        currentState.last_seen_at
      );

      await run(
        `UPDATE PostureHeartbeatState
         SET current_status = ?, started_at = ?, last_seen_at = ?, alert_sent = 0, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [status, now, now, userId]
      );

      return res.status(200).json({
        message: 'Heartbeat state restarted after idle timeout.',
        data: {
          status,
          previous_segment: previousSegment,
          current_duration_seconds: 0,
          alert: {
            triggered: false,
            threshold_seconds: getBadAlertThresholdSeconds(),
          },
        },
      });
    }

    if (currentState.current_status === status) {
      const currentDurationSeconds = getElapsedSeconds(currentState.started_at, now);
      let alert = {
        triggered: false,
        threshold_seconds: getBadAlertThresholdSeconds(),
      };
      let alertSent = currentState.alert_sent;

      if (
        status === 'bad' &&
        !currentState.alert_sent &&
        currentDurationSeconds >= getBadAlertThresholdSeconds()
      ) {
        alert = await triggerBadAlert(userId, currentDurationSeconds);
        alertSent = 1;
      }

      await run(
        `UPDATE PostureHeartbeatState
         SET last_seen_at = ?, alert_sent = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [now, alertSent, userId]
      );

      return res.status(200).json({
        message: 'Heartbeat processed.',
        data: {
          status,
          previous_segment: null,
          current_duration_seconds: currentDurationSeconds,
          alert,
        },
      });
    }

    const previousSegment = await savePostureSegment(
      userId,
      currentState.current_status,
      currentState.started_at,
      now
    );

    await run(
      `UPDATE PostureHeartbeatState
       SET current_status = ?, started_at = ?, last_seen_at = ?, alert_sent = 0, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [status, now, now, userId]
    );

    return res.status(200).json({
      message: 'Heartbeat processed and previous segment logged.',
      data: {
        status,
        previous_segment: previousSegment,
        current_duration_seconds: 0,
        alert: {
          triggered: false,
          threshold_seconds: getBadAlertThresholdSeconds(),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to process posture heartbeat.',
      error: error.message,
    });
  }
};
