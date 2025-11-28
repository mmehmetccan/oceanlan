const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema({
  // Bu üyelik hangi kullanıcıya ait?
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  // Bu üyelik hangi sunucuya ait?
  server: {
    type: mongoose.Schema.ObjectId,
    ref: 'Server',
    required: true,
  },
  // Bu üyenin hangi rolleri var?
  roles: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'Role',
    },
  ],
  // Sunucuya özel takma ad (nickname)
  nickname: {
    type: String,
    trim: true,
    maxlength: 32,
  },
  isMuted: {
    type: Boolean,
    default: false,
  },
  // Sunucuya özel sağırlaştırılma durumu
  isDeafened: {
    type: Boolean,
    default: false,
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
});

// Bir kullanıcının aynı sunucuya iki kez üye olamayacağından emin olalım
MemberSchema.index({ user: 1, server: 1 }, { unique: true });

module.exports = mongoose.model('Member', MemberSchema);