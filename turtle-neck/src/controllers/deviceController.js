// 사용자 기기(FCM토큰) 관련 컨트롤러

const { db } = require('../config/db');

// 기기 등록 및 정보 갱신 기능을 구현한 컨트롤러
exports.registerDevice = (req, res) => {
  const userId = req.user.id;
  const { device_type, fcm_token } = req.body;

  if (!device_type || !fcm_token) {
    return res.status(400).json({
      message: 'device_type, fcm_token은 필수입니다.',
    });
  }

  const allowedTypes = ['web', 'android', 'ios'];
  if (!allowedTypes.includes(device_type)) {
    return res.status(400).json({
      message: 'device_type은 web, android, ios 중 하나여야 합니다.',
    });
  }

  db.get(
    'SELECT * FROM UserDevices WHERE fcm_token = ?',
    [fcm_token],
    (selectErr, row) => {
      if (selectErr) {
        return res.status(500).json({
          message: '기기 조회 실패',
          error: selectErr.message,
        });
      }

      if (row) {
        db.run(
          `UPDATE UserDevices
           SET user_id = ?, device_type = ?, updated_at = CURRENT_TIMESTAMP
           WHERE fcm_token = ?`,
          [userId, device_type, fcm_token],
          function (updateErr) {
            if (updateErr) {
              return res.status(500).json({
                message: '기기 정보 갱신 실패',
                error: updateErr.message,
              });
            }

            return res.status(200).json({
              message: '기기 정보 갱신 성공',
            });
          }
        );
      } else {
        db.run(
          `INSERT INTO UserDevices (user_id, device_type, fcm_token)
           VALUES (?, ?, ?)`,
          [userId, device_type, fcm_token],
          function (insertErr) {
            if (insertErr) {
              return res.status(500).json({
                message: '기기 등록 실패',
                error: insertErr.message,
              });
            }

            return res.status(201).json({
              message: '기기 등록 성공',
              deviceId: this.lastID,
            });
          }
        );
      }
    }
  );
};


// 사용자 기기 목록 조회 기능을 구현한 컨트롤러
exports.getDevices = (req, res) => {
  const userId = req.user.id;

  db.all(
    `SELECT id, user_id, device_type, fcm_token, created_at, updated_at
     FROM UserDevices
     WHERE user_id = ?
     ORDER BY updated_at DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          message: '기기 조회 실패',
          error: err.message,
        });
      }

      return res.status(200).json(rows);
    }
  );
};


// 사용자 기기 삭제 기능을 구현한 컨트롤러
exports.deleteDevice = (req, res) => {
  const userId = req.user.id;
  const { fcm_token } = req.body;

  if (!fcm_token) {
    return res.status(400).json({
      message: 'fcm_token은 필수입니다.',
    });
  }

  db.run(
    'DELETE FROM UserDevices WHERE user_id = ? AND fcm_token = ?',
    [userId, fcm_token],
    function (err) {
      if (err) {
        return res.status(500).json({
          message: '기기 삭제 실패',
          error: err.message,
        });
      }

      return res.status(200).json({
        message: '기기 삭제 성공',
        deletedCount: this.changes,
      });
    }
  );
};