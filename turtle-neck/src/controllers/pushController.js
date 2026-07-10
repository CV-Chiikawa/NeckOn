const { sendPushNotificationToUser } = require('../services/pushService');

exports.sendPushToUser = async (req, res) => {
  const requesterUserId = Number(req.user.id);
  const targetUserId = Number(req.body.user_id);
  const { title, body } = req.body;

  if (!targetUserId || !title || !body) {
    return res.status(400).json({
      message: 'user_id, title, and body are required.',
    });
  }

  if (targetUserId !== requesterUserId) {
    return res.status(403).json({
      message: 'You can only send push notifications to your own devices.',
    });
  }

  try {
    const result = await sendPushNotificationToUser(targetUserId, { title, body });

    if (!result.delivered && result.reason === 'no_devices') {
      return res.status(404).json({
        message: 'No registered device tokens were found for this user.',
      });
    }

    if (!result.delivered && result.reason === 'not_configured') {
      return res.status(503).json({
        message: 'Push notifications are not configured on this server.',
      });
    }

    if (!result.delivered && result.reason === 'delivery_failed') {
      return res.status(502).json({
        message: 'Firebase accepted the request, but no device received the push notification.',
        successCount: result.successCount,
        failureCount: result.failureCount,
      });
    }

    return res.status(200).json({
      message: 'Push notification sent successfully.',
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
  } catch (error) {
    return res.status(500).json({
      message:
        error.message &&
        error.message.includes('Firebase service account is required')
          ? 'Push is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or add serviceAccountKey.json.'
          : 'Failed to send push notification.',
      error: error.message,
    });
  }
};
