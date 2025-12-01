// src/controllers/friendController.js

const User = require('../models/UserModel');
const FriendRequest = require('../models/FriendRequestModel');
const Conversation = require('../models/ConversationModel');
const PrivateMessage = require('../models/PrivateMessageModel');

// 1. İSTEK GÖNDERME
const sendFriendRequest = async (req, res) => {
  try {
    const { recipientUsername, targetUserId } = req.body;
    const requesterId = req.user.id;

    if (!recipientUsername && !targetUserId) return res.status(400).json({ success: false, message: 'Kullanıcı belirtilmedi' });

    let recipient = null;
    if (targetUserId) recipient = await User.findById(targetUserId);
    else if (recipientUsername) recipient = await User.findOne({ username: recipientUsername });

    if (!recipient) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });

    const recipientId = recipient._id.toString();
    if (requesterId === recipientId) return res.status(400).json({ success: false, message: 'Kendine istek atamazsın' });

    const existingRequest = await FriendRequest.findOne({
      $or: [
        { requester: requesterId, recipient: recipientId },
        { requester: recipientId, recipient: requesterId },
      ],
      status: 'pending',
    });

    if (existingRequest) return res.status(400).json({ success: false, message: 'Zaten bekleyen bir istek var' });

    const newRequest = await FriendRequest.create({
      requester: requesterId,
      recipient: recipientId,
      status: 'pending',
    });

    const populatedRequest = await FriendRequest.findById(newRequest._id)
        .populate('requester', 'username email avatarUrl onlineStatus lastSeenAt')
        .populate('recipient', 'username email avatarUrl onlineStatus lastSeenAt');

    // SOCKET: Alıcıya bildir
    const io = req.app.get('io');
    if (io) {
        io.to(recipientId).emit('newFriendRequest', populatedRequest);
    }

    return res.status(201).json({ success: true, message: 'İstek gönderildi', data: populatedRequest });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Hata', error: error.message });
  }
};

// 2. İSTEĞE YANIT VER (KABUL/RED)
const respondToFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { response } = req.body;
    const userId = req.user.id;

    const request = await FriendRequest.findById(requestId);
    if (!request) return res.status(404).json({ success: false, message: 'İstek bulunamadı' });

    if (request.recipient.toString() !== userId) return res.status(403).json({ success: false, message: 'Yetkisiz işlem' });

    if (response === 'accepted') {
      request.status = 'accepted';
      await request.save();

      const requesterId = request.requester.toString();
      const recipientId = request.recipient.toString();

      await User.findByIdAndUpdate(requesterId, { $push: { friends: recipientId } });
      await User.findByIdAndUpdate(recipientId, { $push: { friends: requesterId } });

      // SOCKET: İsteği gönderen kişiye "Kabul Edildi" haberi ver
      const io = req.app.get('io');
      if (io) {
          // Kabul eden kişinin (bizim) bilgilerimizi gönderene yolla
          const acceptorUser = await User.findById(recipientId).select('username avatarUrl onlineStatus lastSeenAt email');
          io.to(requesterId).emit('friendRequestAccepted', acceptorUser);
      }

      // Bize (kabul edene) yeni arkadaşın bilgisini dön
      const newFriendForMe = await User.findById(requesterId).select('username avatarUrl onlineStatus lastSeenAt email');
      return res.status(200).json({ success: true, message: 'Kabul edildi', data: newFriendForMe });

    } else if (response === 'rejected') {
      await FriendRequest.findByIdAndDelete(requestId);

      // SOCKET: Reddedildi bilgisini karşı tarafa at (Listesinden silsin)
      const io = req.app.get('io');
      if (io) {
          io.to(request.requester.toString()).emit('friendRequestCancelled', { cancelledUserId: userId });
      }

      return res.status(200).json({ success: true, message: 'Reddedildi' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Hata', error: error.message });
  }
};

// 3. ARKADAŞ SİL / İSTEK İPTAL ET
const removeFriend = async (req, res) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.body.targetUserId || req.params.friendId;

    if (!targetUserId) return res.status(400).json({ success: false, message: 'Hedef ID gerekli' });

    // 1. Arkadaşlıktan çıkar
    await Promise.all([
      User.findByIdAndUpdate(userId, { $pull: { friends: targetUserId } }),
      User.findByIdAndUpdate(targetUserId, { $pull: { friends: userId } }),
    ]);

    // 2. İstekleri sil (Varsa)
    const deletedRequest = await FriendRequest.findOneAndDelete({
        $or: [
          { requester: userId, recipient: targetUserId },
          { requester: targetUserId, recipient: userId },
        ],
    });

    // SOCKET: Karşı tarafa haber ver
    const io = req.app.get('io');
    if (io) {
        // "removedUserId: userId" -> Beni (işlemi yapanı) listenden sil
        io.to(targetUserId.toString()).emit('friendRemoved', { removedUserId: userId });

        // Eğer istek varsa iptal edildiğini bildir
        io.to(targetUserId.toString()).emit('friendRequestCancelled', { cancelledUserId: userId });
    }

    return res.status(200).json({ success: true, message: 'Bağlantı kaldırıldı' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Hata', error: error.message });
  }
};

// Diğer fonksiyonlar (değişmedi, olduğu gibi kalabilir)
const getPendingRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const requests = await FriendRequest.find({
      $or: [{ recipient: userId }, { requester: userId }],
      status: 'pending',
    })
    .populate('requester', 'username email avatarUrl onlineStatus lastSeenAt')
    .populate('recipient', 'username email avatarUrl onlineStatus lastSeenAt');

    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (error) { res.status(500).json({ success: false, message: 'Hata', error: error.message }); }
};

const getFriends = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate('friends', 'username email avatarUrl onlineStatus lastSeenAt');
    res.status(200).json({ success: true, data: user ? user.friends : [] });
  } catch (error) { res.status(500).json({ success: false, message: 'Hata', error: error.message }); }
};

const getDmMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const messages = await PrivateMessage.find({ conversation: conversationId }).sort('createdAt').populate('author', 'username');
        res.status(200).json({ success: true, data: messages });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

const getOrCreateConversation = async (req, res) => {
    try {
        const { friendId } = req.params;
        const userId = req.user.id;
        const user = await User.findById(userId);
        const isFriend = user.friends.some(fId => fId.equals(friendId));
        if (!isFriend) return res.status(403).json({ success: false, message: 'Önce arkadaş olmalısınız' });

        let conversation = await Conversation.findOne({ participants: { $all: [userId, friendId] } }).populate('participants', 'username email');
        if (!conversation) {
            conversation = await Conversation.create({ participants: [userId, friendId] });
            conversation = await Conversation.findById(conversation._id).populate('participants', 'username email');
            res.status(201).json({ success: true, data: conversation });
        } else {
            res.status(200).json({ success: true, data: conversation });
        }
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

const sendPrivateFileMessage = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user.id;
        if (!req.file) return res.status(400).json({ success: false, message: 'Dosya yok' });
        const fileUrl = `/uploads/chat_attachments/${req.file.filename}`;
        const fileType = req.file.mimetype.startsWith('image') ? 'image' : req.file.mimetype.startsWith('video') ? 'video' : 'other';
        const newDm = await PrivateMessage.create({
            content: req.body.content || '', author: userId, conversation: conversationId, fileUrl, fileType
        });
        const populatedDm = await PrivateMessage.findById(newDm._id).populate('author', 'username');
        const io = req.app.get('io');
        if (io) {
            io.to(conversationId).emit('newPrivateMessage', populatedDm);
            const conv = await Conversation.findById(conversationId);
            const recipient = conv.participants.find(p => p.toString() !== userId);
            if(recipient) io.to(recipient.toString()).emit('unreadDm', { conversationId });
        }
        res.status(201).json({ success: true, data: populatedDm });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

module.exports = {
  sendFriendRequest,
  getPendingRequests,
  respondToFriendRequest,
  removeFriend,
  getFriends,
  getOrCreateConversation,
  getDmMessages,
  sendPrivateFileMessage
};