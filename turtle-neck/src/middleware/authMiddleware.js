const jwt = require('jsonwebtoken');

const { getJwtSecret } = require('../config/jwt');

const JWT_SECRET = getJwtSecret();

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication token is required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token.' });
    }

    req.user = decoded;
    next();
  });
}

module.exports = authenticateToken;
