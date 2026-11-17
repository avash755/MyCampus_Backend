const router = require('express').Router();
const {
  register, login, logout, me, sendOtp, verifyEmail, forgotPassword,
  verifyResetCode, newPassword, updateMe, deleteMe
} = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');
const { createAuthRateLimiter } = require('../middlewares/authRateLimit.middleware');

const minute = 60 * 1000;
const hour = 60 * minute;
const limit = (scope, windowMs, ipLimit, identityLimit = ipLimit) => createAuthRateLimiter({ scope, windowMs, ipLimit, identityLimit });

router.post('/register', limit('register', hour, 30, 5), register);
router.post('/login', limit('login', 15 * minute, 60, 8), login);
router.post('/logout', logout);
router.post('/send-otp', limit('send-otp', hour, 30, 3), sendOtp);
router.post('/user-verification', limit('verify-email', 15 * minute, 60, 10), verifyEmail);
router.post('/change-password', limit('forgot-password', hour, 30, 3), forgotPassword);
router.post('/verify-changes', limit('verify-reset', 15 * minute, 60, 10), verifyResetCode);
router.post('/new-password', limit('new-password', 15 * minute, 60, 10), newPassword);
router.get('/me', protect, me);
router.patch('/me', protect, updateMe);
router.delete('/me', protect, deleteMe);

module.exports = router;
