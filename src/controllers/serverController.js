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
const ServerRequest = require('../models/ServerRequestModel');

const createServer = async (req, res) => {
  try {
    console.log("--- CREATE SERVER İSTEĞİ GELDİ ---");
    console.log("Gelen Body:", req.body);
    // Konsolda { name: 'aaaa', isPublic: 'true', ... } görmelisin.
    // Eğer isPublic yoksa, Frontend (Context) göndermiyor demektir.

    let { name, isPublic, joinMode } = req.body;
    const ownerId = req.user.id;

    // 1. İsim temizliği
    if (name) name = name.trim();

    // 🟢 2. KESİN TÜR DÖNÜŞÜMÜ (ROBUST CONVERSION)
    // Gelen değer String "true" da olsa, Boolean true da olsa kabul eder.
    // Geri kalan her şey (undefined, null, "false", "") false olur.
    const isPublicBool = String(isPublic).toLowerCase() === 'true';

    // Değişkeni güncelliyoruz
    isPublic = isPublicBool;

    console.log("İşlenen isPublic Değeri:", isPublic); // True mu False mu?

    // 🟢 3. İSİM KONTROLÜ (Sadece Public ise)
    if (isPublic === true) {
      const existingPublicServer = await Server.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') }, // Büyük/küçük harf duyarsız
        isPublic: true
      });

      if (existingPublicServer) {
        return res.status(400).json({
          success: false,
          message: 'Bu isimde herkese açık bir sunucu zaten var. Lütfen başka bir isim seçin.'
        });
      }
    }

    // Resim yükleme
    let iconUrl = null;
    if (req.file && req.file.filename) {
      iconUrl = `/uploads/server_icons/${req.file.filename}`;
    }

    // 4. Sunucuyu oluştur
    const newServer = await Server.create({
      name: name,
      owner: ownerId,
      iconUrl: iconUrl,
      isPublic: isPublic, // Artık kesinlikle true/false
      joinMode: joinMode || 'direct'
    });

    // 2. @everyone rolü
    const everyoneRole = await Role.create({
      name: '@everyone',
      server: newServer._id,
      isDefault: true,
      permissions: [
        'SEND_MESSAGES',
        'READ_MESSAGES',
        'VOICE_SPEAK',
        'VOICE_CONNECT'
      ]
    });

    // 3. Admin rolü
    const adminRole = await Role.create({
      name: 'Admin',
      server: newServer._id,
      permissions: ['ADMINISTRATOR'],
      color: '#F1C40F'
    });

    // 4. Varsayılan Kanal
    const defaultChannel = await Channel.create({
      name: 'genel',
      server: newServer._id,
      type: 'text',
      createdBy: ownerId
    });

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
    console.error('SERVER CREATE HATA DETAYI:', error);
    res.status(500).json({ success: false, message: 'Sunucu oluşturulamadı', error: error.message });
  }
};


// 📢 YENİ: Sunucu Resmini Güncelle (SOCKET EKLENDİ)
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

    // 🟢 SOCKET: Sunucu resminin değiştiğini herkese bildir
    const io = req.app.get('io');
    if (io) {
      io.to(serverId).emit('serverUpdated', server);
    }

    res.status(200).json({ success: true, message: 'Sunucu resmi güncellendi', data: server });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Resim yüklenemedi', error: error.message });
  }
};

// 📢 YENİ: Yasaklı Kullanıcıları Listele
const getBannedUsers = async (req, res) => {
  try {
    const { serverId } = req.params;
    const bans = await Ban.find({ server: serverId })
      .populate('user', 'username avatarUrl')
      .populate('bannedBy', 'username');

    res.status(200).json({ success: true, data: bans });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Liste alınamadı', error: error.message });
  }
};

// 📢 YENİ: Ban Kaldır (Unban)
const unbanUser = async (req, res) => {
  try {
    const { serverId, userId } = req.params;

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

    // 1. Sunucuyu bul
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
          { path: 'user', select: 'username email avatarUrl level badges activeBadge' },
          { path: 'roles', select: 'name color permissions' }
        ]
      });

    if (!server) {
      return res.status(404).json({ success: false, message: 'Sunucu bulunamadı' });
    }

    // 2. Kullanıcı üye mi?
    const membership = await Member.findOne({ user: userId, server: serverId });
    const isMember = !!membership; // true/false

    // 3. Erişim Kontrolü
    // Eğer sunucu ÖZEL ise ve kullanıcı üye değilse -> 403
    if (!server.isPublic && !isMember) {
      return res.status(403).json({ success: false, message: 'Bu sunucunun üyesi değilsiniz' });
    }

    // 4. Yanıtı hazırla
    // Mongoose dokümanını JS objesine çeviriyoruz ki içine 'isMember' ekleyebilelim
    const responseData = server.toObject();
    responseData.isMember = isMember;

    // Eğer üye değilse (Preview Modu), hassas verileri gizleyebilirsin (Opsiyonel)
    if (!isMember) {
      delete responseData.inviteCode;
      // Mesajlar zaten ayrı bir endpointten çekiliyor, o yüzden burada chat geçmişi gitmez.
    }

    res.status(200).json({
      success: true,
      data: responseData,
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

// 📢 YENİ: Sunucu Silme (SOCKET EKLENDİ)
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

    // 🟢 SOCKET: Sunucunun silindiğini herkese bildir (Dashboard'a atsınlar)
    const io = req.app.get('io');
    if (io) {
      io.to(serverId).emit('serverDeleted', { serverId });
    }

    res.status(200).json({ success: true, message: 'Sunucu ve tüm içeriği başarıyla silindi.' });

  } catch (error) {
    console.error("SUNUCU SİLME HATASI:", error);
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

    // Kullanıcının sunucu listesinden de kaldır
    await User.findByIdAndUpdate(userId, {
      $pull: { servers: serverId }
    });

    // 🟢 SOCKET İLE BİLDİR
    const io = req.app.get('io');
    if (io) {
      // 1. Sunucudaki diğer herkese haber ver (Listeden düşmesi için)
      io.to(serverId).emit('member-left', { serverId, userId });

      // 2. Ayrılan kişiye özel haber ver
      io.to(userId).emit('removed-from-server', { serverId });
    }

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
    if (!server) return res.status(404).json({ success: false, message: 'Sunucu bulunamadı' });

    // 2. Yetki Kontrolü
    let hasPermission = false;
    if (server.owner.toString() === userId) {
      hasPermission = true;
    } else {
      const member = await Member.findOne({ server: serverId, user: userId }).populate('roles');
      if (member) {
        hasPermission = member.roles.some(role =>
          role.permissions.includes('ADMINISTRATOR') ||
          role.permissions.includes('MANAGE_SERVER')
        );
      }
    }

    if (!hasPermission) return res.status(403).json({ success: false, message: 'Yetkiniz yok.' });

    // 3. Veri Hazırlığı
    const allowedUpdates = ['name', 'description', 'features', 'isPublic', 'joinMode'];
    const actualUpdates = {};

    Object.keys(updateData).forEach((key) => {
      if (allowedUpdates.includes(key)) actualUpdates[key] = updateData[key];
    });

    // 🟢 KRİTİK KONTROL: Eğer isim değişiyorsa veya sunucu Public yapılıyorsa İSİM ÇAKIŞMASINI KONTROL ET
    const newName = actualUpdates.name ? actualUpdates.name.trim() : server.name;
    // Eğer isPublic gönderilmediyse eskisi geçerli, gönderildiyse yenisi
    const newIsPublic = (actualUpdates.isPublic !== undefined) ? actualUpdates.isPublic : server.isPublic;

    // Eğer sunucu (zaten public ise VEYA yeni public oluyorsa) VE (isim değişiyorsa VEYA public durumu değişiyorsa)
    if (newIsPublic === true) {
      // Kendisi hariç, bu isimde başka public sunucu var mı?
      const conflict = await Server.findOne({
        name: { $regex: new RegExp(`^${newName}$`, 'i') },
        isPublic: true,
        _id: { $ne: serverId } // Kendini hariç tut
      });

      if (conflict) {
        return res.status(400).json({
          success: false,
          message: `"${newName}" ismi zaten başka bir herkese açık sunucu tarafından kullanılıyor.`
        });
      }
    }

    // 4. Veritabanını güncelle
    const updatedServer = await Server.findByIdAndUpdate(
      serverId,
      { $set: actualUpdates },
      { new: true, runValidators: true }
    )
      .populate('owner', 'username email')
      .populate('channels')
      .populate('roles');

    // 🟢 SOCKET
    const io = req.app.get('io');
    if (io) io.to(serverId).emit('serverUpdated', updatedServer);

    res.status(200).json({ success: true, message: 'Sunucu güncellendi', data: updatedServer });

  } catch (error) {
    console.error('SERVER UPDATE HATA:', error);
    res.status(500).json({ success: false, message: 'Güncelleme hatası', error: error.message });
  }
};

// @desc    Sunucuya gelen bekleyen istekleri listele
const getServerRequests = async (req, res) => {
  try {
    const { serverId } = req.params;
    const server = await Server.findById(serverId);
    if (String(server.owner) !== req.user.id) return res.status(403).json({ message: 'Yetkisiz' });

    const requests = await ServerRequest.find({ server: serverId, status: 'pending' })
      .populate('user', 'username avatarUrl level activeBadge');

    res.status(200).json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    İsteği Onayla veya Reddet (SOCKET EKLENDİ)
const respondToServerRequest = async (req, res) => {
  try {
    const { serverId, requestId } = req.params;
    const { status } = req.body;

    const request = await ServerRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: 'İstek bulunamadı' });

    if (status === 'rejected') {
      await ServerRequest.findByIdAndDelete(requestId);
      return res.status(200).json({ success: true, message: 'İstek reddedildi' });
    }

    if (status === 'accepted') {
      const defaultRole = await Role.findOne({ server: serverId, isDefault: true });

      let newMember = null;

      const existingMember = await Member.findOne({ server: serverId, user: request.user });
      if (!existingMember) {
        newMember = await Member.create({
          user: request.user,
          server: serverId,
          roles: defaultRole ? [defaultRole._id] : []
        });

        await Server.findByIdAndUpdate(serverId, { $push: { members: newMember._id } });
        await User.findByIdAndUpdate(request.user, { $push: { servers: serverId } });
      }

      await ServerRequest.findByIdAndDelete(requestId);

      // 🟢 SOCKET: Yeni üyeyi bildir (Listeyi güncellemek için)
      if (newMember) {
        const io = req.app.get('io');
        if (io) {
          const populatedMember = await Member.findById(newMember._id)
            .populate('user', 'username avatarUrl level badges activeBadge')
            .populate('roles', 'name color permissions');
          io.to(serverId).emit('newMember', populatedMember);
        }
      }

      return res.status(200).json({ success: true, message: 'Kullanıcı onaylandı ve sunucuya eklendi.' });
    }

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}; const getDiscoverServers = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;

    // 1. Temel Filtre
    const baseMatch = { isPublic: true };

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Pagination için toplam sayı
    let countMatch = { ...baseMatch };
    if (search) {
      countMatch.name = { $regex: search, $options: 'i' };
    }
    const totalCountData = await Server.countDocuments(countMatch);

    // AGGREGATION PIPELINE
    const pipeline = [
      // A. Public Sunucuları Al
      { $match: baseMatch },

      // B. Level ve Üye Verilerini Çek
      {
        $lookup: {
          from: 'members',
          localField: 'members',
          foreignField: '_id',
          as: 'memberDetails'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'memberDetails.user',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      {
        $addFields: {
          totalLevel: { $sum: "$userDetails.level" },
          memberCount: { $size: "$members" }
        }
      },

      // C. 🟢 HATA ÇÖZÜMÜ: TEK BİR SIRALAMA ANAHTARI OLUŞTURMA
      // MongoDB sadece 1 alana izin verdiği için Level ve Tarihi birleştiriyoruz.
      // Mantık: Level ne kadar yüksekse ve Tarih ne kadar küçükse (eskiyse), bu sayı o kadar büyük olacak.
      {
        $addFields: {
          // Level'ı 8 haneli bir sayıya tamamlıyoruz (Örn: 10000050)
          paddedLevel: { $add: [10000000, "$totalLevel"] },
          // Tarihi ters çeviriyoruz (Böylece eski tarih daha büyük bir sayı oluyor)
          // 9999999999999 sabitinden çıkararak eski tarihleri büyütüyoruz.
          invertedDate: { $subtract: [9999999999999, { $toLong: "$createdAt" }] }
        }
      },
      {
        $addFields: {
          // İkisini string olarak birleştiriyoruz: "10000050-8237461287364"
          // Bu tek string'e göre sıraladığımızda hem Level hem Tarih doğru sıralanmış oluyor.
          rankingKey: {
            $concat: [
              { $toString: "$paddedLevel" },
              "-",
              { $toString: "$invertedDate" }
            ]
          }
        }
      },

      // D. 🟢 RANK HESABI (ARTIK HATA VERMEZ)
      // Sadece 'rankingKey' alanını kullanıyoruz.
      {
        $setWindowFields: {
          partitionBy: null,
          sortBy: { rankingKey: -1 }, // Büyükten küçüğe sırala
          output: {
            rank: {
              $documentNumber: {} // 1, 2, 3, 4, 5... (Sıralı numara verir, tekrar etmez)
            }
          }
        }
      },

      // E. Gereksiz Verileri Temizle
      {
        $project: {
          name: 1,
          iconUrl: 1,
          description: 1,
          totalLevel: 1,
          memberCount: 1,
          createdAt: 1,
          rank: 1
        }
      },

      // F. Arama Filtresi (Sıra numarası bozulmasın diye en son yapıyoruz)
      ...(search ? [{ $match: { name: { $regex: search, $options: 'i' } } }] : []),

      // G. Listeleme Sırası (Rank'a göre diz)
      {
        $sort: { rank: 1 }
      },

      // H. Sayfalama
      { $skip: skip },
      { $limit: limitNum }
    ];

    const servers = await Server.aggregate(pipeline);

    res.status(200).json({
      success: true,
      data: servers,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCountData / limitNum),
        totalServers: totalCountData
      }
    });

  } catch (error) {
    console.error('DISCOVER ERROR:', error);
    res.status(500).json({ success: false, message: 'Sunucular getirilemedi' });
  }
};

const getTopServers = async (req, res) => {
  try {
    const topServers = await Server.aggregate([
      { $match: { isPublic: true } },
      {
        $lookup: {
          from: 'members',
          localField: 'members',
          foreignField: '_id',
          as: 'memberDetails'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'memberDetails.user',
          foreignField: '_id',
          as: 'userDetails'
        }
      },
      {
        $addFields: {
          totalLevel: { $sum: "$userDetails.level" },
          memberCount: { $size: "$members" }
        }
      },
      {
        $project: {
          name: 1,
          iconUrl: 1,
          description: 1,
          totalLevel: 1,
          memberCount: 1
        }
      },
      { $sort: { totalLevel: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({ success: true, data: topServers });

  } catch (error) {
    console.error('TOP SERVER HATA:', error);
    res.status(500).json({ success: false, message: 'Sıralama alınamadı' });
  }
};

// @desc    Public sunucuya direkt katıl (SOCKET EKLENDİ)
const joinPublicServer = async (req, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;

    const server = await Server.findById(serverId);
    if (!server) return res.status(404).json({ message: 'Sunucu yok' });

    if (!server.isPublic) {
      return res.status(403).json({ message: 'Bu sunucu dışarıya kapalı.' });
    }

    const existingMember = await Member.findOne({ server: serverId, user: userId });
    if (existingMember) return res.status(400).json({ message: 'Zaten üyesiniz.' });

    if (server.joinMode === 'request') {
      const existingRequest = await ServerRequest.findOne({ server: serverId, user: userId, status: 'pending' });
      if (existingRequest) {
        return res.status(400).json({ message: 'Zaten bekleyen bir katılım isteğiniz var.' });
      }
      await ServerRequest.create({ server: serverId, user: userId });
      return res.status(200).json({ success: true, status: 'pending', message: 'Katılım isteği gönderildi. Yöneticilerin onayı bekleniyor.' });
    }

    // --- DIRECT MOD ---
    const defaultRole = await Role.findOne({ server: serverId, isDefault: true });

    const newMember = await Member.create({
      user: userId,
      server: serverId,
      roles: defaultRole ? [defaultRole._id] : []
    });

    server.members.push(newMember._id);
    await server.save();

    await User.findByIdAndUpdate(userId, { $push: { servers: serverId } });

    // 🟢 SOCKET: Yeni üyeyi bildir
    const io = req.app.get('io');
    if (io) {
      // Üyenin detaylarını doldurarak gönder (Frontend'de resim/isim görünsün diye)
      const populatedMember = await Member.findById(newMember._id)
        .populate('user', 'username avatarUrl level badges activeBadge')
        .populate('roles', 'name color permissions');

      io.to(serverId).emit('newMember', populatedMember);
    }

    res.status(200).json({ success: true, message: 'Sunucuya katıldınız', serverId: server._id });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


module.exports = {
  createServer,
  generateInviteCode,
  getServerDetails,
  updateServerIcon,
  getUserServers,
  deleteServer,
  updateServerIcon,
  getBannedUsers,
  unbanUser,
  leaveServer,
  updateServer,
  getServerRequests,
  respondToServerRequest,
  getDiscoverServers,
  getTopServers,
  joinPublicServer
}