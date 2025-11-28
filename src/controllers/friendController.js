const User = require('../models/UserModel');
const FriendRequest = require('../models/FriendRequestModel');
const Conversation = require('../models/ConversationModel');
const PrivateMessage = require('../models/PrivateMessageModel'); // En üste eklenmeli

// @desc    Başka bir kullanıcıya arkadaşlık isteği gönderir
// @route   POST /api/v1/friends/request
// @access  Private
const sendFriendRequest = async (req, res) => {
  try {
    const { recipientUsername, targetUserId } = req.body;
    const requesterId = req.user.id;

    if (!recipientUsername && !targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen kullanıcı adı veya hedef kullanıcı ID bilgisini gönderin',
      });
    }

    let recipient = null;
    if (targetUserId) {
      recipient = await User.findById(targetUserId);
    } else if (recipientUsername) {
      recipient = await User.findOne({ username: recipientUsername });
    }

    if (!recipient) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    const recipientId = recipient._id.toString();

    if (requesterId === recipientId) {
      return res.status(400).json({
        success: false,
        message: 'Kendinize arkadaşlık isteği gönderemezsiniz',
      });
    }

    // Zaten arkadaş mı?
    const requester = await User.findById(requesterId);
    if (requester.friends.includes(recipientId)) {
      return res.status(400).json({ success: false, message: 'Bu kullanıcı ile zaten arkadaşsınız' });
    }

    // Bekleyen istek var mı?
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { requester: requesterId, recipient: recipientId },
        { requester: recipientId, recipient: requesterId },
      ],
      status: 'pending',
    });

    if (existingRequest) {
      return res.status(400).json({ success: false, message: 'Zaten bekleyen bir istek var' });
    }

    const newRequest = await FriendRequest.create({
      requester: requesterId,
      recipient: recipientId,
      status: 'pending',
    });

    // --- SOCKET.IO BİLDİRİMİ (YENİ) ---
    const io = req.app.get('io');
    if (io) {
        // İsteği alan kişinin (recipient) ekranına düşmesi için isteği populate edip gönderiyoruz
        const populatedRequest = await FriendRequest.findById(newRequest._id)
            .populate('requester', 'username email avatar avatarUrl onlineStatus lastSeenAt'); // Gönderenin bilgileri

        // Alıcının odasına 'newFriendRequest' event'i at
        io.to(recipientId).emit('newFriendRequest', populatedRequest);
    }
    // ----------------------------------

    return res.status(201).json({
      success: true,
      message: 'Arkadaşlık isteği başarıyla gönderildi',
      data: newRequest,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Sunucu Hatası', error: error.message });
  }
};

const getPendingRequests = async (req, res) => {
  try {
    // 1. Kimin isteklerine bakıyoruz? (Giriş yapan kullanıcı, yani 'mehmet')
    const userId = req.user.id;

    // 2. Veritabanında, 'recipient' (alıcı) alanı 'mehmet' olan
    //    ve 'status' alanı 'pending' (beklemede) olan tüm istekleri bul.
    const requests = await FriendRequest.find({
      recipient: userId,
      status: 'pending',
    }).populate('requester', 'username email avatar avatarUrl onlineStatus lastSeenAt'); // 'requester' (gönderen) bilgisini de ekle

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Sunucu Hatası', error: error.message });
  }
};

const respondToFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { response } = req.body; // 'accepted' veya 'rejected'
    const userId = req.user.id;

    const request = await FriendRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'İstek bulunamadı' });
    }

    // Sadece alıcı yanıt verebilir
    if (request.recipient.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Bu isteğe yanıt verme yetkiniz yok' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Bu istek zaten sonuçlanmış' });
    }

    if (response === 'accepted') {
      request.status = 'accepted';
      await request.save();

      const requesterId = request.requester;
      const recipientId = request.recipient;

      // İki kullanıcının da friends listesine ekle
      await User.findByIdAndUpdate(requesterId, { $push: { friends: recipientId } });
      await User.findByIdAndUpdate(recipientId, { $push: { friends: requesterId } });

      // --- SOCKET.IO KABUL BİLDİRİMİ (YENİ) ---
      const io = req.app.get('io');
      if (io) {
          // İsteği gönderen kişiye (Requester) "Kabul Edildi" haberi ver
          // Ona bizim (kabul edenin) bilgilerimizi yolla ki listesine eklesin
          const acceptorUser = await User.findById(recipientId).select('username avatarUrl onlineStatus lastSeenAt email');

          // İsteği gönderen kişinin odasına sinyal yolla
          io.to(requesterId.toString()).emit('friendRequestAccepted', acceptorUser);
      }
      // ----------------------------------------

      return res.status(200).json({
        success: true,
        message: 'Arkadaşlık isteği kabul edildi',
      });
    } else if (response === 'rejected') {
      request.status = 'rejected';
      await request.save();
      return res.status(200).json({
        success: true,
        message: 'Arkadaşlık isteği reddedildi',
      });
    } else {
      return res.status(400).json({ success: false, message: 'Geçersiz yanıt' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Sunucu Hatası', error: error.message });
  }
};

const getOrCreateConversation = async (req, res) => {
  try {
    // 1. Gerekli bilgileri al
    const { friendId } = req.params; // Kiminle konuşmak istiyoruz
    const userId = req.user.id; // Biz kimiz (giriş yapan)

    // 2. İki kullanıcı da arkadaş mı diye son bir kontrol (isteğe bağlı ama güvenli)
    const user = await User.findById(userId);
    const isFriend = user.friends.some(fId => fId.equals(friendId));
    if (!isFriend) {
      return res.status(403).json({ success: false, message: 'Bu kullanıcıyla DM başlatmak için önce arkadaş olmalısınız' });
    }

    // 3. Bu iki kişi arasında zaten bir sohbet var mı?
    //    Katılımcı (participants) dizisinde HEM 'userId' HEM DE 'friendId' olanı bul
    let conversation = await Conversation.findOne({
      participants: { $all: [userId, friendId] },
    }).populate('participants', 'username email'); // Katılımcı bilgilerini doldur

    // 4. Eğer sohbet yoksa (ilk kez DM atılacaksa), yenisini oluştur
    if (!conversation) {
      conversation = await Conversation.create({
        participants: [userId, friendId],
      });
      // Yeni oluşturulanı da populate et
      conversation = await Conversation.findById(conversation._id)
        .populate('participants', 'username email');

      res.status(201).json({ // 201: Oluşturuldu
        success: true,
        message: 'Yeni sohbet oluşturuldu',
        data: conversation,
      });

    } else {
      // 5. Zaten varsa, mevcut olanı döndür
      res.status(200).json({ // 200: Başarılı
        success: true,
        message: 'Mevcut sohbet getirildi',
        data: conversation,
      });
    }

  } catch (error) {
    res.status(500).json({ success: false, message: 'Sunucu Hatası', error: error.message });
  }
};

const getFriends = async (req, res) => {
  try {
    const userId = req.user.id; // protect middleware'inden geliyor

    // 1. Kullanıcı nesnesini tüm arkadaş listesiyle birlikte getir
    // User modelinizde 'friends' alanı olmalıdır ve bu alanda arkadaşların ID'leri tutulmalıdır.
    const userWithFriends = await User.findById(userId)
      .select('friends') // Sadece arkadaş listesini çek
      .populate('friends', 'username email avatar avatarUrl onlineStatus lastSeenAt'); // Arkadaş nesnelerini doldur

    if (!userWithFriends) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    // 2. Arkadas listesini normalize et ve dondur
    const normalizedFriends = (userWithFriends.friends || []).map((f) => {
      const obj = f.toObject ? f.toObject() : f;
      return {
        ...obj,
        onlineStatus: obj.onlineStatus || 'offline',
        lastSeenAt: obj.lastSeenAt || null,
      };
    });

    res.status(200).json({
      success: true,
      message: 'Arkadas listesi basariyla getirildi',
      data: normalizedFriends,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Arkadaş listesi getirilirken sunucu hatası', error: error.message });
  }
};

const removeFriend = async (req, res) => {
  try {
    const userId = req.user.id;
    const targetUserId = req.body.targetUserId || req.params.friendId;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Hedef kullanici ID si gerekli',
      });
    }

    if (userId.toString() === targetUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Kendinizi arkadas listeden cikaramazsiniz',
      });
    }

    const [user, targetUser] = await Promise.all([
      User.findById(userId).select('friends'),
      User.findById(targetUserId).select('_id'),
    ]);

    if (!user || !targetUser) {
      return res
        .status(404)
        .json({ success: false, message: 'Kullanici bulunamadi' });
    }

    const isFriend = user.friends.some(
      (friendId) => friendId.toString() === targetUserId.toString()
    );

    if (!isFriend) {
      return res.status(400).json({
        success: false,
        message: 'Bu kullanici ile arkadas degilsiniz',
      });
    }

    await Promise.all([
      User.findByIdAndUpdate(userId, { $pull: { friends: targetUserId } }),
      User.findByIdAndUpdate(targetUserId, { $pull: { friends: userId } }),
      FriendRequest.deleteMany({
        $or: [
          { requester: userId, recipient: targetUserId },
          { requester: targetUserId, recipient: userId },
        ],
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Arkadaslik baglantisi kaldirildi',
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: 'Sunucu Hatasi', error: error.message });
  }
};

const getDmMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Sadece sohbet ID'sine ait mesajları çek, kronolojik sırala ve yazarı doldur
    const messages = await PrivateMessage.find({ conversation: conversationId })
      .sort('createdAt')
      .populate('author', 'username');

    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'DM mesajları çekilemedi', error: error.message });
  }
};

const sendPrivateFileMessage = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user.id;

        if (!req.file || !req.file.filename) {
            return res.status(400).json({ success: false, message: 'Dosya işlenemedi.' });
        }

        let fileType = 'other';
        if (req.file.mimetype.startsWith('image')) fileType = 'image';
        else if (req.file.mimetype.startsWith('video')) fileType = 'video';

        const fileUrl = `/uploads/chat_attachments/${req.file.filename}`;
        const textContent = (req.body && req.body.content) ? req.body.content : '';

        // 1. Mesajı oluştur
        const newDm = await PrivateMessage.create({
            content: textContent,
            author: userId,
            conversation: conversationId,
            fileUrl: fileUrl,
            fileType: fileType
        });

        // 2. Populate et
        const populatedDm = await PrivateMessage.findById(newDm._id)
                                          .populate('author', 'username');

        // 3. Socket ile gönder
        const io = req.app.get('io');
        if (io) {
            // Odaya mesajı at
            io.to(conversationId).emit('newPrivateMessage', populatedDm);

            // Bildirim için (unreadDm)
            const conversation = await Conversation.findById(conversationId);
            if (conversation) {
                const recipientId = conversation.participants.find(p => p.toString() !== userId);
                if (recipientId) {
                    io.to(recipientId.toString()).emit('unreadDm', { conversationId });
                }
            }
        }

        res.status(201).json({ success: true, data: populatedDm });

    } catch (error) {
        console.error("DM Dosya gönderme hatası:", error);
        res.status(500).json({ success: false, message: 'Dosya gönderilemedi', error: error.message });
    }
};


// module.exports'u GÜNCELLE
module.exports = {
  sendFriendRequest,
  getPendingRequests,
  respondToFriendRequest,
  getOrCreateConversation, // YENİ EKLENDİ
  getFriends,
  removeFriend,
  getDmMessages,
  sendPrivateFileMessage,
};
