require('dotenv').config();

const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

function validateEnvironment() {
  const issues = [];
  if (!process.env.MONGODB_URI) issues.push('MONGODB_URI is required.');
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) {
    issues.push('JWT_SECRET must contain at least 32 bytes.');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
    issues.push('CLIENT_URL must list the production frontend origin.');
  }
  const emailTransport = process.env.EMAIL_TRANSPORT || (process.env.NODE_ENV === 'production' ? 'brevo' : 'console');
  if (!['brevo', 'console', 'test'].includes(emailTransport)) issues.push('EMAIL_TRANSPORT must be brevo, console, or test.');
  if (process.env.NODE_ENV === 'production' && emailTransport !== 'brevo') {
    issues.push('Production must use the Brevo email transport.');
  }
  if (process.env.NODE_ENV === 'production' && (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL)) {
    issues.push('BREVO_API_KEY and BREVO_SENDER_EMAIL are required when production email uses Brevo.');
  }
  if (process.env.TRUST_PROXY_HOPS !== undefined
      && (!/^\d+$/.test(process.env.TRUST_PROXY_HOPS) || Number(process.env.TRUST_PROXY_HOPS) > 5)) {
    issues.push('TRUST_PROXY_HOPS must be a whole number from 0 to 5.');
  }
  if (issues.length) throw new Error(issues.join(' '));
}

async function start() {
  validateEnvironment();
  await connectDB();
  const server = app.listen(PORT, () => console.log('MyCampus API is running on port ' + PORT));
  const shutdown = async () => {
    server.close(async () => {
      const mongoose = require('mongoose');
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Could not start MyCampus:', err.message);
  process.exit(1);
});
