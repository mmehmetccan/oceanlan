const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  content: {
    type: String,
    trim: true,
  },
  fileUrl: {
    type: String, // Dosyanın sunucudaki yolu (örn: /uploads/chat/video.mp4)
  },
  fileType: {
    type: String, // 'image', 'video', veya 'other'
  },
  // Mesajı kim gönderdi?
  author: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  // Hangi kanala gönderildi?
  channel: {
    type: mongoose.Schema.ObjectId,
    ref: 'Channel',
    required: true,
  },
  // Hangi sunucuya ait? (Bu, veriyi çekmeyi kolaylaştırır)
  server: {
    type: mongoose.Schema.ObjectId,
    ref: 'Server',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Message', MessageSchema);