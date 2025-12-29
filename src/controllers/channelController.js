// src/api/controllers/channelController.js
const Server = require('../models/ServerModel');
const Channel = require('../models/ChannelModel');
const Message = require('../models/MessageModel');
const Member = require('../models/MemberModel');

// --- 🟢 YARDIMCI FONKSİYON: YETKİ KONTROLÜ ---
// Bu fonksiyonu Create, Update ve Delete işlemlerinde tekrar tekrar kullanacağız.
// Kod tekrarını önler ve güvenliği tek bir yerden yönetir.
const checkChannelPermission = async (userId, serverId) => {
  const server = await Server.findById(serverId);
  if (!server) return { allowed: false, error: 'Sunucu bulunamadı', code: 404 };

  // 1. SAHİPLİK KONTROLÜ (EN GÜÇLÜ YETKİ)
  // String'e çevirerek karşılaştırıyoruz (ObjectId hatasını önler)
  if (String(server.owner) === String(userId)) {
    return { allowed: true, server };
  }

  // 2. ROL/YETKİ KONTROLÜ
  const membership = await Member.findOne({ user: userId, server: serverId }).populate('roles');
  if (!membership) return { allowed: false, error: 'Bu sunucunun üyesi değilsiniz', code: 403 };

  const hasPermission = membership.roles.some(role =>
    role.permissions.includes('ADMINISTRATOR') ||
    role.permissions.includes('MANAGE_CHANNELS')
  );

  if (hasPermission) return { allowed: true, server };

  return { allowed: false, error: 'Bu işlem için yetkiniz (MANAGE_CHANNELS) yok.', code: 403 };
};


// @desc    Yeni bir kanal oluşturur
// @route   POST /api/v1/servers/:serverId/channels
const createChannel = async (req, res) => {
  try {
    const { name, type, maxUsers, allowedRoles } = req.body;
    const { serverId } = req.params;
    const userId = req.user?.id;

    // 🟢 YETKİ KONTROLÜ (Helper Fonksiyonu Kullanıyoruz)
    const { allowed, error, code, server } = await checkChannelPermission(userId, serverId);
    if (!allowed) return res.status(code).json({ success: false, message: error });

    if (!name) return res.status(400).json({ success: false, message: 'Kanal adı zorunludur' });

    // Kanalı Oluştur
    const newChannel = await Channel.create({
      name: name.trim().toLowerCase().replace(/\s+/g, '-'),
      type: type ? type.toLowerCase() : 'text',
      server: serverId,
      createdBy: userId,
      maxUsers: (type === 'voice' && maxUsers) ? parseInt(maxUsers) : 0,
      allowedRoles: allowedRoles || []
    });

    // Sunucuya ekle
    server.channels.push(newChannel._id);
    await server.save();

    // Socket Bildirimi (Opsiyonel: Kanal listesi anlık güncellensin diye)
    const io = req.app.get('io');
    if (io) {
      io.to(serverId).emit('channelCreated', newChannel);
    }

    res.status(201).json({
      success: true,
      message: 'Kanal başarıyla oluşturuldu',
      data: newChannel,
    });

  } catch (error) {
    console.error("KANAL CREATE HATA:", error);
    res.status(500).json({ success: false, message: 'Kanal oluşturulamadı', error: error.message });
  }
};


// @desc    Bir kanalı günceller
// @route   PUT /api/v1/servers/:serverId/channels/:channelId
const updateChannel = async (req, res) => {
  try {
    const { channelId, serverId } = req.params;
    const { name, maxUsers, allowedRoles } = req.body;
    const userId = req.user.id;

    // 🟢 YETKİ KONTROLÜ
    const { allowed, error, code } = await checkChannelPermission(userId, serverId);
    if (!allowed) return res.status(code).json({ success: false, message: error });

    const channel = await Channel.findById(channelId);
    if (!channel) return res.status(404).json({ success: false, message: 'Kanal bulunamadı' });

    const updatedChannel = await Channel.findByIdAndUpdate(
      channelId,
      {
        name: name ? name.trim().toLowerCase().replace(/\s+/g, '-') : undefined,
        maxUsers,
        allowedRoles
      },
      { new: true, runValidators: true }
    );

    // Socket Bildirimi
    const io = req.app.get('io');
    if (io) {
      io.to(serverId).emit('channelUpdated', updatedChannel);
    }

    res.status(200).json({
      success: true,
      message: 'Kanal güncellendi',
      data: updatedChannel
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Kanal güncellenemedi', error: error.message });
  }
};


// @desc    Bir kanalı siler
// @route   DELETE /api/v1/servers/:serverId/channels/:channelId
const deleteChannel = async (req, res) => {
  try {
    const { serverId, channelId } = req.params;
    const userId = req.user.id;

    // 🟢 YETKİ KONTROLÜ
    const { allowed, error, code } = await checkChannelPermission(userId, serverId);
    if (!allowed) return res.status(code).json({ success: false, message: error });

    const channel = await Channel.findById(channelId);
    if (!channel) return res.status(404).json({ success: false, message: 'Kanal bulunamadı' });

    // 1. Kanalı sil
    await Channel.findByIdAndDelete(channelId);

    // 2. Kanalı Sunucudan kaldır
    await Server.findByIdAndUpdate(serverId, {
      $pull: { channels: channelId }
    });

    // 3. Mesajları Temizle
    await Message.deleteMany({ channel: channelId });

    // 4. Socket Bildirimi (Frontend'den anında silinmesi için)
    const io = req.app.get('io');
    if (io) {
      io.to(serverId).emit('channelDeleted', { channelId });
    }

    res.status(200).json({ success: true, message: 'Kanal başarıyla silindi' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Kanal silinemedi', error: error.message });
  }
};


// --- MEVCUT DİĞER FONKSİYONLAR (Aynı kalacak) ---

const getChannelMessages = async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user.id;

    // 1. Kanalı bul (ve hangi sunucuda olduğunu, izinli rollerini çek)
    const channel = await Channel.findById(channelId).populate('server');
    if (!channel) return res.status(404).json({ success: false, message: 'Kanal bulunamadı' });

    // 🟢 2. YETKİ KONTROLÜ
    // Eğer allowedRoles dizisi doluysa (yani kanal kilitliyse) kontrol et
    if (channel.allowedRoles && channel.allowedRoles.length > 0) {

      // Sunucu sahibi ise geç
      const isOwner = String(channel.server.owner) === String(userId);

      if (!isOwner) {
        // Üyeliği ve Rolleri bul
        const member = await Member.findOne({ server: channel.server._id, user: userId }).populate('roles');

        if (!member) return res.status(403).json({ success: false, message: 'Üye değilsiniz' });

        // Admin ise geç
        const isAdmin = member.roles.some(r => r.permissions.includes('ADMINISTRATOR'));

        if (!isAdmin) {
          // Kullanıcının rolleri ile kanalın izinli rolleri eşleşiyor mu?
          const userRoleIds = member.roles.map(r => String(r._id));
          const hasAccess = channel.allowedRoles.some(allowedRoleId => userRoleIds.includes(String(allowedRoleId)));

          if (!hasAccess) {
            return res.status(403).json({ success: false, message: 'Bu kanalı görüntüleme yetkiniz yok (Özel Kanal).' });
          }
        }
      }
    }

    // 3. Mesajları çek (Yetki varsa burası çalışır)
    const messages = await Message.find({ channel: channelId })
      .populate({
        path: 'author',
        select: 'username avatarUrl onlineStatus level badges activeBadge'
      })
      .sort({ createdAt: 1 });

    res.status(200).json({ success: true, data: messages });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Kanal mesajları çekilemedi', error: error.message });
  }
};

const sendFileMessage = async (req, res) => {
  try {
    const { channelId, serverId } = req.params;
    const userId = req.user.id;

    if (!req.file || !req.file.filename) {
      return res.status(400).json({ success: false, message: 'Dosya işlenemedi.' });
    }

    let fileType = 'other';
    if (req.file.mimetype.startsWith('image')) fileType = 'image';
    else if (req.file.mimetype.startsWith('video')) fileType = 'video';

    const fileUrl = `/uploads/chat_attachments/${req.file.filename}`;
    const textContent = (req.body && req.body.content) ? req.body.content : '';

    const newMessage = await Message.create({
      author: userId, channel: channelId, server: serverId,
      fileUrl: fileUrl, fileType: fileType, content: textContent
    });

    const populatedMessage = await Message.findById(newMessage._id).populate('author', 'username');

    const io = req.app.get('io');
    if (io) io.to(channelId).emit('newMessage', populatedMessage);

    res.status(201).json({ success: true, data: populatedMessage });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Dosya gönderilemedi', error: error.message });
  }
};

const deleteChannelMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ success: false });

    // Mesaj sahibi mi?
    if (message.author.toString() !== userId) return res.status(403).json({ success: false });

    await Message.findByIdAndDelete(messageId);

    const io = req.app.get('io');
    if (io) io.to(message.channel.toString()).emit('messageDeleted', { messageId });

    res.status(200).json({ success: true, message: 'Mesaj silindi' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  createChannel,
  getChannelMessages,
  updateChannel,
  deleteChannel,
  sendFileMessage,
  deleteChannelMessage
};