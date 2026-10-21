const router = require('express').Router();
const {
  register, login, me, sendOtp, verifyEmail, forgotPassword,
  verifyResetCode, newPassword, updateMe, deleteMe
} = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');

router.post('/register', register);
router.post('/login', login);
router.post('/send-otp', sendOtp);
router.post('/user-verification', verifyEmail);
router.post('/change-password', forgotPassword);
router.post('/verify-changes', verifyResetCode);
router.post('/new-password', newPassword);
router.get('/me', protect, me);
router.patch('/me', protect, updateMe);
router.delete('/me', protect, deleteMe);

module.exports = router;
