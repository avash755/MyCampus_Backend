const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const User = require('../db/models/user.model');
const CampusPost = require('../db/models/campusPost.model');
const Event = require('../db/models/event.model');

const { sendCodeEmail } = require('../services/email.service');

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const makeCode = () => String(crypto.randomInt(100000, 1000000));
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function createToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function safeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    studentId: user.studentId,
    avatarColor: user.avatarColor,
    isVerified: user.isVerified
  };
}

function sessionCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/'
  };
}

function resetCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 10 * 60 * 1000,
    path: '/'
  };
}

async function register(req, res, next) {
  try {
    const { name, email, password, department, studentId } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required.' });
    }
    if (password.length < 7) { /// I Changed
      return res.status(400).json({ message: 'Use a password with at least 7 characters.' }); 
    }

    const normalizedEmail = email.toLowerCase().trim();
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) return res.status(409).json({ message: 'An account with this email already exists.' });

    const code = makeCode();
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 11),
      department: department || '',
      studentId: studentId || '',
      verificationTokenHash: hash(code),
      verificationTokenPurpose: 'email',
      verificationTokenExpireAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    let emailSent = true;
    try {
      await sendCodeEmail({ email: user.email, name: user.name, code, purpose: 'email' });
    } catch (emailError) {
      emailSent = false;
      console.error('Verification email could not be sent:', emailError.message);
    }
    res.status(201).json({
      message: emailSent
        ? 'Check your email for a six-digit verification code.'
        : 'Your account was created, but the verification email could not be sent. Fix email delivery, then request a new code.',
      email: user.email,
      emailSent
    });
  } catch (err) {
    next(err);
  }
}

async function sendOtp(req, res, next) {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'No account was found for that email.' });
    if (user.isVerified) return res.status(400).json({ message: 'This email is already verified. Please sign in.' });

    const code = makeCode();
    user.verificationTokenHash = hash(code);
    user.verificationTokenPurpose = 'email';
    user.verificationTokenExpireAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();
    await sendCodeEmail({ email: user.email, name: user.name, code, purpose: 'email' });
    res.json({ message: 'A new verification code has been sent.' });
  } catch (err) {
    next(err);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const code = String(req.body.code || '').trim();
    const user = await User.findOne({
      email,
      isVerified: false,
      verificationTokenHash: hash(code),
      verificationTokenPurpose: 'email',
      verificationTokenExpireAt: { $gt: new Date() }
    }).select('+verificationTokenHash +verificationTokenPurpose +verificationTokenExpireAt');
    if (!user) return res.status(400).json({ message: 'That code is invalid or has expired. Request a new one and try again.' });

    user.isVerified = true;
    user.verificationTokenHash = null;
    user.verificationTokenPurpose = null;
    user.verificationTokenExpireAt = null;
    await user.save();
    res.cookie('token', createToken(user), sessionCookieOptions());
    res.json({ user: safeUser(user), message: 'Your email is verified.' });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase().trim() }).select('+password');
    if (!user || !(await bcrypt.compare(password || '', user.password))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    if (!user.isVerified) {
      return res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email before signing in.' });
    }
    res.cookie('token', createToken(user), sessionCookieOptions());
    res.json({ user: safeUser(user) });
  } catch (err) {
    next(err);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const user = await User.findOne({ email, isVerified: true });
    if (user) {
      const code = makeCode();
      user.verificationTokenHash = hash(code);
      user.verificationTokenPurpose = 'password';
      user.verificationTokenExpireAt = new Date(Date.now() + 10 * 60 * 1000);
      user.resetTokenHash = null;
      user.resetTokenExpireAt = null;
      await user.save();
      await sendCodeEmail({ email: user.email, name: user.name, code, purpose: 'password' });
    }
    res.json({ message: 'If a verified account uses that email, a password reset code has been sent.' });
  } catch (err) {
    next(err);
  }
}

async function verifyResetCode(req, res, next) {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const code = String(req.body.code || '').trim();
    const user = await User.findOne({
      email,
      isVerified: true,
      verificationTokenHash: hash(code),
      verificationTokenPurpose: 'password',
      verificationTokenExpireAt: { $gt: new Date() }
    }).select('+verificationTokenHash +verificationTokenPurpose +verificationTokenExpireAt');
    if (!user) return res.status(400).json({ message: 'That code is invalid or has expired. Request a new one and try again.' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.verificationTokenHash = null;
    user.verificationTokenPurpose = null;
    user.verificationTokenExpireAt = null;
    user.resetTokenHash = hash(resetToken);
    user.resetTokenExpireAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    res.cookie('resetToken', resetToken, resetCookieOptions());
    res.json({ message: 'Code verified. Choose a new password.' });
  } catch (err) {
    next(err);
  }
}

async function newPassword(req, res, next) {
  try {
    const password = req.body.password || '';
    if (password.length < 8) return res.status(400).json({ message: 'Use a password with at least 8 characters.' });
    const resetToken = req.cookies?.resetToken;
    if (!resetToken) return res.status(400).json({ message: 'Your reset session expired. Request a new code.' });
    const user = await User.findOne({
      resetTokenHash: hash(resetToken),
      resetTokenExpireAt: { $gt: new Date() }
    }).select('+password +resetTokenHash +resetTokenExpireAt');
    if (!user) return res.status(400).json({ message: 'Your reset session expired. Request a new code.' });

    user.password = await bcrypt.hash(password, 11);
    user.resetTokenHash = null;
    user.resetTokenExpireAt = null;
    await user.save();
    const { maxAge, ...cookieOptions } = resetCookieOptions();
    res.clearCookie('resetToken', cookieOptions);
    res.json({ message: 'Your password has been updated. You can sign in now.' });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  res.json({ user: safeUser(req.user) });
}

function logout(req, res) {
  const { maxAge, ...cookieOptions } = sessionCookieOptions();
  res.clearCookie('token', cookieOptions);
  res.json({ message: 'You have been signed out.' });
}

async function updateMe(req, res, next) {
  try {
    const { name, department, studentId } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: 'Name cannot be blank.' });
      req.user.name = String(name).trim();
    }
    if (department !== undefined) req.user.department = String(department).trim();
    if (studentId !== undefined) req.user.studentId = String(studentId).trim();
    await req.user.save();
    res.json({ user: safeUser(req.user) });
  } catch (err) {
    next(err);
  }
}

async function deleteMe(req, res, next) {
  try {
    const password = req.body.password || '';
    const user = await User.findById(req.user._id).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Enter your current password to delete your account.' });
    }
    if (user.role === 'admin') {
      const otherAdmins = await User.countDocuments({ role: 'admin', _id: { $ne: user._id } });
      if (!otherAdmins) return res.status(400).json({ message: 'Add another administrator before deleting the last admin account.' });
    }
    await Promise.all([
      CampusPost.deleteMany({ author: user._id }),
      Event.deleteMany({ organizer: user._id }),
      Event.updateMany({ attendees: user._id }, { $pull: { attendees: user._id } })
    ]);
    await user.deleteOne();
    res.json({ message: 'Your account and its posts have been deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register, login, logout, me, sendOtp, verifyEmail, forgotPassword, verifyResetCode,
  newPassword, updateMe, deleteMe
};
