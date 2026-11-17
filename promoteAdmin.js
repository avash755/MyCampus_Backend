require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const User = require('./src/db/models/user.model');

async function promoteAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) throw new Error('Set ADMIN_EMAIL to the verified account to promote.');
  await connectDB();
  const user = await User.findOne({ email });
  if (!user) throw new Error('No account exists for ADMIN_EMAIL. Create and verify the account first.');
  if (!user.isVerified) throw new Error('Verify this account email before promoting it to admin.');
  user.role = 'admin';
  await user.save();
  console.log(`${user.email} now has the admin role.`);
}

promoteAdmin()
  .catch((err) => { console.error('Could not promote admin:', err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
