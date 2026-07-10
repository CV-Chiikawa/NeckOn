const bcrypt = require('bcrypt');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');

const { db } = require('../config/db');
const { getJwtSecret } = require('../config/jwt');

const JWT_SECRET = getJwtSecret();
const PROFILE_UPLOAD_PREFIX = '/uploads/profiles/';
const PROFILE_UPLOAD_DIR = path.join(__dirname, '../../public/uploads/profiles');

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

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

exports.register = async (req, res) => {
  try {
    const { username, email, password, nickname } = req.body;
    const snapshotConsent = req.body.snapshot_consent === 'true' ? 1 : 0;

    const profileImage = req.file
      ? `${PROFILE_UPLOAD_PREFIX}${req.file.filename}`
      : null;

    if (!username || !email || !password) {
      safelyDeleteProfileImage(profileImage);
      return res.status(400).json({
        message: 'username, email, password are required.',
      });
    }

    if (password.length < 6) {
      safelyDeleteProfileImage(profileImage);
      return res.status(400).json({
        message: 'Password must be at least 6 characters long.',
      });
    }

    db.get('SELECT id FROM Users WHERE email = ?', [email], async (err, row) => {
      if (err) {
        safelyDeleteProfileImage(profileImage);
        return res.status(500).json({
          message: 'Failed to check for existing user.',
          error: err.message,
        });
      }

      if (row) {
        safelyDeleteProfileImage(profileImage);
        return res.status(409).json({
          message: 'Email is already in use.',
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      db.run(
        `INSERT INTO Users (username, email, password, nickname, profile_image, snapshot_consent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [username, email, hashedPassword, nickname || null, profileImage, snapshotConsent],
        function onInsert(insertErr) {
          if (insertErr) {
            safelyDeleteProfileImage(profileImage);

            if (
              insertErr.code === 'SQLITE_CONSTRAINT' ||
              insertErr.code === 'SQLITE_CONSTRAINT_UNIQUE'
            ) {
              return res.status(409).json({
                message: 'Email is already in use.',
              });
            }

            return res.status(500).json({
              message: 'Failed to register user.',
              error: insertErr.message,
            });
          }

          const user = {
            id: this.lastID,
            username,
            email,
            nickname: nickname || null,
            profile_image: profileImage,
            snapshot_consent: Boolean(snapshotConsent),
          };

          const token = generateToken(user);

          return res.status(201).json({
            message: 'User registered successfully.',
            user,
            token,
          });
        }
      );
    });
  } catch (error) {
    safelyDeleteProfileImage(req.file ? `${PROFILE_UPLOAD_PREFIX}${req.file.filename}` : null);
    return res.status(500).json({
      message: 'Server error occurred.',
      error: error.message,
    });
  }
};

exports.login = (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'email and password are required.',
      });
    }

    db.get('SELECT * FROM Users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        return res.status(500).json({
          message: 'Failed to login.',
          error: err.message,
        });
      }

      if (!user) {
        return res.status(401).json({
          message: 'Email or password is invalid.',
        });
      }

      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(401).json({
          message: 'Email or password is invalid.',
        });
      }

      const token = generateToken(user);

      return res.status(200).json({
        message: 'Login successful.',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
        },
        token,
      });
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Server error occurred.',
      error: error.message,
    });
  }
};

exports.me = (req, res) => {
  return res.status(200).json({
    message: 'Authentication successful.',
    user: req.user,
  });
};
