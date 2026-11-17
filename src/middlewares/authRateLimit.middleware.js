const crypto = require('crypto');
const AuthThrottle = require('../db/models/authThrottle.model');

function digest(value) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(value).digest('hex');
}

async function incrementCounter(key, expiresAt) {
  try {
    return await AuthThrottle.findOneAndUpdate(
      { key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    return AuthThrottle.findOneAndUpdate({ key }, { $inc: { count: 1 } }, { returnDocument: 'after' }).lean();
  }
}

function createAuthRateLimiter({ scope, windowMs, ipLimit, identityLimit }) {
  return async function authRateLimit(req, res, next) {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const expiresAt = new Date(windowStart + windowMs * 2);
    const identities = [
      { value: `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`, limit: ipLimit }
    ];
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email) identities.push({ value: `email:${email}`, limit: identityLimit });

    try {
      let limited = false;
      for (const identity of identities) {
        const key = `${scope}:${Math.floor(now / windowMs)}:${digest(identity.value)}`;
        const counter = await incrementCounter(key, expiresAt);
        if (counter.count > identity.limit) limited = true;
      }
      if (limited) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000))));
        return res.status(429).json({ message: 'Too many attempts. Please wait a little while and try again.' });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { createAuthRateLimiter };
