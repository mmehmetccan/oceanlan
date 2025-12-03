const express = require('express');
const router = express.Router();

// Controller'ları içe aktar
const { protect } = require('../../middleware/authMiddleware');

const { registerUser, loginUser, verifyEmail, resendCode, getStreamKey, forgotPassword, resetPassword } = require('../../controllers/authController');

// POST /api/v1/auth/register
router.post('/register', registerUser);

// POST /api/v1/auth/login
router.post('/login', loginUser);

router.get('/stream-key', protect, getStreamKey);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:resetToken', resetPassword);

router.post('/verify-email', verifyEmail);       // Kod doğrulama (POST)
router.post('/resend-code', resendCode);


module.exports = router;