// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();

const { protect } = require('../../middleware/authMiddleware');

const {
  authLimiter,
  verifyEmailLimiter,
  forgotPasswordLimiter
} = require('../../../src/middleware/rateLimiters');

const {
  registerUser,
  loginUser,
  verifyEmail,
  resendCode,
  getStreamKey,
  forgotPassword,
  resetPassword,
  getTempToken
} = require('../../controllers/authController');


router.post('/register', authLimiter, registerUser);
router.post('/login', authLimiter, loginUser);


router.get('/stream-key', protect, getStreamKey);

router.post('/forgotpassword', forgotPasswordLimiter, forgotPassword);

router.put('/resetpassword', resetPassword);
router.post('/verify-email', verifyEmailLimiter, verifyEmail);

router.post('/auth/temp-token', protect, getTempToken);

router.post('/resend-code', forgotPasswordLimiter, resendCode);

module.exports = router;