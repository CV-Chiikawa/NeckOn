// 알림 관련 컨트롤러

const { db } = require('../config/db');


// 알림 저장 및 조회 기능을 구현한 컨트롤러
exports.createNotification = (req, res) => {
  const userId = req.user.id;
  const { status, message } = req.body;

  if (!status || !message) {
    return res.status(400).json({
      message: 'status, message는 필수입니다.',
    });
  }

  db.run(
    'INSERT INTO Notifications (user_id, status, message) VALUES (?, ?, ?)',
    [userId, status, message],
    function (err) {
      if (err) {
        return res.status(500).json({
          message: '알림 저장 실패',
          error: err.message,
        });
      }

      return res.status(201).json({
        message: '알림 저장 성공',
        notificationId: this.lastID,
      });
    }
  );
};


// 사용자 알림 목록 조회
exports.getNotifications = (req, res) => {
  const userId = req.user.id;

  db.all(
    `SELECT * FROM Notifications
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          message: '알림 조회 실패',
          error: err.message,
        });
      }

      return res.status(200).json(rows);
    }
  );
};