// src/middleware/rateLimiters.js
const rateLimit = require('express-rate-limit');

// 1. GENEL KORUMA (Tüm API için - DDoS engelleme)
// 15 dakikada maksimum 100 istek
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    status: 'fail',
    message: 'Çok fazla istek gönderdiniz, lütfen 15 dakika sonra tekrar deneyin.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. KAYIT VE GİRİŞ KORUMASI (Hesap oluşturma/giriş spam'ini önleme)
// 1 saatte aynı IP'den en fazla 10 hesap oluşturma/giriş denemesi
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    status: 'fail',
    message: 'Çok fazla giriş/kayıt denemesi yaptınız. Lütfen 1 saat bekleyin.'
  }
});

// 3. E-POSTA DOĞRULAMA KORUMASI (Brute Force Engelleme - EN ÖNEMLİSİ)
// 6 haneli kodu denemek için 10 dakikada en fazla 5 hak veriyoruz.
// Murat'ın bahsettiği "kodu deneme" açığını bu kapatır.
const verifyEmailLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: {
    status: 'fail',
    message: 'Çok fazla hatalı kod girdiniz. Lütfen 10 dakika bekleyin.'
  }
});

// 4. ŞİFRE SIFIRLAMA MAİLİ GÖNDERME KORUMASI
// Sürekli mail atıp kullanıcıyı spamlamasınlar diye.
// 1 saatte en fazla 3 şifre sıfırlama isteği.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    status: 'fail',
    message: 'Çok fazla şifre sıfırlama isteği gönderdiniz. Lütfen daha sonra deneyin.'
  }
});

module.exports = {
  generalLimiter,
  authLimiter,
  verifyEmailLimiter,
  forgotPasswordLimiter
};