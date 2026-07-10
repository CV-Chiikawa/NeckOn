const { db } = require('../config/db');
const admin = require('../config/firebaseAdmin');

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows);
    });
  });
}

async function sendPushNotificationToUser(userId, { title, body }) {
  const rows = await all('SELECT fcm_token FROM UserDevices WHERE user_id = ?', [userId]);

  if (!rows.length) {
    return {
      delivered: false,
      reason: 'no_devices',
      successCount: 0,
      failureCount: 0,
    };
  }

  if (!admin.isFirebaseConfigured()) {
    return {
      delivered: false,
      reason: 'not_configured',
      successCount: 0,
      failureCount: 0,
    };
  }

  const response = await admin.messaging().sendEachForMulticast({
    tokens: rows.map((row) => row.fcm_token),
    notification: {
      title,
      body,
    },
  });

  return {
    delivered: response.successCount > 0,
    reason: response.successCount > 0 ? null : 'delivery_failed',
    successCount: response.successCount,
    failureCount: response.failureCount,
  };
}

module.exports = {
  sendPushNotificationToUser,
};
