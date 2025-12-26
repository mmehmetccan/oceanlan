const mongoose = require('mongoose');

// İZİN LİSTESİ (ÖRNEK - Bunları zamanla genişleteceğiz)
// Bu izinler, frontend'de butonları göstermek/gizlemek
// ve backend'de API'leri korumak için kullanılacak.
const PERMISSIONS = [
  'ADMINISTRATOR',   // Tüm izinler
  'MANAGE_SERVER',   // Sunucu adını vb. değiştirme (YENİ)
  'MANAGE_ROLES',    // Rolleri yönetme
  'MANAGE_CHANNELS', // Kanalları yönetme
  'KICK_MEMBERS',    // Üyeleri atma
  'BAN_MEMBERS',     // Üyeleri yasaklama (YENİ)
  'CREATE_INVITE',   // Davet oluşturma
  'SEND_MESSAGES',   // Mesaj gönderme
  'MANAGE_MESSAGES', // Başkalarının mesajlarını silme
  'VOICE_SPEAK',     // Sesli sohbette konuşma
  'MUTE_MEMBERS',    // Üyeleri susturma (YENİ)
  'DEAFEN_MEMBERS',  // Üyeleri sağırlaştırma (YENİ)
        'READ_MESSAGES',     // ← EKLE
        'VOICE_CONNECT',     // ← EKLE


];
const RoleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Rol adı zorunludur'],
    default: 'new role',
  },
  // Bu rol hangi sunucuya ait?
  server: {
    type: mongoose.Schema.ObjectId,
    ref: 'Server',
    required: true,
  },
  // Bu rolün hangi izinleri var?
  permissions: {
    type: [String],
    enum: PERMISSIONS,
    default: ['SEND_MESSAGES', 'VOICE_SPEAK'], // Varsayılan izinler
  },
  // Frontend'de güzel görünmesi için renk
  color: {
    type: String,
    default: '#99AAB5', // Discord'un varsayılan gri rengi
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Role', RoleSchema);
module.exports.PERMISSIONS = PERMISSIONS; // İzin listesini de dışa aktar