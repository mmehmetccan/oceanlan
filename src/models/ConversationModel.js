const mongoose = require('mongoose');

// İki kullanıcı arasındaki özel sohbeti (DM) temsil eder
const ConversationSchema = new mongoose.Schema({
  participants: [ // Katılımcılar (her zaman 2 kişi)
    {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Conversation', ConversationSchema);