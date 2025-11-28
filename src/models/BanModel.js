// models/BanModel.js
const mongoose = require('mongoose');

// Bir kullanıcının bir sunucudan kalıcı olarak yasaklanmasını temsil eder
const BanSchema = new mongoose.Schema({
  // Hangi kullanıcı yasaklandı?
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  // Hangi sunucudan yasaklandı?
  server: {
    type: mongoose.Schema.ObjectId,
    ref: 'Server',
    required: true,
  },
  // Kim tarafından yasaklandı? (Moderator)
  bannedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  // Neden? (Opsiyonel)
  reason: {
    type: String,
    trim: true,
    maxlength: 500,
    default: 'Neden belirtilmedi'
  },
  bannedAt: {
    type: Date,
    default: Date.now,
  },
});

// Bir kullanıcı bir sunucudan sadece bir kez yasaklanabilir
BanSchema.index({ user: 1, server: 1 }, { unique: true });

module.exports = mongoose.model('Ban', BanSchema);