// src/middleware/rateLimiters.js
const rateLimit = require('express-rate-limit');

// Ortak bir doğrulama ayarı (Hata almaman için eklendi)
const skipValidation = { xForwardedForHeader: false };

// 1. GENEL KORUMA
const generalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 1000,
  message: {
    status: 'fail',
    message: 'Çok fazla istek gönderdiniz, lütfen 15 dakika sonra tekrar deneyin.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: skipValidation, // <-- KRİTİK EKLEME
});

// 2. KAYIT VE GİRİŞ KORUMASI
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    status: 'fail',
    message: 'Çok fazla giriş/kayıt denemesi yaptınız. Lütfen 1 saat bekleyin.'
  },
  validate: skipValidation, // <-- KRİTİK EKLEME
});

// 3. E-POSTA DOĞRULAMA KORUMASI
const verifyEmailLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: {
    status: 'fail',
    message: 'Çok fazla hatalı kod girdiniz. Lütfen 10 dakika bekleyin.'
  },
  validate: skipValidation, // <-- KRİTİK EKLEME
});

// 4. ŞİFRE SIFIRLAMA MAİLİ GÖNDERME KORUMASI
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    status: 'fail',
    message: 'Çok fazla şifre sıfırlama isteği gönderdiniz. Lütfen daha sonra deneyin.'
  },
  validate: skipValidation, // <-- KRİTİK EKLEME
});

module.exports = {
  generalLimiter,
  authLimiter,
  verifyEmailLimiter,
  forgotPasswordLimiter
};