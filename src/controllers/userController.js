// src/controllers/userController.js

const bcrypt = require('bcryptjs');
const User = require('../models/UserModel');
const Member = require('../models/MemberModel');
const FriendRequest = require('../models/FriendRequestModel');
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto');
const https = require('https'); // Node.js yerleşik modülü
const jwt = require('jsonwebtoken');

const ensureGamificationData = async (user) => {
  let changed = false;

  if (user.xp === undefined) { user.xp = 0; changed = true; }
  if (user.level === undefined) { user.level = 1; changed = true; }
  if (!user.badges) { user.badges = []; changed = true; }

  if (!user.stats) {
    user.stats = { createdServers: 0, friendCount: 0, messagesSent: 0, voiceTime: 0 };
    changed = true;
  } else {
    // Stats var ama içi eksikse tamamla
    if (user.stats.createdServers === undefined) { user.stats.createdServers = 0; changed = true; }
    if (user.stats.friendCount === undefined) { user.stats.friendCount = 0; changed = true; }
    if (user.stats.messagesSent === undefined) { user.stats.messagesSent = 0; changed = true; }
    if (user.stats.voiceTime === undefined) { user.stats.voiceTime = 0; changed = true; }
  }

  if (changed) {
    await user.save(); // Eksik verileri veritabanına kaydet
    console.log(`[UserRepair] Kullanıcı verileri onarıldı: ${user.username}`);
  }
  return user;
};


// @desc    Giriş yapan kullanıcının profilini getir
// @route   GET /api/v1/users/me
// @access  Private
const getMe = async (req, res) => {
  try {
    // 1. Kullanıcıyı bul
    let user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    // 2. Eksik gamification verilerini onar
    user = await ensureGamificationData(user);

    // 3. 🟢 EKLENDİ: Kullanıcının üye olduğu sunucuları Member tablosundan çek
    const memberships = await Member.find({ user: user._id }).populate('server', '_id name iconUrl');
    // Sunucu listesini oluştur
    const servers = memberships
      .filter(m => m.server) // Silinmiş sunucuları filtrele
      .map(m => ({
        _id: m.server._id,
        name: m.server.name,
        iconUrl: m.server.iconUrl
      }));

    // 4. Cevabı döndür (user objesini JSON'a çevirip içine servers ekliyoruz)
    res.status(200).json({
      success: true,
      user: {
        ...user.toObject(), // Mongoose dökümanını normal objeye çevir
        servers: servers    // Sunucu listesini ekle
      },
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Sunucu Hatası', error: error.message });
  }
};

// @desc    Kullanıcı profilini getir (başkasının profili)
// @route   GET /api/v1/users/:userId/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    // 1) Profiline baktığımız hedef kullanıcı
    // 🟢 DÜZELTME: Tüm gamification alanlarını seçiyoruz
    let targetUser = await User.findById(userId).select(
      '_id username createdAt avatarUrl friends level xp badges stats'
    );

    if (!targetUser) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    // 🟢 DÜZELTME: Hedef kullanıcı eskiyse hemen onar
    targetUser = await ensureGamificationData(targetUser);

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
      }).select('_id username avatarUrl level badges');
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
            iconUrl: membership.server.iconUrl,
          });
          seenServerIds.add(serverId);
        }
      }
    });

    const friends = friendDocs.map((friend) => ({
      _id: friend._id,
      username: friend.username,
      avatarUrl: friend.avatarUrl,
      level: friend.level || 1, // Default değer
      badges: friend.badges || []
    }));

    let isFriend = false;
    if (requesterId && targetUser.friends && targetUser.friends.length > 0) {
      isFriend = targetUser.friends.some(
        (fid) => fid.toString() === requesterId.toString()
      );
    }

    let isRequestSent = false;
    if (requesterId && !isFriend) {
      isRequestSent = !!(await FriendRequest.exists({
        requester: requesterId,
        recipient: targetUser._id,
        status: 'pending',
      }));
    }

    return res.json({
      user: {
        _id: targetUser._id,
        username: targetUser.username,
        createdAt: targetUser.createdAt,
        avatarUrl: targetUser.avatarUrl,
        // Artık bu verilerin dolu olduğundan eminiz
        level: targetUser.level,
        xp: targetUser.xp,
        badges: targetUser.badges
      },
      servers,
      friends,
      isFriend,
      isRequestSent,
    });
  } catch (err) {
    console.error('[getUserProfile] error', err);
    return res.status(500).json({ message: 'Profil bilgileri alınırken bir hata oluştu.' });
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
      if (!currentPassword) return res.status(400).json({ success: false, message: 'Mevcut şifre gerekli' });
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) return res.status(401).json({ success: false, message: 'Mevcut şifre yanlış' });
      user.password = newPassword;
    }

    // 2. Kullanıcı Adı (Direkt değişir)
    if (username && username !== user.username) {
      // 🟢 Regex Açıklaması:
      // ^...$ : Tam eşleşme (mehmet yazınca mehmetcan'ı bulmasın diye)
      // 'i'   : Case Insensitive (Büyük küçük harf görmezden gel)
      const existingUser = await User.findOne({
        username: { $regex: new RegExp(`^${username}$`, 'i') }
      });

      // Eğer bir kullanıcı bulunduysa VE bulunan kişi kendisi değilse hata ver
      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        return res.status(400).json({ success: false, message: 'Bu kullanıcı adı zaten kullanımda.' });
      }

      user.username = username;
    }
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


const equipBadge = async (req, res) => {
  try {
    const { badgeId } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    // Eğer badgeId boş geldiyse (null), rozeti çıkar demektir
    if (!badgeId) {
      user.activeBadge = undefined; // veya null
      await user.save();
      return res.status(200).json({ success: true, message: 'Rozet çıkarıldı.', data: null });
    }

    // Kullanıcının bu rozete sahip olup olmadığını kontrol et
    const badgeToEquip = user.badges.find(b => b.id === badgeId);

    if (!badgeToEquip) {
      return res.status(400).json({ success: false, message: 'Bu rozete sahip değilsiniz.' });
    }

    // Rozeti kuşan
    user.activeBadge = {
      id: badgeToEquip.id,
      name: badgeToEquip.name,
      icon: badgeToEquip.icon
    };

    await user.save();

    // İSTEĞE BAĞLI: Socket ile tüm sunucuya kullanıcının güncellendiğini bildir
    // Böylece chatte anlık olarak rozet değişir.
    if (req.io) {
      req.io.emit('memberUpdated', { userId: user._id });
    }

    res.status(200).json({
      success: true,
      message: `${badgeToEquip.name} kuşanıldı!`,
      data: user.activeBadge
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Sunucu hatası.' });
  }
};

const redirectToSteam = async (req, res) => {
    // protect middleware'inden gelen token'ı alıyoruz
    const token = req.query.token; 
    
    const returnURL = `https://oceanlan.com/api/v1/users/auth/steam/callback?token=${token}`;
    const realm = `https://oceanlan.com`;
    
    const steamAuthUrl = `https://steamcommunity.com/openid/login?` +
        `openid.ns=http://specs.openid.net/auth/2.0&` +
        `openid.mode=checkid_setup&` +
        `openid.return_to=${encodeURIComponent(returnURL)}&` +
        `openid.realm=${encodeURIComponent(realm)}&` +
        `openid.identity=http://specs.openid.net/auth/2.0/identifier_select&` +
        `openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select`;

    res.redirect(steamAuthUrl);
};

const handleSteamCallback = async (req, res) => {
    try {
        // Steam'in geri getirdiği token'ı URL'den alıyoruz
        const { token } = req.query; 

        if (!token) {
            return res.redirect(`${process.env.FRONTEND_URL}/settings?error=no_token`);
        }

        // Token'ı manuel doğrulayarak kullanıcıyı buluyoruz
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;

        // SteamID64'ü OpenID yanıtından çekiyoruz
        const claimedId = req.query['openid.claimed_id'];
        if (!claimedId) throw new Error("SteamID bulunamadı");
        
        const steamId = claimedId.split('/').pop();
        
        // Kullanıcıyı bul ve güncelle
        await User.findByIdAndUpdate(userId, { steamId });

        // Gamification ödülü
        if (req.app.get('io')) {
            const { processGamification } = require('../utils/gamificationEngine');
            await processGamification(userId, 'STEAM_LINKED', req.app.get('io'));
        }

        res.redirect(`${process.env.FRONTEND_URL}/settings?steam_success=true`);
    } catch (err) {
        console.error("Steam Bağlantı Hatası:", err);
        res.redirect(`${process.env.FRONTEND_URL}/settings?steam_error=true`);
    }
};

// Steam API'den canlı oyun ve profil durumu çeken fonksiyon
const getSteamStatus = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user || !user.steamId) {
            return res.status(404).json({ success: false, message: "Bağlı hesap yok." });
        }

        const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${process.env.STEAM_API_KEY}&steamids=${user.steamId}`;

        // Node.js yerleşik https.get kullanımı
        https.get(url, (response) => {
            let data = '';

            // Veri parçalarını topla
            response.on('data', (chunk) => {
                data += chunk;
            });

            // Tüm veri geldiğinde işle
            response.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    const player = jsonData.response.players[0];

                    if (!player) {
                        return res.status(404).json({ success: false, message: "Steam verisi bulunamadı." });
                    }

                    res.status(200).json({
                        success: true,
                        data: {
                            steamId: user.steamId,
                            personaname: player.personaname,
                            avatar: player.avatarfull,
                            currentGame: player.gameextrainfo || null,
                            status: player.personastate
                        }
                    });
                } catch (parseError) {
                    res.status(500).json({ success: false, message: "Veri işleme hatası" });
                }
            });

        }).on("error", (err) => {
            res.status(500).json({ success: false, error: err.message });
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

module.exports = {
  getMe,
  updateMe,
  verifyNewEmail,
  updateProfilePicture,
  getUserProfile,
  equipBadge,
  handleSteamCallback,
  getSteamStatus,
  redirectToSteam,
};
