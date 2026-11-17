const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth.routes');
const eventRoutes = require('./routes/event.routes');
const postRoutes = require('./routes/post.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const notificationRoutes = require('./routes/notification.routes');
const memberRoutes = require('./routes/member.routes');
const moduleRoutes = require('./routes/module.routes');

const app = express();
const configuredProxyHops = process.env.TRUST_PROXY_HOPS;
app.set('trust proxy', configuredProxyHops === undefined
  ? (process.env.NODE_ENV === 'production' ? 1 : false)
  : Number(configuredProxyHops));
function normalizeOrigin(value) {
  try { return new URL(value).origin; }
  catch { return String(value || '').replace(/\/+$/, ''); }
}

const allowedOrigins = [
  ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173']),
  ...(process.env.CLIENT_URL || '').split(',').map((origin) => origin.trim()).filter(Boolean)
].map(normalizeOrigin);

app.disable('x-powered-by');
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && !allowedOrigins.includes(normalizeOrigin(origin))) {
    return res.status(403).json({ message: 'This website origin is not allowed.' });
  }
  next();
});
app.use(cors({
  credentials: true,
  origin(origin, callback) { callback(null, !origin || allowedOrigins.includes(normalizeOrigin(origin))); }
}));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  next();
});
app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method) || (!req.cookies?.token && !req.cookies?.resetToken)) return next();
  const origin = req.get('origin');
  if (!origin || !allowedOrigins.includes(normalizeOrigin(origin))) {
    return res.status(403).json({ message: 'The request origin could not be verified.' });
  }
  next();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', app: 'MyCampus API' }));
app.get('/api/ready', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready' });
});
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/modules', moduleRoutes);

app.use((req, res) => res.status(404).json({ message: 'That API route was not found.' }));
app.use((err, req, res, next) => {
  const status = err.status || (err.name === 'ValidationError' || err.name === 'CastError' ? 400 : 500);
  if (status >= 500) console.error(`${req.method} ${req.path} failed:`, err.message);
  const message = status >= 500 ? 'Something went wrong. Please try again.' : (err.message || 'The request could not be completed.');
  res.status(status).json({ message });
});

module.exports = app;


