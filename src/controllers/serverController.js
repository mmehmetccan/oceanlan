// src/controllers/serverController.js
const Server = require('../models/ServerModel');
const User = require('../models/UserModel');
const crypto = require('crypto');
const Role = require('../models/RoleModel');
const Member = require('../models/MemberModel');
const Channel = require('../models/ChannelModel');
const Message = require('../models/MessageModel');
const Ban = require('../models/BanModel');
const { processGamification } = require('../utils/gamificationEngine');
const fs = require('fs'); // Eski resmi silmek için fs modülü
// @desc    Yeni bir sunucu oluşturur
const createServer = async (req, res) => {
  try {
    const { name } = req.body;
    const ownerId = req.user.id;

    // --- EKLENEN KISIM: Resim Yolu ---
    let iconUrl = null;
    if (req.file && req.file.filename) {
        // serverIconMiddleware dosya adını req.file.filename'e ekliyor
        iconUrl = `/uploads/server_icons/${req.file.filename}`;
    }
    // 1. Sunucuyu oluştur
    const newServer = await Server.create({
      name: name,
      owner: ownerId,
        iconUrl: iconUrl // DB'ye kaydet
    });

    // 2. @everyone rolü
    const everyoneRole = await Role.create({
      name: '@everyone',
      server: newServer._id,
      isDefault: true,
        permissions: [
        'SEND_MESSAGES',   // Mesaj gönderme
        'READ_MESSAGES',   // Mesaj okuma
        'VOICE_SPEAK',     // Konuşma
        'VOICE_CONNECT'    // Sesliye bağlanma
      ]
    });

    // 3. Admin rolü
    const adminRole = await Role.create({
        name: 'Admin',
        server: newServer._id,
        permissions: ['ADMINISTRATOR'],
        color: '#F1C40F'
    });

    // --- HATA DÜZELTMESİ BURADA ---
    // 4. Varsayılan Kanal (created By eklendi)
    const defaultChannel = await Channel.create({
        name: 'genel',
        server: newServer._id,
        type: 'text',
    });
    // -----------------------------

    // 5. Sunucu Sahibi Üyeliği
    const ownerMember = await Member.create({
        user: ownerId,
        server: newServer._id,
        roles: [everyoneRole._id, adminRole._id]
    });

    // 6. Her şeyi ana sunucu kaydına bağla
    newServer.members.push(ownerMember._id);
    newServer.defaultRole = everyoneRole._id;
    newServer.channels.push(defaultChannel._id);
    newServer.roles.push(everyoneRole._id, adminRole._id);

    await newServer.save();

    // 7. Cevabı populate et
    const populatedServer = await Server.findById(newServer._id)
      .populate('owner', 'username email')
      .populate('defaultRole')
      .populate({
          path: 'channels',
          select: 'name type _id maxUsers allowedRoles'
      })
      .populate('roles')
      .populate({
        path: 'members',
        populate: [
          // 👇 'badges' ve 'level' EKLENDİ
          { path: 'user', select: 'username email avatarUrl badges level' },
          { path: 'roles', select: 'name color permissions' }
        ]
      });

    res.status(201).json({
      success: true,
      message: 'Sunucu, roller ve kanal başarıyla oluşturuldu',
      data: populatedServer,
    });
    try {
        const io = req.app.get('io');
        if (io) {
            processGamification(req.user._id, 'CREATE_SERVER', io);
        }
    } catch (gError) {
        console.error("Gamification Hatası (Önemsiz):", gError.message);
    }

  } catch (error) {
    console.error('SERVER CREATE HATA DETAYI:', error); // Terminale detaylı hata basar
    res.status(500).json({ success: false, message: 'Sunucu oluşturulamadı', error: error.message });
  }
};
// 📢 YENİ: Sunucu Resmini Güncelle
const updateServerIcon = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Resim dosyası yok' });

        const { serverId } = req.params;
        const iconUrl = `/uploads/server_icons/${req.file.filename}`;

        const server = await Server.findByIdAndUpdate(
            serverId,
            { iconUrl: iconUrl },
            { new: true }
        );

        res.status(200).json({ success: true, message: 'Sunucu resmi güncellendi', data: server });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Resim yüklenemedi', error: error.message });
    }
};

// 📢 YENİ: Yasaklı Kullanıcıları Listele
const getBannedUsers = async (req, res) => {
    try {
        const { serverId } = req.params;
        // Ban tablosundan bu sunucuya ait olanları bul, kullanıcı bilgilerini doldur
        const bans = await Ban.find({ server: serverId })
            .populate('user', 'username avatarUrl') // Yasaklı kişi
            .populate('bannedBy', 'username');      // Yasaklayan yetkili

        res.status(200).json({ success: true, data: bans });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Liste alınamadı', error: error.message });
    }
};

// 📢 YENİ: Ban Kaldır (Unban)
const unbanUser = async (req, res) => {
    try {
        const { serverId, userId } = req.params; // URL'den banned user ID'sini al

        // Ban kaydını sil
        const deletedBan = await Ban.findOneAndDelete({ server: serverId, user: userId });

        if (!deletedBan) {
            return res.status(404).json({ success: false, message: 'Ban kaydı bulunamadı' });
        }

        res.status(200).json({ success: true, message: 'Kullanıcının yasağı kaldırıldı.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'İşlem başarısız', error: error.message });
    }
};
// @desc    Sunucu detaylarını getirir
const getServerDetails = async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;

    const membership = await Member.findOne({ user: userId, server: serverId });
    if (!membership) {
      return res.status(403).json({ success: false, message: 'Bu sunucunun üyesi değilsiniz' });
    }

    // 2. Sunucuyu bul ve populate et (Rolleri de ekle)
    const server = await Server.findById(serverId)
      .populate('owner', 'username email')
      .populate('defaultRole')
      .populate({
        path: 'channels',
        select: 'name type'
      })
     .populate('roles')
      .populate({
        path: 'members',
        populate: [
          // 🔴 ESKİSİ: { path: 'user', select: 'username email avatarUrl' },
          // 🟢 YENİSİ (Bunu Yapıştır):
          { path: 'user', select: 'username email avatarUrl level badges' },
          { path: 'roles', select: 'name color permissions' }
        ]
      });

    if (!server) {
      return res.status(404).json({ success: false, message: 'Sunucu bulunamadı' });
    }

    res.status(200).json({
      success: true,
      data: server,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Sunucu Hatası', error: error.message });
  }
};

const getUserServers = async (req, res) => {
  try {
    const userId = req.user.id;
    const memberships = await Member.find({ user: userId });
    const serverIds = memberships.map(m => m.server);

    // 👇 DÜZELTME: 'iconUrl' alanını da seçiyoruz!
    const servers = await Server.find({ _id: { $in: serverIds } })
                                .select('name owner channels iconUrl');

    res.status(200).json({
      success: true,
      count: servers.length,
      data: servers,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Sunucular çekilemedi', error: error.message });
  }
};

// ... (generateInviteCode ve deleteServer kodları aynı)
const generateInviteCode = async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ success: false, message: 'Sunucu bulunamadı' });
    }
    if (server.owner.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Yetkisiz işlem: Sadece sunucu sahibi davet kodu oluşturabilir' });
    }
    if (server.inviteCode) {
      return res.status(200).json({
        success: true,
        message: 'Mevcut davet kodu alındı',
        inviteCode: server.inviteCode,
      });
    }
    const inviteCode = crypto.randomBytes(5).toString('hex');
    server.inviteCode = inviteCode;
    await server.save();
    res.status(201).json({
      success: true,
      message: 'Yeni davet kodu oluşturuldu',
      inviteCode: inviteCode,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Sunucu Hatası', error: error.message });
  }
};

const deleteServer = async (req, res) => {
    try {
        const { serverId } = req.params;
        const userId = req.user.id;

        const server = await Server.findById(serverId);

        if (!server) {
            return res.status(404).json({ success: false, message: 'Sunucu bulunamadı' });
        }

        if (server.owner.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Sunucuyu silme yetkiniz yok. Sadece sahip silebilir.' });
        }

        // Sunucuya ait her şeyi temizle
        await Channel.deleteMany({ server: serverId });
        await Role.deleteMany({ server: serverId });
        await Member.deleteMany({ server: serverId });
        await Ban.deleteMany({ server: serverId });
        await Message.deleteMany({ server: serverId });

        // Son olarak sunucuyu sil
        await Server.findByIdAndDelete(serverId);

        // TODO: Socket ile 'serverDeleted' emit et

        res.status(200).json({ success: true, message: 'Sunucu ve tüm içeriği başarıyla silindi.' });

    } catch (error) {
        console.error("SUNUCU SİLME HATASI:", error); // Hatanın ne olduğunu logla
        res.status(500).json({ success: false, message: 'Sunucu silinemedi', error: error.message });
    }
};

const leaveServer = async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ success: false, message: 'Sunucu bulunamadı' });
    }

    // ❌ Sahip ayrılamaz
    if (server.owner.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: 'Sunucu sahibi sunucudan ayrılamaz'
      });
    }

    // Üyeliği bul
    const member = await Member.findOne({ server: serverId, user: userId });
    if (!member) {
      return res.status(400).json({ success: false, message: 'Bu sunucunun üyesi değilsiniz' });
    }

    // Member sil
    await Member.findByIdAndDelete(member._id);

    // Sunucudan member referansını kaldır
    await Server.findByIdAndUpdate(serverId, {
      $pull: { members: member._id }
    });

    res.status(200).json({ success: true, message: 'Sunucudan ayrıldınız' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'İşlem başarısız', error: error.message });
  }
};

const updateServer = async (req, res) => {
    try {
        const { serverId } = req.params;
        const updateData = req.body;
        const userId = req.user.id;

        // 1. Sunucuyu bul
        const server = await Server.findById(serverId);
        if (!server) {
            return res.status(404).json({ success: false, message: 'Sunucu bulunamadı' });
        }

        // 2. Yetki Kontrolü (Sahip mi veya Yönetici mi?)
        // Not: Middleware kullanıyorsan orası halleder ama burada manuel kontrol ekledim güvenlik için.
        let hasPermission = false;
        if (server.owner.toString() === userId) {
            hasPermission = true;
        } else {
            // Sahip değilse, üyenin yetkilerine bak (Member tablosundan)
            const member = await Member.findOne({ server: serverId, user: userId }).populate('roles');
            if (member) {
                // Admin veya Sunucu Yönetme yetkisi var mı?
                hasPermission = member.roles.some(role =>
                    role.permissions.includes('ADMINISTRATOR') ||
                    role.permissions.includes('MANAGE_SERVER')
                );
            }
        }

        if (!hasPermission) {
            return res.status(403).json({ success: false, message: 'Bu sunucuyu güncelleme yetkiniz yok.' });
        }

        // 3. Sadece izin verilen alanları güncelle (Güvenlik için)
        // Frontend'den gelen 'features' objesi burada işlenir.
        const allowedUpdates = ['name', 'description', 'features'];
        const actualUpdates = {};

        Object.keys(updateData).forEach((key) => {
            if (allowedUpdates.includes(key)) {
                actualUpdates[key] = updateData[key];
            }
        });

        // 4. Veritabanını güncelle
        const updatedServer = await Server.findByIdAndUpdate(
            serverId,
            { $set: actualUpdates },
            { new: true, runValidators: true }
        )
        .populate('owner', 'username email')
        .populate('channels')
        .populate('roles');

        res.status(200).json({
            success: true,
            message: 'Sunucu ayarları güncellendi',
            data: updatedServer,
        });

    } catch (error) {
        console.error('SERVER UPDATE HATA:', error);
        res.status(500).json({ success: false, message: 'Sunucu güncellenemedi', error: error.message });
    }
};

module.exports = {
  createServer,
  generateInviteCode,
  getServerDetails,
  getUserServers,
  deleteServer,
    updateServerIcon,
  getBannedUsers,
  unbanUser,
    leaveServer,
    updateServer

};