const mongoose = require('mongoose');

const PrivateMessageSchema = new mongoose.Schema({
  content: {
    type: String,
    trim: true,
  },
  fileUrl: {
    type: String,
  },
  fileType: {
    type: String, // 'image', 'video', 'other'
  },
  // Mesajı kim gönderdi?
  author: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  // Hangi sohbete (DM) ait?
  conversation: {
    type: mongoose.Schema.ObjectId,
    ref: 'Conversation',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('PrivateMessage', PrivateMessageSchema);