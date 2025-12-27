const mongoose = require('mongoose');

// Şimdilik basit tutuyoruz, kanalları ve rolleri daha sonra ekleyeceğiz
const ServerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Sunucu adı zorunludur'],
    trim: true,
  },
  iconUrl: {
    type: String,
    default: null
  },
  owner: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  isPublic: { type: Boolean, default: false }, // Herkese Açık mı?
  joinMode: {
    type: String,
    enum: ['direct', 'request'], // 'direct': Direkt Gir, 'request': İstek At
    default: 'direct'
  },
  // 🟢 YENİ EKLENEN KISIM: SUNUCU ÖZELLİKLERİ
  features: {
    squadBuilder: {
      type: Boolean,
      default: true // Varsayılan olarak AÇIK gelir
    },
    vacationRoute: {
      type: Boolean,
      default: true // Varsayılan olarak AÇIK gelir
    }
  },
  // --- 1. DEĞİŞİKLİK ---
  // 'members' dizisi artık 'User' ID'lerini değil, 'Member' (Üyelik) ID'lerini tutacak
  members: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'Member', // 'User' idi, 'Member' oldu
    },
  ],
  // --- 3. YENİ EKLENEN ALAN ---
  // Sunucuya katılan herkese verilecek varsayılan rol (@everyone)
  defaultRole: {
    type: mongoose.Schema.ObjectId,
    ref: 'Role',
  },
  channels: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'Channel',
    }
  ],
  roles: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'Role'
    }
  ],
  inviteCode: {
    type: String,
    unique: true,
    sparse: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// --- 2. SİLİNEN KISIM ---
// BURADA OLAN 'ServerSchema.pre('save', ...)' KANCASINI TAMAMEN SİLİN.
// O MANTIK ARTIK BURADA OLMAYACAK.

module.exports = mongoose.model('Server', ServerSchema);