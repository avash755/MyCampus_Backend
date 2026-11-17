const jwt = require('jsonwebtoken');
const User = require('../db/models/user.model');

async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = req.cookies?.token || (header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });

  try {
    if (!process.env.JWT_SECRET) return res.status(503).json({ message: 'Authentication is not configured.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select('+tokenVersion');
    if (!user) return res.status(401).json({ message: 'Account not found.' });
    if (Number(payload.tokenVersion || 0) !== Number(user.tokenVersion || 0)) {
      return res.status(401).json({ message: 'Your session is no longer valid. Please sign in again.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Administrator access is required.' });
  }
  next();
}

module.exports = { protect, requireAdmin };
