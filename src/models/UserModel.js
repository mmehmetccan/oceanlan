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
  steamId: { 
  type: String, 
  default: null 
},
steamProfile: {
  personaname: String,
  avatar: String,
  game: String,     // Şu an oynadığı oyun
  isOnline: Boolean,
  lastUpdated: Date
},
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
    default: false,
  },

  verificationToken: String,
  verificationExpire: Date,

  // --- 2. E-POSTA DEĞİŞİKLİĞİ İÇİN ALANLAR ---
  newEmail: String,
  newEmailToken: String,
  newEmailExpire: Date,

  // Şifre sıfırlama için gerekli alanlar
  resetPasswordToken: String,
  resetPasswordExpire: Date,

  createdAt: {
    type: Date,
    default: Date.now,
  },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  badges: [
    {
      id: String,        // Örn: 'SERVER_MASTER_1'
      name: String,      // Örn: 'Acemi Sunucu Sahibi'
      icon: String,      // Örn: 'server-bronze'
      earnedAt: { type: Date, default: Date.now }
    }
  ],
  // ✅ YENİ EKLENECEK ALAN:
  activeBadge: {
    id: String,
    name: String,
    icon: String
  },

  // İstatistikleri takip etmek için sayaçlar (Performans için)
  stats: {
    createdServers: { type: Number, default: 0 },
    friendCount: { type: Number, default: 0 },
    messagesSent: { type: Number, default: 0 }
  }
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
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.verificationToken = crypto.createHash('sha256').update(code).digest('hex');
  this.verificationExpire = Date.now() + 10 * 60 * 1000;
  return code;
};

// ❌ BURADA OLAN module.exports SATIRINI SİLDİM.
// Metot tanımları bitmeden export yaparsan, alttaki metotlar modele eklenmez.

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

// ✅ EXPORT SADECE EN SONDA OLMALI
module.exports = mongoose.model('User', UserSchema);