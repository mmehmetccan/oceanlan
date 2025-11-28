// src/models/PostModel.js
const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  // Paylaşımı kim yaptı?
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  // Metin içeriği
  content: {
    type: String,
    //required: [true, 'Gönderi içeriği boş olamaz'],
    trim: true,
    maxlength: 2000,
  },
  // Resim veya video (Tıpkı sohbet gibi)
  mediaUrl: {
    type: String,
  },
  mediaType: {
    type: String, // 'image' veya 'video'
  },
  // --- Etkileşimler ---
  likes: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
  ],
  dislikes: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
  ],
  // Bu gönderiye yapılan yorumların referansları
  comments: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'Comment',
    },
  ],
}, {
  timestamps: true // 'createdAt' ve 'updatedAt' alanlarını otomatik ekler
});

module.exports = mongoose.model('Post', PostSchema);