const fs = require('fs');
const path = require('path');

const { db } = require('../config/db');

const SNAPSHOT_UPLOAD_PREFIX = '/uploads/snapshots/';
const SNAPSHOT_UPLOAD_DIR = path.join(__dirname, '../../public/uploads/snapshots');
const MAX_SNAPSHOT_COUNT = 30;

function safelyDeleteSnapshot(snapshotPath) {
  if (
    !snapshotPath ||
    typeof snapshotPath !== 'string' ||
    !snapshotPath.startsWith(SNAPSHOT_UPLOAD_PREFIX)
  ) {
    return;
  }

  const fileName = path.basename(snapshotPath);
  const absolutePath = path.join(SNAPSHOT_UPLOAD_DIR, fileName);

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

exports.listSnapshots = (req, res) => {
  db.get(
    `SELECT snapshot_consent
     FROM Users
     WHERE id = ?`,
    [req.user.id],
    (userErr, user) => {
      if (userErr) {
        return res.status(500).json({
          message: 'Failed to fetch snapshot consent.',
          error: userErr.message,
        });
      }

      if (!user) {
        return res.status(404).json({
          message: 'User not found.',
        });
      }

      if (!Boolean(user.snapshot_consent)) {
        return res.status(403).json({
          message: 'Snapshot consent is required before viewing images.',
          code: 'SNAPSHOT_CONSENT_REQUIRED',
        });
      }

      return db.all(
        `SELECT id, image_path, created_at
         FROM Snapshots
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC`,
        [req.user.id],
        (err, rows) => {
          if (err) {
            return res.status(500).json({
              message: 'Failed to fetch snapshots.',
              error: err.message,
            });
          }

          return res.status(200).json({
            message: 'Snapshots fetched successfully.',
            data: rows,
          });
        }
      );
    }
  );
};

exports.createSnapshot = (req, res) => {
  const uploadedSnapshot = req.file
    ? `${SNAPSHOT_UPLOAD_PREFIX}${req.file.filename}`
    : null;

  if (!uploadedSnapshot) {
    return res.status(400).json({
      message: 'snapshot_image is required.',
    });
  }

  db.get(
    `SELECT snapshot_consent
     FROM Users
     WHERE id = ?`,
    [req.user.id],
    (userErr, user) => {
      if (userErr) {
        safelyDeleteSnapshot(uploadedSnapshot);
        return res.status(500).json({
          message: 'Failed to fetch snapshot consent.',
          error: userErr.message,
        });
      }

      if (!user) {
        safelyDeleteSnapshot(uploadedSnapshot);
        return res.status(404).json({
          message: 'User not found.',
        });
      }

      if (!Boolean(user.snapshot_consent)) {
        safelyDeleteSnapshot(uploadedSnapshot);
        return res.status(403).json({
          message: 'Snapshot consent is required before saving images.',
        });
      }

      return db.run(
        `INSERT INTO Snapshots (user_id, image_path)
         VALUES (?, ?)`,
        [req.user.id, uploadedSnapshot],
        function onInsert(insertErr) {
          if (insertErr) {
            safelyDeleteSnapshot(uploadedSnapshot);
            return res.status(500).json({
              message: 'Failed to save snapshot.',
              error: insertErr.message,
            });
          }

          const createdSnapshotId = this.lastID;

          return db.all(
            `SELECT id, image_path
             FROM Snapshots
             WHERE user_id = ?
             ORDER BY created_at ASC, id ASC`,
            [req.user.id],
            (listErr, rows) => {
              if (listErr) {
                return res.status(500).json({
                  message: 'Failed to enforce snapshot retention policy.',
                  error: listErr.message,
                });
              }

              const overflowRows = rows.slice(
                0,
                Math.max(rows.length - MAX_SNAPSHOT_COUNT, 0)
              );

              if (overflowRows.length === 0) {
                return res.status(201).json({
                  message: 'Snapshot saved successfully.',
                  data: {
                    id: createdSnapshotId,
                    image_path: uploadedSnapshot,
                  },
                });
              }

              const overflowIds = overflowRows.map((row) => row.id);
              const overflowPlaceholders = overflowIds.map(() => '?').join(', ');

              return db.run(
                `DELETE FROM Snapshots
                 WHERE user_id = ?
                   AND id IN (${overflowPlaceholders})`,
                [req.user.id, ...overflowIds],
                (deleteErr) => {
                  if (deleteErr) {
                    return res.status(500).json({
                      message: 'Failed to prune old snapshots.',
                      error: deleteErr.message,
                    });
                  }

                  overflowRows.forEach((row) =>
                    safelyDeleteSnapshot(row.image_path)
                  );

                  return res.status(201).json({
                    message: 'Snapshot saved successfully.',
                    data: {
                      id: createdSnapshotId,
                      image_path: uploadedSnapshot,
                    },
                  });
                }
              );
            }
          );
        }
      );
    }
  );
};

exports.deleteSnapshots = (req, res) => {
  const ids = Array.isArray(req.body.ids)
    ? req.body.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  if (ids.length === 0) {
    return res.status(400).json({
      message: 'At least one snapshot id is required.',
    });
  }

  const placeholders = ids.map(() => '?').join(', ');

  db.all(
    `SELECT id, image_path
     FROM Snapshots
     WHERE user_id = ?
       AND id IN (${placeholders})`,
    [req.user.id, ...ids],
    (selectErr, rows) => {
      if (selectErr) {
        return res.status(500).json({
          message: 'Failed to fetch snapshots for deletion.',
          error: selectErr.message,
        });
      }

      const matchedIds = rows.map((row) => row.id);

      if (matchedIds.length === 0) {
        return res.status(200).json({
          message: 'No snapshots were deleted.',
          data: {
            deleted_ids: [],
          },
        });
      }

      const matchedPlaceholders = matchedIds.map(() => '?').join(', ');

      return db.run(
        `DELETE FROM Snapshots
         WHERE user_id = ?
           AND id IN (${matchedPlaceholders})`,
        [req.user.id, ...matchedIds],
        (deleteErr) => {
          if (deleteErr) {
            return res.status(500).json({
              message: 'Failed to delete snapshots.',
              error: deleteErr.message,
            });
          }

          rows.forEach((row) => safelyDeleteSnapshot(row.image_path));

          return res.status(200).json({
            message: 'Snapshots deleted successfully.',
            data: {
              deleted_ids: matchedIds,
            },
          });
        }
      );
    }
  );
};
