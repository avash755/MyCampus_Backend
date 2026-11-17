const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  studentId: { type: String, trim: true, default: '' },
  department: { type: String, trim: true, default: '' },
  avatarColor: { type: String, default: '#08754f' },
  profileImage: { type: String, default: '', select: false, maxlength: 800000 },
  coverImage: { type: String, default: '', select: false, maxlength: 1800000 },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['student', 'admin'], default: 'student' },
  isVerified: { type: Boolean, default: false },
  verificationTokenHash: { type: String, select: false, default: null },
  verificationTokenPurpose: { type: String, enum: ['email', 'password'], select: false, default: null },
  verificationTokenExpireAt: { type: Date, select: false, default: null },
  verificationTokenAttempts: { type: Number, default: 0, min: 0, max: 5, select: false },
  resetTokenHash: { type: String, select: false, default: null },
  resetTokenExpireAt: { type: Date, select: false, default: null },
  tokenVersion: { type: Number, default: 0, min: 0, select: false }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
