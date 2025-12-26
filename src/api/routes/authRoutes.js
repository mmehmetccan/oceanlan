// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();

// Controller'ları içe aktar
const { protect } = require('../../middleware/authMiddleware');

// 🟢 YENİ: Rate Limiter'ları içe aktar
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
  resetPassword
} = require('../../controllers/authController');

// --- ROTALAR ---

// Kayıt ve Giriş için genel authLimiter kullanıyoruz
router.post('/register', authLimiter, registerUser);
router.post('/login', authLimiter, loginUser);

// Sadece giriş yapmış kullanıcılar stream key alabilir (Rate limit gerekmez, token var)
router.get('/stream-key', protect, getStreamKey);

// Şifremi unuttum (Spam mail engelleme)
router.post('/forgotpassword', forgotPasswordLimiter, forgotPassword);
router.put('/resetpassword/:resetToken', authLimiter, resetPassword);

// 🟢 EN KRİTİK NOKTA: Kod Doğrulama (Brute Force Engelleme)
// verifyEmailLimiter sayesinde 10 dakikada sadece 5 deneme yapabilirler.
// 6 haneli kodu 5 denemede tutturmak imkansıza yakındır.
router.post('/verify-email', verifyEmailLimiter, verifyEmail);

// Kod yeniden gönderme (Sürekli mail atılmasın diye limitliyoruz)
router.post('/resend-code', forgotPasswordLimiter, resendCode);

module.exports = router;