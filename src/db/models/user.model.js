const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  studentId: { type: String, trim: true, default: '' },
  department: { type: String, trim: true, default: '' },
  avatarColor: { type: String, default: '#6d65e8' },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['student', 'admin'], default: 'student' },
  isVerified: { type: Boolean, default: false },
  verificationTokenHash: { type: String, select: false, default: null },
  verificationTokenPurpose: { type: String, enum: ['email', 'password'], select: false, default: null },
  verificationTokenExpireAt: { type: Date, select: false, default: null },
  resetTokenHash: { type: String, select: false, default: null },
  resetTokenExpireAt: { type: Date, select: false, default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
