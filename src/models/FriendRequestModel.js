const mongoose = require('mongoose');

const FriendRequestSchema = new mongoose.Schema({
  // İsteği gönderen (from)
  requester: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  // İsteği alan (to)
  recipient: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  // İsteğin durumu
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('FriendRequest', FriendRequestSchema);