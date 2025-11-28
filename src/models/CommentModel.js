// src/models/CommentModel.js
const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  // Yorumu kim yaptı?
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  // Hangi gönderiye yapıldı?
  post: {
    type: mongoose.Schema.ObjectId,
    ref: 'Post',
    required: true,
  },
  // Yorum metni
  content: {
    type: String,
    required: [true, 'Yorum içeriği boş olamaz'],
    trim: true,
    maxlength: 1000,
  },
}, {
  timestamps: true // 'createdAt'
});

module.exports = mongoose.model('Comment', CommentSchema);