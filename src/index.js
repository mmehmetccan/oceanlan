// src/index.js (BACKEND)
require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path'); // path modülünü import et

// Modeller
const Message = require('./models/MessageModel');
const Channel = require('./models/ChannelModel');
const Conversation = require('./models/ConversationModel');
const PrivateMessage = require('./models/PrivateMessageModel');
const Member = require('./models/MemberModel'); // Bu import çok önemli
const jwt = require('jsonwebtoken');
const User = require('./models/UserModel');

// Medya Sunucusunu içe aktar
const nms = require('./mediaServer');

// Veritabanına bağlan
connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});
app.set('io', io);
app.use(express.json());
app.use(cors());

// =========================================================================
// 💡 ÖNEMLİ DÜZENLEME: Tüm statik dosya middleware'leri, tüm API rotalarından ÖNCE gelmeli
// Resimlerin React Router'dan önce servis edildiğinden emin olmak için.

// 1. Genel 'uploads' klasörü
const AVATAR_URL_PATH = '/uploads/avatars';

// Bu, sunucudaki fiziksel klasör yolu
const AVATAR_PHYSICAL_PATH = path.resolve(__dirname, '..', 'uploads', 'avatars');

const uploadsPath = path.join(__dirname, '..', 'uploads');
console.log(`[DOSYA SUNUCUSU]: Resimler şu klasörden sunuluyor: ${uploadsPath}`);


// 2. Diğer tüm genel upload'ları da ekle (bu gerekli olabilir)
app.use('/uploads', express.static(uploadsPath));


app.use('/uploads/server_icons', express.static(path.join(__dirname, '..', 'uploads', 'server_icons')));

// 1. Avatar klasörünü doğrudan hedefle
app.use(AVATAR_URL_PATH, express.static(AVATAR_PHYSICAL_PATH));

// 2. Sohbet dosyaları (Zaten yukarıdaki yakalar, ama spesifik olması iyi)
app.use('/uploads/chat_attachments', express.static(path.join(__dirname, '..', 'uploads', 'chat_attachments')));

// 3. Avatar dosyaları (Zaten yukarıdaki yakalar, ama spesifik olması iyi)
app.use('/uploads/avatars', express.static(path.join(__dirname, '..', 'uploads', 'avatars')));

// 4. Gönderi (Post) dosyaları (Zaten yukarıdaki yakalar, ama spesifik olması iyi)
app.use('/uploads/post_media', express.static(path.join(__dirname, '..', 'uploads', 'post_media')));

// =========================================================================


// --- API Rotaları ---
app.get('/api/ping', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Sunucu ayakta! (Pong)'
    });
});
app.use('/api/v1/auth', require('./api/routes/authRoutes'));
app.use('/api/v1/servers', require('./api/routes/serverRoutes'));
app.use('/api/v1/servers/:serverId/channels', require('./api/routes/channelRoutes'));
app.use('/api/v1/invites', require('./api/routes/inviteRoutes'));
app.use('/api/v1/friends', require('./api/routes/friendRoutes'));
app.use('/api/v1/servers/:serverId/members', require('./api/routes/memberRoutes'));
app.use('/api/v1/users', require('./api/routes/userRoutes'));
app.use('/api/v1/servers/:serverId/roles', require('./api/routes/roleRoutes'));
app.use('/api/v1/roles', require('./api/routes/roleRoutes'));
app.use('/api/v1/posts', require('./api/routes/postRoutes'));

// -------------------------------------
// Sunucudaki sesli kanal durumunu sunucu belleğinde tutalım
let voiceChannelState = {};
// -------------------------------------

// Socket.io Kimlik Doğrulama Middleware'i
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication Error: Token not provided'));
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id; // socket'e kullanıcı ID'sini ekle
        next();
    } catch (err) {
        return next(new Error('Authentication Error: Invalid token'));
    }
});

// --- Socket.IO Bağlantı Mantığı ---

io.on('connection', (socket) => {
  console.log(`[SOCKET]: Yeni kullanici baglandi: ${socket.id} (Kullanici: ${socket.userId})`);

  if (socket.userId) {
    const now = new Date();
    User.updateOne(
      { _id: socket.userId },
      { $set: { onlineStatus: 'online', lastSeenAt: now } }
    ).then(() => {
        // 📢 YENİ EKLEME: Tüm bağlı istemcilere haber ver
        io.emit('userStatusChanged', {
            userId: socket.userId,
            status: 'online',
            lastSeenAt: now
        });
    }).catch((err) => console.error('[PRESENCE] online guncelleme hatasi', err));
  }

  // Presence: baglaninca online isaretle
  if (socket.userId) {
    User.updateOne(
      { _id: socket.userId },
      { $set: { onlineStatus: 'online', lastSeenAt: new Date() } }
    ).catch((err) => console.error('[PRESENCE] online guncelleme hatasi', err));
  }

  // Kullaniciya ozel oda
  if (socket.userId) {
      socket.join(socket.userId);
      console.log(`[SOCKET]: Kullanici ${socket.userId} kendi ozel odasina katildi.`);
  }

  // Sunucu odasina katilma (Ses odasi durumu icin)
  socket.on('joinServer', (serverId) => {
    if (!serverId) return;
    if (socket.currentServerId && socket.currentServerId !== serverId) {
      socket.leave(socket.currentServerId);
      console.log(`[SOCKET]: Kullanici ${socket.id}, ${socket.currentServerId} odasindan (otomatik) ayrildi.`);
    }
    socket.join(serverId);
    socket.currentServerId = serverId;
    console.log(`[SOCKET]: Kullanici ${socket.id}, ${serverId} odasina katildi.`);

    // "Hos geldin paketi" (ses durumu)
    const currentVoiceStateForServer = voiceChannelState[serverId] || {};
    socket.emit('voiceStateUpdate', currentVoiceStateForServer);
  });

  socket.on('get-server-voice-state', (serverId) => {
    if (!serverId) return;
    const currentVoiceStateForServer = voiceChannelState[serverId] || {};
    socket.emit('voiceStateUpdate', currentVoiceStateForServer);
  });

  // Sunucu odasindan ayrilma
  socket.on('leaveServer', (serverId) => {
    if (!serverId) return;
    socket.leave(serverId);
    console.log(`[SOCKET]: Kullanici ${socket.id}, ${serverId} odasindan (manuel) ayrildi.`);
    if (socket.currentServerId === serverId) {
      socket.currentServerId = null;
    }
  });

  // Metin kanali odalari
  socket.on('joinChannel', (channelId) => {
    if (!channelId) return;
    socket.join(channelId);
    console.log(`[SOCKET]: Kullanici ${socket.id}, Kanal Odasina Katildi: ${channelId}`);
  });
  socket.on('leaveChannel', (channelId) => {
      if(channelId) socket.leave(channelId);
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      const now = new Date();
      User.updateOne(
        { _id: socket.userId },
        { $set: { onlineStatus: 'offline', lastSeenAt: now } }
      ).then(() => {
          // 📢 YENİ EKLEME: Tüm bağlı istemcilere haber ver
          io.emit('userStatusChanged', {
              userId: socket.userId,
              status: 'offline',
              lastSeenAt: now
          });
      }).catch((err) => console.error('[PRESENCE] offline guncelleme hatasi', err));
    }
  });

  // Sunucu kanali mesaji gonderme
  socket.on('sendMessage', async (data) => {
    try {
      if (!data.content || !data.channelId || !data.authorId) {
        return socket.emit('messageError', { message: 'Eksik veri (content, channelId, authorId)' });
      }
      const channel = await Channel.findById(data.channelId);
      if (!channel) {
        return socket.emit('messageError', { message: 'Gecersiz kanal ID' });
      }
      const serverId = channel.server;
      const newMessage = await Message.create({
        content: data.content,
        author: data.authorId,
        channel: data.channelId,
        server: serverId,
      });
      const populatedMessage = await Message.findById(newMessage._id)
                                          .populate('author', 'username');
      io.to(data.channelId).emit('newMessage', populatedMessage);
    } catch (error) {
      console.error(`[SOCKET HATA]: Sunucu Mesaji gonderilemedi:`, error);
      socket.emit('messageError', { message: 'Sunucu hatasi, mesaj gonderilemedi' });
    }
  });

  // --- SES ODASI İÇİN handleLeaveVoice ---
  const handleLeaveVoice = (socket) => {
    if (!socket.currentVoiceChannel) return;

    const { channelId, serverId, userId } = socket.currentVoiceChannel;
    socket.leave(channelId);
    console.log(`[SOCKET-SES]: Kullanıcı ${userId} (${socket.id}), ${channelId} SES odasından ayrıldı.`);

    if (voiceChannelState[serverId] && voiceChannelState[serverId][channelId]) {
        voiceChannelState[serverId][channelId] = voiceChannelState[serverId][channelId].filter(
            u => u.socketId !== socket.id
        );
        if (voiceChannelState[serverId][channelId].length === 0) {
            delete voiceChannelState[serverId][channelId];
        }
    }

    socket.to(channelId).emit('user-left-voice', { socketId: socket.id });
    io.to(serverId).emit('voiceStateUpdate', voiceChannelState[serverId]);

    delete socket.currentVoiceChannel;
  };

  // --- WebRTC Sinyalleşme Olayları ---
  socket.on('join-voice-channel', async (data) => {
    const { channelId, serverId, userId, username } = data;
    if (!channelId || !serverId || !userId || socket.userId !== userId) return;

    if (socket.currentVoiceChannel) {
        if (socket.currentVoiceChannel.channelId === channelId) {
            return;
        }
        handleLeaveVoice(socket);
    }
    try {
        const channel = await Channel.findById(channelId).populate('allowedRoles');
        const member = await Member.findOne({ user: userId, server: serverId });
        if (!channel || !member) {
            return socket.emit('join-voice-error', { message: 'Kanal veya üyelik bulunamadı.' });
        }
        if (channel.allowedRoles && channel.allowedRoles.length > 0) {
            const hasPermission = member.roles.some(memberRole =>
                channel.allowedRoles.some(allowedRole => allowedRole._id.equals(memberRole))
            );
            if (!hasPermission) {
                return socket.emit('join-voice-error', { message: 'Bu sesli kanala girme izniniz yok.' });
            }
        }
        const usersInChannel = voiceChannelState[serverId]?.[channelId]?.length || 0;
        if (channel.maxUsers > 0 && usersInChannel >= channel.maxUsers) {
            return socket.emit('join-voice-error', { message: 'Bu sesli kanal dolu.' });
        }

        socket.join(channelId);
        console.log(`[SOCKET-SES]: Kullanıcı ${username} (${socket.id}), ${channelId} SES odasına katıldı.`);
        socket.currentVoiceChannel = { channelId, serverId, userId, username };

        if (!voiceChannelState[serverId]) voiceChannelState[serverId] = {};
        if (!voiceChannelState[serverId][channelId]) voiceChannelState[serverId][channelId] = [];
        if (!voiceChannelState[serverId][channelId].find(u => u.userId === userId)) {
            voiceChannelState[serverId][channelId].push({ userId, username, socketId: socket.id });
        }
        if (!socket.rooms.has(serverId)) {
            socket.join(serverId);
        }

        socket.to(channelId).emit('user-joined-voice', { socketId: socket.id, userId, username });
        io.to(serverId).emit('voiceStateUpdate', voiceChannelState[serverId]);

    } catch (error) {
        console.error("Join voice error:", error);
        socket.emit('join-voice-error', { message: error.message });
    }
  });
  socket.on('move-voice-user', async (payload) => {
    const { serverId, fromChannelId, toChannelId, targetUserId } = payload || {};

    if (!serverId || !fromChannelId || !toChannelId || !targetUserId) return;
    if (fromChannelId === toChannelId) return;

    try {
      // 1) Taşıma işlemini yapan kişinin yetkisini kontrol et
      const operatorMember = await Member.findOne({
        user: socket.userId,
        server: serverId,
      }).populate('roles');

      if (!operatorMember) {
        console.log('[move-voice-user]: operatorMember bulunamadı');
        return;
      }

      let canMove = false;

      if (operatorMember.roles && operatorMember.roles.length > 0) {
        canMove = operatorMember.roles.some((role) =>
          role.permissions &&
          (
            role.permissions.includes('ADMINISTRATOR') ||
            role.permissions.includes('MANAGE_CHANNELS')
          )
        );
      }

      // İstersen şimdilik bu kontrolü kapatıp her şeyi loglamak için:
      // canMove = true;

      if (!canMove) {
        console.log('[move-voice-user]: yetki yok');
        return;
      }

      // 2) Eski kanaldaki voice state içinden hedef kullanıcıyı bul
      const serverState = voiceChannelState[serverId] || {};
      const fromList = serverState[fromChannelId] || [];

      const targetEntry = fromList.find(
        (u) => String(u.userId) === String(targetUserId)
      );

      if (!targetEntry) {
        console.log('[move-voice-user]: hedef kullanıcı belirtilen kanalda bulunamadı');
        return;
      }

      const targetSocketId = targetEntry.socketId;
      const targetSocket = io.sockets.sockets.get(targetSocketId);

      if (!targetSocket) {
        console.log('[move-voice-user]: hedef kullanıcının socket\'i bulunamadı');
        return;
      }

      // 3) Kullanıcıyı eski ses kanalından çıkart (handleLeaveVoice hedef socket için)
      if (
        targetSocket.currentVoiceChannel &&
        targetSocket.currentVoiceChannel.channelId === fromChannelId
      ) {
        handleLeaveVoice(targetSocket);
      }

      // 4) Hedef kullanıcıya "yeni ses kanalına geç" sinyali gönder
      targetSocket.emit('force-join-voice-channel', {
        serverId,
        channelId: toChannelId,
        userId: targetUserId,
        username: targetEntry.username,
      });

      console.log(
        `[move-voice-user]: Kullanıcı ${targetUserId} ${fromChannelId} -> ${toChannelId} taşınması istendi.`
      );
    } catch (err) {
      console.error('[move-voice-user] hata:', err);
    }
  });


  socket.on('webrtc-offer', (data) => {
    io.to(data.targetSocketId).emit('webrtc-offer', { socketId: socket.id, sdp: data.sdp });
  });
  socket.on('webrtc-answer', (data) => {
    io.to(data.targetSocketId).emit('webrtc-answer', { socketId: socket.id, sdp: data.sdp });
  });
  socket.on('webrtc-ice-candidate', (data) => {
    io.to(data.targetSocketId).emit('webrtc-ice-candidate', { socketId: socket.id, candidate: data.candidate });
  });

  socket.on('leave-voice-channel', () => {
    handleLeaveVoice(socket);
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET]: Kullanıcı ayrıldı. ID: ${socket.id}`);
    handleLeaveVoice(socket);
  });

  // --- DM Olayları ---
  socket.on('joinDmRoom', (conversationId) => {
    socket.join(conversationId);
  });
  socket.on('joinConversation', (conversationId) => {
    socket.join(conversationId);
  });
  socket.on('leaveConversation', (conversationId) => {
    socket.leave(conversationId);
  });

  // --- BURASI SİZİN KODUNUZDU, SADECE 'console.error' EKLENDİ ---
  socket.on('sendPrivateMessage', async (data) => {
    try {
      if (!data.content || !data.conversationId || !data.authorId) {
        return socket.emit('messageError', { message: 'Eksik DM verisi' });
      }
      const newDm = await PrivateMessage.create({
        content: data.content,
        author: data.authorId,
        conversation: data.conversationId,
      });
      const populatedDm = await PrivateMessage.findById(newDm._id)
                                          .populate('author', 'username');
      io.to(data.conversationId).emit('newPrivateMessage', populatedDm);
      const conversation = await Conversation.findById(data.conversationId);
      const recipientId = conversation.participants.find(p => p.toString() !== data.authorId.toString());

      if (recipientId) {
          // Alıcının kendi özel odasına "unreadDm" sinyali gönder
          // Bu, Frontend'in DM sekmesindeki sayacı artırmasına yarayacak.
          io.to(recipientId.toString()).emit('unreadDm', {
              conversationId: data.conversationId
          });
      }
    } catch (error) {
      // --- TEK DEĞİŞİKLİK BU SATIR ---
      console.error('[SOCKET HATA]: DM gönderilemedi:', error);
      // -------------------------------
      socket.emit('messageError', { message: 'Sunucu hatası, DM gönderilemedi' });
    }
  });
  // -----------------------------------------------------------

  // --- Moderasyon Olayları ---
  socket.on('memberUpdated', (data) => {
      const { serverId, memberId, isMuted, isDeafened } = data;
      io.to(serverId).emit('memberUpdated', { memberId, isMuted, isDeafened });
  });

  socket.on('memberBanned', (data) => {
      io.to(data.serverId).emit('memberBanned', data);
  });

  // Kanal/Rol yönetimi sonrası Arayüzü yenilemek için
  socket.on('channelCreated', (data) => io.to(data.serverId).emit('channelCreated', data.newChannel));
  socket.on('channelUpdated', (data) => io.to(data.serverId).emit('channelUpdated', data.updatedChannel));
  socket.on('channelDeleted', (data) => io.to(data.serverId).emit('channelDeleted', { channelId: data.channelId }));
  socket.on('roleUpdated', (data) => io.to(data.serverId).emit('roleUpdated', data));
  socket.on('roleDeleted', (data) => io.to(data.serverId).emit('roleDeleted', data));

});


// --- Sunucu Başlatma ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[SERVER]: API Sunucusu http://localhost:${PORT} adresinde başarıyla başlatıldı.`);
  console.log(`[SOCKET]: Socket.IO sunucusu da aynı portta dinlemede.`);
});

nms.run();

console.log(`[MEDIA-SERVER]: RTMP sunucusu rtmp://localhost:1935 adresinde başladı.`);
console.log(`[MEDIA-SERVER]: HLS sunucusu http://localhost:8000 adresinde başladı.`);

process.on('unhandledRejection', (err, promise) => {
    console.log(`[HATA]: ${err.message}`);
    server.close(() => process.exit(1));
});