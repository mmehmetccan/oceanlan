// src/controllers/userController.js

const bcrypt = require('bcryptjs');
const User = require('../models/UserModel');
const Member = require('../models/MemberModel');
const FriendRequest = require('../models/FriendRequestModel');
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto');


// @desc    Giriş yapan kullanıcının profilini getir
// @route   GET /api/v1/users/me
// @access  Private
const getMe = async (req, res) => {
  try {
    // req.user, authMiddleware'den geliyor
    res.status(200).json({
      success: true,
      data: req.user,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: 'Sunucu Hatası', error: error.message });
  }
};

// @desc    Kullanıcı profilini getir (başkasının profili)
// @route   GET /api/v1/users/:userId/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    // 1) Profiline baktığımız hedef kullanıcı
    const targetUser = await User.findById(userId).select(
      '_id username createdAt avatarUrl friends'
    );

    if (!targetUser) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    // 2) İstek yapan (giriş yapmış) kullanıcı
    const requesterId = req.user ? req.user.id : null;

    const memberships = await Member.find({ user: userId }).populate(
      'server',
      '_id name'
    );

    let friendDocs = [];
    if (targetUser.friends && targetUser.friends.length > 0) {
      friendDocs = await User.find({
        _id: { $in: targetUser.friends },
      }).select('_id username avatarUrl');
    }

    const servers = [];
    const seenServerIds = new Set();
    memberships.forEach((membership) => {
      if (membership.server) {
        const serverId = membership.server._id.toString();
        if (!seenServerIds.has(serverId)) {
          servers.push({
            _id: membership.server._id,
            name: membership.server.name,
          });
          seenServerIds.add(serverId);
        }
      }
    });

    const friends = friendDocs.map((friend) => ({
      _id: friend._id,
      username: friend.username,
      avatarUrl: friend.avatarUrl,
    }));

    // 5) İstek yapan kişi, hedef kullanıcının friends listesinde mi?
    let isFriend = false;
    if (requesterId && targetUser.friends && targetUser.friends.length > 0) {
      isFriend = targetUser.friends.some(
        (fid) => fid.toString() === requesterId.toString()
      );
    }

    // Şimdilik arkadaşlık isteği mantığını kurmadık
    let isRequestSent = false;
    if (requesterId && !isFriend) {
      isRequestSent = !!(await FriendRequest.exists({
        requester: requesterId,
        recipient: targetUser._id,
        status: 'pending',
      }));
    }

    // 6) Frontend'e döneceğimiz objeyi sadeleştir
    return res.json({
      user: {
        _id: targetUser._id,
        username: targetUser.username,
        createdAt: targetUser.createdAt,
        avatarUrl: targetUser.avatarUrl,
      },
      servers,
      friends,
      isFriend,
      isRequestSent,
    });
  } catch (err) {
    console.error('[getUserProfile] error', err);
    return res
      .status(500)
      .json({ message: 'Profil bilgileri alınırken bir hata oluştu.' });
  }
};

// @desc    Kullanıcı adı, e-posta veya şifreyi güncelle
// @route   PUT /api/v1/users/me
// @access  Private
const updateMe = async (req, res) => {
  const { username, email, newPassword, currentPassword } = req.body; // email burada "yeni istenen email"

  try {
    const user = await User.findById(req.user.id).select('+password');

    // 1. Şifre Değişikliği (Aynı)
    if (newPassword) {
       // ... (eski şifre kontrol kodların aynı kalsın)
       if (!currentPassword) return res.status(400).json({success: false, message: 'Mevcut şifre gerekli'});
       const isMatch = await bcrypt.compare(currentPassword, user.password);
       if (!isMatch) return res.status(401).json({success: false, message: 'Mevcut şifre yanlış'});
       user.password = newPassword;
    }

    // 2. Kullanıcı Adı (Direkt değişir)
    if (username) user.username = username;

    // 3. E-POSTA DEĞİŞİKLİĞİ İSTEĞİ (YENİ MANTIK)
    let emailMessage = '';
    if (email && email !== user.email) {
      // Yeni email zaten kullanımda mı?
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ success: false, message: 'Bu e-posta zaten kullanılıyor.' });
      }

      // Hemen değiştirme! 'newEmail' alanına kaydet ve token oluştur
      user.newEmail = email;
      const confirmToken = user.getVerificationToken('emailChange');

      // Onay linki
      const confirmUrl = `http://oceanlan.com/verify-change-email/${confirmToken}`;
      const message = `E-posta adresinizi değiştirmek istediniz. Onaylamak için tıklayın:\n\n${confirmUrl}`;

      try {
        await sendEmail({
          email: email, // YENİ E-POSTAYA GÖNDER
          subject: 'E-posta Değişikliği Onayı',
          message
        });
        emailMessage = ' Yeni e-posta adresinize onay linki gönderildi.';
      } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Onay maili gönderilemedi.' });
      }
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: `Profil güncellendi.${emailMessage}`,
      user: { id: user._id, username: user.username, email: user.email, avatarUrl: user.avatarUrl }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// --- Profil Fotoğrafı (SADECE MANTIK İSKELETİ) ---
// NOT: Bu rota multer middleware'i gerektirir.
const updateProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen geçerli bir resim dosyası seçin.',
      });
    }

    const user = await User.findById(req.user.id);

    // Multer tarafından kaydedilen dosya yolu
    user.avatarUrl = `/uploads/avatars/${req.file.filename}`;

    await user.save();
const updatedUserPublicData = {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl, // <-- BU ALAN KESİNLİKLE OLMALIDIR
        // Diğer gerekli alanlar buraya eklenebilir
    };
    res.status(200).json({
      success: true,
      message: 'Profil fotoğrafı başarıyla güncellendi.',
      user: updatedUserPublicData, // Frontend'e gönder
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Sunucu Hatası: Fotoğraf güncellenemedi.',
    });
  }
};

const verifyNewEmail = async (req, res) => {
    try {
        const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');

        const user = await User.findOne({
            newEmailToken: tokenHash,
            newEmailExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ success: false, message: 'Token geçersiz veya süresi dolmuş.' });
        }

        // Değişikliği uygula
        user.email = user.newEmail; // Asıl emaili güncelle
        user.newEmail = undefined;
        user.newEmailToken = undefined;
        user.newEmailExpire = undefined;

        await user.save();

        res.status(200).json({ success: true, message: 'E-posta adresiniz başarıyla güncellendi!' });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
  getMe,
  updateMe,
  verifyNewEmail,
  updateProfilePicture,
  getUserProfile,
};
