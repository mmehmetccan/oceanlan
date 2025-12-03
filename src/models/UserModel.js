// src/models/UserModel.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
  // --- YENİ EKLENEN ALANLAR ---
  firstName: {
    type: String,
    required: [true, 'İsim zorunludur'],
    trim: true,
  },
  lastName: {
    type: String,
    required: [true, 'Soyisim zorunludur'],
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: [true, 'Telefon numarası zorunludur'],
    trim: true,
  },
  // ---------------------------

  username: {
    type: String,
    required: [true, 'Kullanıcı adı zorunludur'],
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'E-posta zorunludur'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Lütfen geçerli bir e-posta adresi girin',
    ],
  },
  password: {
    type: String,
    required: [true, 'Şifre zorunludur'],
    minlength: 6,
    select: false,
  },
  friends: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    }
  ],
  streamKey: {
    type: String,
    unique: true,
    select: false
  },
  avatarUrl: {
    type: String,
    default: '/default-avatar.png'
  },
  onlineStatus: {
    type: String,
    enum: ['online', 'offline'],
    default: 'offline'
  },
  lastSeenAt: {
    type: Date,
    default: Date.now
  },
  isVerified: {
    type: Boolean,
    default: false, // Artık varsayılan olarak doğrulanmamış
  },
  verificationToken: String,
  verificationExpire: Date,

  // --- 2. E-POSTA DEĞİŞİKLİĞİ İÇİN ALANLAR ---
  newEmail: String, // Kullanıcı yeni e-postasını buraya yazar, onaylarsa email alanına geçer
  newEmailToken: String,
  newEmailExpire: Date,

  // Şifre sıfırlama için gerekli alanlar
  resetPasswordToken: String,
  resetPasswordExpire: Date,

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Şifre hashleme
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.pre('save', async function (next) {
  if (this.isNew && !this.streamKey) {
    this.streamKey = `sk_live_${crypto.randomBytes(10).toString('hex')}`;
  }
  next();
});



// 📢 YENİ: 6 Haneli Kod Oluşturucu
UserSchema.methods.createVerificationCode = function () {
  // 100000 ile 999999 arasında rastgele sayı
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Kodu hashleyerek sakla (Güvenlik için)
  this.verificationToken = crypto.createHash('sha256').update(code).digest('hex');

  // 10 dakika geçerli olsun
  this.verificationExpire = Date.now() + 10 * 60 * 1000;

  return code; // Hashlenmemiş halini kullanıcıya mail atacağız
};

module.exports = mongoose.model('User', UserSchema);

// Şifre Sıfırlama Token Oluşturucu Metot
UserSchema.methods.getResetPasswordToken = function () {
  // Rastgele bir token oluştur
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Token'ı hashle ve veritabanına kaydetmek için resetPasswordToken alanına ata
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Token geçerlilik süresi (10 dakika)
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

module.exports = mongoose.model('User', UserSchema);