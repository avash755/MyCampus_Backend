const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const User = require('../db/models/user.model');
const CampusPost = require('../db/models/campusPost.model');
const Event = require('../db/models/event.model');
const Notification = require('../db/models/notification.model');
const ModuleRegistration = require('../db/models/moduleRegistration.model');
const ModuleMessage = require('../db/models/moduleMessage.model');

const { sendCodeEmail } = require('../services/email.service');
const { passwordError, isEmail, pagination } = require('../utils/security');

const hash = (value) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(value).digest('hex');
const makeCode = () => String(crypto.randomInt(100000, 1000000));
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const EMAIL_CODE_TTL_MS = 20 * 60 * 1000;
const RESET_CODE_TTL_MS = 10 * 60 * 1000;

function createToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 },
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
    profileImage: user.profileImage || '',
    coverImage: user.coverImage || '',
    isVerified: user.isVerified
  };
}

function validateProfileImage(value, label, maxBytes) {
  if (typeof value !== 'string') {
    const error = new Error(label + ' must be an image.');
    error.status = 400;
    throw error;
  }
  if (value === '') return '';

  const match = value.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) {
    const error = new Error(label + ' must be uploaded as a JPEG image.');
    error.status = 400;
    throw error;
  }
  if (Buffer.from(match[1], 'base64').length > maxBytes) {
    const error = new Error(label + ' is too large. Choose a smaller image.');
    error.status = 413;
    throw error;
  }
  return value;
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

async function deliverCodeEmail(user, code, purpose) {
  return sendCodeEmail({ email: user.email, name: user.name, code, purpose });
}

async function incrementOtpAttempt(email, purpose) {
  await User.updateOne({
    email,
    verificationTokenPurpose: purpose,
    verificationTokenExpireAt: { $gt: new Date() },
    $or: [
      { verificationTokenAttempts: { $lt: OTP_MAX_ATTEMPTS } },
      { verificationTokenAttempts: { $exists: false } }
    ]
  }, { $inc: { verificationTokenAttempts: 1 } });
}

function otpAttemptFilter() {
  return {
    $or: [
      { verificationTokenAttempts: { $lt: OTP_MAX_ATTEMPTS } },
      { verificationTokenAttempts: { $exists: false } }
    ]
  };
}

async function register(req, res, next) {
  try {
    const { name, email, password, department, studentId } = req.body;
    if (typeof name !== 'string' || !name.trim() || !isEmail(email) || typeof password !== 'string') {
      return res.status(400).json({ message: 'Name, email and password are required.' });
    }
    const passwordMessage = passwordError(password);
    if (passwordMessage) return res.status(400).json({ message: passwordMessage });
    if (name.trim().length > 80) return res.status(400).json({ message: 'Name must be 80 characters or fewer.' });

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
      verificationTokenExpireAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
      verificationTokenAttempts: 0
    });

    let emailStatus = 'sent';
    try {
      await deliverCodeEmail(user, code, 'email');
    } catch (emailError) {
      emailStatus = 'failed';
      console.error('Verification code delivery failed:', emailError.message);
    }
    res.status(201).json({
      message: emailStatus === 'sent'
        ? 'Your account was created. Check your email for the verification code.'
        : 'Your account was created, but the verification email could not be sent. You can request another code.',
      email: user.email,
      emailStatus
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'An account with this email already exists.' });
    next(err);
  }
}

async function sendOtp(req, res, next) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'No account was found for that email.' });
    if (user.isVerified) return res.status(400).json({ message: 'This email is already verified. Please sign in.' });

    const code = makeCode();
    user.verificationTokenHash = hash(code);
    user.verificationTokenPurpose = 'email';
    user.verificationTokenExpireAt = new Date(Date.now() + EMAIL_CODE_TTL_MS);
    user.verificationTokenAttempts = 0;
    await user.save();
    try {
      await deliverCodeEmail(user, code, 'email');
      res.json({ message: 'A new verification code was sent.', emailStatus: 'sent' });
    } catch (emailError) {
      console.error('Verification code delivery failed:', emailError.message);
      res.status(503).json({ message: 'The verification email could not be sent. Please try again shortly.', emailStatus: 'failed' });
    }
  } catch (err) {
    next(err);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    const code = String(req.body.code || '').trim();
    const invalidMessage = 'That code is invalid, expired, or has reached the attempt limit. Request a new one and try again.';
    if (!/^\d{6}$/.test(code)) {
      await incrementOtpAttempt(email, 'email');
      return res.status(400).json({ message: invalidMessage });
    }
    const now = new Date();
    const user = await User.findOneAndUpdate({
      email,
      isVerified: false,
      verificationTokenHash: hash(code),
      verificationTokenPurpose: 'email',
      verificationTokenExpireAt: { $gt: now },
      ...otpAttemptFilter()
    }, { $set: {
      isVerified: true,
      verificationTokenHash: null,
      verificationTokenPurpose: null,
      verificationTokenExpireAt: null,
      verificationTokenAttempts: 0
    } }, { returnDocument: 'after' }).select('+profileImage +coverImage +tokenVersion');
    if (!user) {
      await incrementOtpAttempt(email, 'email');
      return res.status(400).json({ message: invalidMessage });
    }
    res.cookie('token', createToken(user), sessionCookieOptions());
    res.json({ user: safeUser(user), message: 'Your email is verified.' });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (typeof email === 'string' ? email : '').toLowerCase().trim() })
      .select('+password +profileImage +coverImage +tokenVersion');
    if (!user || passwordError(password) || !(await bcrypt.compare(password, user.password))) {
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
    const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    const user = await User.findOne({ email, isVerified: true });
    if (user) {
      const code = makeCode();
      user.verificationTokenHash = hash(code);
      user.verificationTokenPurpose = 'password';
      user.verificationTokenExpireAt = new Date(Date.now() + RESET_CODE_TTL_MS);
      user.verificationTokenAttempts = 0;
      user.resetTokenHash = null;
      user.resetTokenExpireAt = null;
      await user.save();
      try {
        await deliverCodeEmail(user, code, 'password');
      } catch (emailError) {
        console.error('Password reset code delivery failed:', emailError.message);
      }
    }
    res.json({ message: 'If a verified account uses that email, a password reset code has been sent.' });
  } catch (err) {
    next(err);
  }
}

async function verifyResetCode(req, res, next) {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    const code = String(req.body.code || '').trim();
    const invalidMessage = 'That code is invalid, expired, or has reached the attempt limit. Request a new one and try again.';
    if (!/^\d{6}$/.test(code)) {
      await incrementOtpAttempt(email, 'password');
      return res.status(400).json({ message: invalidMessage });
    }
    const now = new Date();
    const criteria = {
      email,
      isVerified: true,
      verificationTokenHash: hash(code),
      verificationTokenPurpose: 'password',
      verificationTokenExpireAt: { $gt: now },
      ...otpAttemptFilter()
    };

    const resetToken = crypto.randomBytes(32).toString('hex');
    const user = await User.findOneAndUpdate(criteria, { $set: {
      verificationTokenHash: null,
      verificationTokenPurpose: null,
      verificationTokenExpireAt: null,
      verificationTokenAttempts: 0,
      resetTokenHash: hash(resetToken),
      resetTokenExpireAt: new Date(Date.now() + RESET_CODE_TTL_MS)
    } }, { returnDocument: 'after' });
    if (!user) {
      await incrementOtpAttempt(email, 'password');
      return res.status(400).json({ message: invalidMessage });
    }
    res.cookie('resetToken', resetToken, resetCookieOptions());
    res.json({ message: 'Code verified. Choose a new password.' });
  } catch (err) {
    next(err);
  }
}

async function newPassword(req, res, next) {
  try {
    const password = req.body.password || '';
    const validationMessage = passwordError(password);
    if (validationMessage) return res.status(400).json({ message: validationMessage });
    const resetToken = req.cookies?.resetToken;
    if (!resetToken) return res.status(400).json({ message: 'Your reset session expired. Request a new code.' });
    const user = await User.findOne({
      resetTokenHash: hash(resetToken),
      resetTokenExpireAt: { $gt: new Date() }
    }).select('+resetTokenHash +resetTokenExpireAt');
    if (!user) return res.status(400).json({ message: 'Your reset session expired. Request a new code.' });

    const passwordHash = await bcrypt.hash(password, 11);
    const consumed = await User.updateOne({
      _id: user._id,
      resetTokenHash: hash(resetToken),
      resetTokenExpireAt: { $gt: new Date() }
    }, { $set: { password: passwordHash, resetTokenHash: null, resetTokenExpireAt: null }, $inc: { tokenVersion: 1 } });
    if (consumed.modifiedCount !== 1) return res.status(400).json({ message: 'Your reset session expired. Request a new code.' });
    const { maxAge, ...cookieOptions } = resetCookieOptions();
    res.clearCookie('resetToken', cookieOptions);
    res.json({ message: 'Your password has been updated. You can sign in now.' });
  } catch (err) {
    next(err);
  }
}

async function me(req, res) {
  const user = await User.findById(req.user._id).select('+profileImage +coverImage');
  res.json({ user: safeUser(user) });
}

function logout(req, res) {
  const { maxAge, ...cookieOptions } = sessionCookieOptions();
  res.clearCookie('token', cookieOptions);
  res.json({ message: 'You have been signed out.' });
}

async function updateMe(req, res, next) {
  try {
    const { name, department, studentId, profileImage, coverImage } = req.body;
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: 'Name cannot be blank.' });
      req.user.name = String(name).trim();
    }
    if (department !== undefined) req.user.department = String(department).trim();
    if (studentId !== undefined) req.user.studentId = String(studentId).trim();
    if (profileImage !== undefined) {
      req.user.profileImage = validateProfileImage(profileImage, 'Profile photo', 600 * 1024);
    }
    if (coverImage !== undefined) {
      req.user.coverImage = validateProfileImage(coverImage, 'Cover photo', 1350 * 1024);
    }
    await req.user.save();
    const updatedUser = await User.findById(req.user._id).select('+profileImage +coverImage');
    res.json({ user: safeUser(updatedUser) });
  } catch (err) {
    next(err);
  }
}

async function publicProfile(req, res, next) {
  try {
    const member = await User.findById(req.params.id)
      .select('name department avatarColor role createdAt +profileImage +coverImage');
    if (!member) return res.status(404).json({ message: 'Member profile not found.' });

    const { page, limit, skip } = pagination(req.query);
    const posts = await CampusPost.find({ author: member._id, status: 'approved' })
      .sort({ featured: -1, createdAt: -1, _id: -1 }).skip(skip).limit(limit + 1);
    const hasMore = posts.length > limit;
    if (hasMore) posts.pop();
    res.json({
      profile: {
        id: member._id,
        name: member.name,
        department: member.department,
        role: member.role,
        avatarColor: member.avatarColor,
        profileImage: member.profileImage || '',
        coverImage: member.coverImage || '',
        joinedAt: member.createdAt
      },
      posts,
      pagination: { page, limit, hasMore }
    });
  } catch (err) {
    next(err);
  }
}
async function deleteMe(req, res, next) {
  try {
    const password = req.body.password || '';
    const user = await User.findById(req.user._id).select('+password');
    if (!user || passwordError(password) || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Enter your current password to delete your account.' });
    }
    if (user.role === 'admin') {
      const otherAdmins = await User.countDocuments({ role: 'admin', _id: { $ne: user._id } });
      if (!otherAdmins) return res.status(400).json({ message: 'Add another administrator before deleting the last admin account.' });
    }
    const authoredPosts = await CampusPost.find({ author: user._id }).select('_id').lean();
    const authoredPostIds = authoredPosts.map((post) => post._id);
    await Promise.all([
      CampusPost.deleteMany({ author: user._id }),
      Notification.deleteMany({ $or: [{ recipient: user._id }, { post: { $in: authoredPostIds } }] }),
      Event.deleteMany({ organizer: user._id }),
      Event.updateMany({ attendees: user._id }, { $pull: { attendees: user._id } }),
      ModuleRegistration.deleteMany({ student: user._id }),
      ModuleMessage.deleteMany({ sender: user._id })
    ]);
    await user.deleteOne();
    res.json({ message: 'Your account and its posts have been deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register, login, logout, me, publicProfile, sendOtp, verifyEmail, forgotPassword, verifyResetCode,
  newPassword, updateMe, deleteMe
};


