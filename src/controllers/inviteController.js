const Server = require('../models/ServerModel');
const User = require('../models/UserModel');
const Member = require('../models/MemberModel');
const Role = require('../models/RoleModel');
const Ban = require('../models/BanModel');


// @desc    Bir davet kodunu kullanarak sunucuya katılır
// @route   POST /api/v1/invites/:inviteCode
// @access  Private (Giriş yapmış kullanıcı gerektirir)
const joinServerWithInvite = async (req, res) => {
  try {
    const { inviteCode } = req.params;
    const userId = req.user.id;

    // 1. Koda göre sunucuyu bul (ve @everyone rolünü al)
    const server = await Server.findOne({ inviteCode: inviteCode })
                              .populate('defaultRole'); // @everyone rolünü almak için

    if (!server) {
      return res.status(404).json({ success: false, message: 'Geçersiz davet kodu veya sunucu bulunamadı' });
    }

    const isBanned = await Ban.findOne({ user: userId, server: server._id });
    if (isBanned) {
        return res.status(403).json({
            success: false,
            message: 'Bu sunucudan kalıcı olarak yasaklandınız. Katılamazsınız.'
        });
    }
    // 2. KULLANICI KONTROLÜ (YENİ YÖNTEM):
    // Kullanıcı için bu sunucuda bir "Member" (Üyelik) kaydı var mı?
    const existingMembership = await Member.findOne({ user: userId, server: server._id });

    if (existingMembership) {
      return res.status(400).json({
        success: false,
        message: 'Bu sunucuya zaten üyesiniz',
        serverId: server._id // <-- KRİTİK EKLEME
      });
    }

    // 3. YENİ ÜYELİK OLUŞTUR
    // Kullanıcıyı üye olarak kaydet ve ona sunucunun varsayılan (@everyone) rolünü ver
    const newMember = await Member.create({
        user: userId,
        server: server._id,
        roles: [server.defaultRole._id] // @everyone rolünü ata
    });

    // 4. Yeni üyeyi, ana sunucunun 'members' dizisine ekle
    server.members.push(newMember._id);
    await server.save();

    // 5. Başarılı cevabı, güncellenmiş sunucu bilgisiyle döndür
    // (Bunu yapmak için 'getServerDetails' fonksiyonunu beklemeliyiz,
    // şimdilik sadece yeni üyelik bilgisini döndürelim)
    const populatedMember = await Member.findById(newMember._id)
                                        .populate('user', 'username')
                                        .populate('roles', 'name');

    res.status(200).json({
      success: true,
      message: 'Sunucuya başarıyla katıldınız',
      data: {
        serverName: server.name,
        memberInfo: populatedMember
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Sunucu Hatası', error: error.message });
  }
};

module.exports = {
  joinServerWithInvite,
};