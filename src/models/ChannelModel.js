// models/Channel.js
const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { 
    type: String,
    enum: ['text', 'voice'], // <--- küçük harf olmalı!
    required: true 
  },

  maxUsers: { type: Number, default: 10 }, // yeni alan
  allowedRoles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }], // kimler girebilir
  server: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

module.exports = mongoose.model('Channel', channelSchema);
