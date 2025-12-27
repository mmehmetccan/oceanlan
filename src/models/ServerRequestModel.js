const mongoose = require('mongoose');

const serverRequestSchema = mongoose.Schema({
    server: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' }
}, {
    timestamps: true,
});

// Aynı kullanıcı aynı sunucuya tekrar tekrar istek atamasın
serverRequestSchema.index({ server: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('ServerRequest', serverRequestSchema);