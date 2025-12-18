// src/api/controllers/channelController.js
const Server = require('../models/ServerModel');
const Channel = require('../models/ChannelModel');
const Message = require('../models/MessageModel');
const Member = require('../models/MemberModel');

// @desc    Yeni bir kanal oluşturur
// @route   POST /api/v1/servers/:serverId/channels
const createChannel = async (req, res) => {
  try {
    // --- GÜNCELLENDİ ---
    const { name, type, maxUsers, allowedRoles } = req.body;
    // ---------------------
    const { serverId } = req.params;
    const userId = req.user?.id;

    if (!name) return res.status(400).json({ success: false, message: 'Kanal adı zorunludur' });

    const server = await Server.findById(serverId);
    if (!server) return res.status(404).json({ success: false, message: 'Sunucu bulunamadı' });

    // İzin kontrolü (Örn: Sadece adminler)
    const membership = await Member.findOne({ user: userId, server: serverId }).populate('roles');
    if (!membership)
      return res.status(403).json({ success: false, message: 'Bu sunucunun üyesi değilsiniz.' });

    const isAdmin = membership.roles?.some(role => role.permissions?.includes('ADMINISTRATOR'));
    if (server.owner.toString() !== userId && !isAdmin)
      return res.status(403).json({ success: false, message: 'Yetkisiz işlem: Kanal oluşturma izniniz yok.' });

    // --- GÜNCELLENDİ ---
    const newChannel = await Channel.create({
      name,
      type: type.toLowerCase(),
      server: serverId,
      createdBy: userId,
      // Eğer tip 'voice' ise maxUsers'ı ekle, değilse 0 yap
      maxUsers: type.toLowerCase() === 'voice' ? (maxUsers || 10) : 0,
      // İzin verilen rolleri ekle (boşsa herkes)
      allowedRoles: allowedRoles || []
    });
    // ---------------------

    server.channels.push(newChannel._id);
    await server.save();

    // TODO: Socket.io ile sunucudaki herkese 'channelCreated' event'i yolla
    // req.io.to(serverId).emit('channelCreated', newChannel);

    res.status(201).json({
      success: true,
      message: 'Kanal başarıyla oluşturuldu',
      data: newChannel,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Kanal oluşturulamadı', error: error.message });
  }
};

// --- YENİ EKLENDİ ---
// @desc    Bir kanalı günceller
// @route   PUT /api/v1/servers/:serverId/channels/:channelId
const updateChannel = async (req, res) => {
    try {
        const { channelId } = req.params;
        // Güncellenebilecek alanlar
        const { name, maxUsers, allowedRoles } = req.body;

        // TODO: İzin kontrolü (MANAGE_CHANNELS veya ADMINISTRATOR)

        const channel = await Channel.findById(channelId);
        if (!channel) {
            return res.status(404).json({ success: false, message: 'Kanal bulunamadı' });
        }

        const updatedChannel = await Channel.findByIdAndUpdate(
            channelId,
            { name, maxUsers, allowedRoles },
            { new: true, runValidators: true }
        );

        // TODO: Socket.io ile sunucudaki herkese 'channelUpdated' event'i yolla
        // req.io.to(channel.server.toString()).emit('channelUpdated', updatedChannel);

        res.status(200).json({
            success: true,
            message: 'Kanal güncellendi',
            data: updatedChannel
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Kanal güncellenemedi', error: error.message });
    }
};

// --- YENİ EKLENDİ ---
// @desc    Bir kanalı siler
// @route   DELETE /api/v1/servers/:serverId/channels/:channelId
const deleteChannel = async (req, res) => {
    try {
        const { serverId, channelId } = req.params;

        // TODO: İzin kontrolü (MANAGE_CHANNELS veya ADMINISTRATOR)

        const channel = await Channel.findById(channelId);
        if (!channel) {
            return res.status(404).json({ success: false, message: 'Kanal bulunamadı' });
        }

        // 1. Kanalı sil
        await Channel.findByIdAndDelete(channelId);

        // 2. Kanalı Sunucudan kaldır
        await Server.findByIdAndUpdate(serverId, {
            $pull: { channels: channelId }
        });

        // TODO: Bu kanaldaki tüm mesajları sil
        // await Message.deleteMany({ channel: channelId });

        // TODO: Socket.io ile sunucudaki herkese 'channelDeleted' event'i yolla
        // req.io.to(serverId).emit('channelDeleted', { channelId });

        res.status(200).json({ success: true, message: 'Kanal başarıyla silindi' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Kanal silinemedi', error: error.message });
    }
};


// Mesaj geçmişini çeken fonksiyon (Bu zaten doğruydu)
const getChannelMessages = async (req, res) => {
  try {
    const { channelId } = req.params;

    const messages = await Message.find({ channel: channelId })
      .sort('createdAt')
      .populate('author', 'username');

    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Kanal mesajları çekilemedi', error: error.message });
  }
};
const sendFileMessage = async (req, res) => {
    try {
        const { channelId, serverId } = req.params;
        const userId = req.user.id;

        if (!req.file || !req.file.filename) {
            return res.status(400).json({ success: false, message: 'Dosya işlenemedi veya kaydedilemedi.' });
        }

        let fileType = 'other';
        if (req.file.mimetype.startsWith('image')) {
            fileType = 'image';
        } else if (req.file.mimetype.startsWith('video')) {
            fileType = 'video';
        }

        const fileUrl = `/uploads/chat_attachments/${req.file.filename}`;

        // --- HATA DÜZELTMESİ (ASIL ÇÖZÜM) ---
        // req.body, hiç metin alanı gönderilmezse 'undefined' olabilir.
        // Bu yüzden 'req.body.content' yerine, önce 'req.body'nin varlığını kontrol etmeliyiz.
        const textContent = (req.body && req.body.content) ? req.body.content : '';
        // ------------------------------------

        const newMessage = await Message.create({
            author: userId,
            channel: channelId,
            server: serverId,
            fileUrl: fileUrl,
            fileType: fileType,
            content: textContent // Güvenli değişkeni kullan
        });

        const populatedMessage = await Message.findById(newMessage._id)
                                          .populate('author', 'username');

        const io = req.app.get('io');
        if (io) {
            io.to(channelId).emit('newMessage', populatedMessage);
        }

        res.status(201).json({ success: true, data: populatedMessage });

    } catch (error) {
        console.error("Dosya gönderme hatası:", error);
        res.status(500).json({ success: false, message: 'Dosya gönderilemedi', error: error.message });
    }
};

// @desc    Kanal mesajı sil
// @route   DELETE /api/v1/servers/:serverId/channels/:channelId/messages/:messageId
const deleteChannelMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Mesaj bulunamadı' });
    }

    // ❗ Sadece mesaj sahibi
    if (message.author.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Bu mesajı silemezsiniz' });
    }

    await Message.findByIdAndDelete(messageId);

    const io = req.app.get('io');
    if (io) {
      io.to(message.channel.toString()).emit('messageDeleted', {
        messageId
      });
    }

    res.status(200).json({ success: true, message: 'Mesaj silindi' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Mesaj silinemedi', error: error.message });
  }
};


module.exports = {
  createChannel,
  getChannelMessages,
  updateChannel, // YENİ
  deleteChannel, // YENİ
    sendFileMessage,
    deleteChannelMessage
};