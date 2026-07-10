const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const { db } = require('../config/db');

const PROFILE_UPLOAD_PREFIX = '/uploads/profiles/';
const PROFILE_UPLOAD_DIR = path.join(__dirname, '../../public/uploads/profiles');

function safelyDeleteProfileImage(profileImagePath) {
  if (
    !profileImagePath ||
    typeof profileImagePath !== 'string' ||
    !profileImagePath.startsWith(PROFILE_UPLOAD_PREFIX)
  ) {
    return;
  }

  const fileName = path.basename(profileImagePath);
  const absolutePath = path.join(PROFILE_UPLOAD_DIR, fileName);

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

exports.updateMyProfile = (req, res) => {
  const userId = req.user.id;
  const { password } = req.body;
  const nickname =
    req.body.nickname !== undefined ? String(req.body.nickname).trim() : undefined;
  const snapshotConsent =
    req.body.snapshot_consent !== undefined
      ? req.body.snapshot_consent === 'true' || req.body.snapshot_consent === true
      : undefined;
  const uploadedProfileImage = req.file
    ? `${PROFILE_UPLOAD_PREFIX}${req.file.filename}`
    : undefined;

  db.get(
    `SELECT id, profile_image
     FROM Users
     WHERE id = ?`,
    [userId],
    async (selectErr, existingUser) => {
      if (selectErr) {
        if (uploadedProfileImage) {
          safelyDeleteProfileImage(uploadedProfileImage);
        }

        return res.status(500).json({
          message: 'Failed to fetch current user profile.',
          error: selectErr.message,
        });
      }

      if (!existingUser) {
        if (uploadedProfileImage) {
          safelyDeleteProfileImage(uploadedProfileImage);
        }

        return res.status(404).json({
          message: 'User not found.',
        });
      }

      const fields = [];
      const values = [];

      try {
        if (password) {
          if (password.length < 6) {
            if (uploadedProfileImage) {
              safelyDeleteProfileImage(uploadedProfileImage);
            }

            return res.status(400).json({
              message: 'Password must be at least 6 characters long.',
            });
          }

          const hashedPassword = await bcrypt.hash(password, 10);
          fields.push('password = ?');
          values.push(hashedPassword);
        }

        if (nickname !== undefined) {
          fields.push('nickname = ?');
          values.push(nickname || null);
        }

        if (uploadedProfileImage !== undefined) {
          fields.push('profile_image = ?');
          values.push(uploadedProfileImage);
        }

        if (snapshotConsent !== undefined) {
          fields.push('snapshot_consent = ?');
          values.push(snapshotConsent ? 1 : 0);
        }

        if (fields.length === 0) {
          if (uploadedProfileImage) {
            safelyDeleteProfileImage(uploadedProfileImage);
          }

          return res.status(400).json({
            message: 'No profile fields were provided to update.',
          });
        }

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(userId);

        db.run(
          `UPDATE Users SET ${fields.join(', ')} WHERE id = ?`,
          values,
          function onUpdate(err) {
            if (err) {
              if (uploadedProfileImage) {
                safelyDeleteProfileImage(uploadedProfileImage);
              }

              return res.status(500).json({
                message: 'Failed to update user profile.',
                error: err.message,
              });
            }

            if (this.changes === 0) {
              if (uploadedProfileImage) {
                safelyDeleteProfileImage(uploadedProfileImage);
              }

              return res.status(404).json({
                message: 'User not found.',
              });
            }

            if (
              uploadedProfileImage &&
              existingUser.profile_image &&
              existingUser.profile_image !== uploadedProfileImage
            ) {
              safelyDeleteProfileImage(existingUser.profile_image);
            }

            return db.get(
              `SELECT id, username, email, nickname, profile_image, snapshot_consent, created_at, updated_at
               FROM Users
               WHERE id = ?`,
              [userId],
              (finalSelectErr, row) => {
                if (finalSelectErr) {
                  return res.status(500).json({
                    message: 'Failed to fetch updated user profile.',
                    error: finalSelectErr.message,
                  });
                }

                return res.status(200).json({
                  message: 'User profile updated successfully.',
                  data: {
                    ...row,
                    snapshot_consent: Boolean(row.snapshot_consent),
                  },
                });
              }
            );
          }
        );
      } catch (error) {
        if (uploadedProfileImage) {
          safelyDeleteProfileImage(uploadedProfileImage);
        }

        return res.status(500).json({
          message: 'Server error occurred while updating the profile.',
          error: error.message,
        });
      }
    }
  );
};

exports.getMyProfile = (req, res) => {
  const userId = req.user.id;

  db.get(
    `SELECT id, username, email, nickname, profile_image, snapshot_consent, created_at, updated_at
     FROM Users
     WHERE id = ?`,
    [userId],
    (err, row) => {
      if (err) {
        return res.status(500).json({
          message: 'Failed to fetch user profile.',
          error: err.message,
        });
      }

      if (!row) {
        return res.status(404).json({
          message: 'User not found.',
        });
      }

      return res.status(200).json({
        message: 'User profile fetched successfully.',
        data: {
          ...row,
          snapshot_consent: Boolean(row.snapshot_consent),
        },
      });
    }
  );
};
