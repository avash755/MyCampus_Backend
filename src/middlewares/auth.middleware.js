const jwt = require('jsonwebtoken');
const User = require('../db/models/user.model');

async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'mycampus-development-secret');
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: 'Account not found.' });
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
