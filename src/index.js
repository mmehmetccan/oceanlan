// src/index.js (BACKEND)

require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// Modeller
const Message = require('./models/MessageModel');
const Channel = require('./models/ChannelModel');
const Conversation = require('./models/ConversationModel');
const PrivateMessage = require('./models/PrivateMessageModel');
const Member = require('./models/MemberModel');
const User = require('./models/UserModel');
const jwt = require('jsonwebtoken');

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

// io'yu Express app'e tak
app.set('io', io);

app.use(express.json());
app.use(cors());

// =========================================================================
// 🖼 Statik dosyalar (uploads vs.) — TÜM API'LARDAN ÖNCE
// =========================================================================

const AVATAR_URL_PATH = '/uploads/avatars';

const updatesPath = path.join(__dirname, '..', 'updates');

// Fiziksel klasörler
const uploadsPath = path.join(__dirname, '..', 'uploads');
const AVATAR_PHYSICAL_PATH = path.join(uploadsPath, 'avatars');

console.log(`[DOSYA SUNUCUSU]: Resimler şu klasörden sunuluyor: ${uploadsPath}`);

// Genel uploads
app.use('/uploads', express.static(uploadsPath));

// Alt klasörler
app.use('/updates', express.static(updatesPath));


app.use('/uploads/server_icons', express.static(path.join(uploadsPath, 'server_icons')));
app.use('/uploads/chat_attachments', express.static(path.join(uploadsPath, 'chat_attachments')));
app.use('/uploads/avatars', express.static(AVATAR_PHYSICAL_PATH));
app.use('/uploads/post_media', express.static(path.join(uploadsPath, 'post_media')));

// =========================================================================
// 🧪 Basit ping
// =========================================================================

app.get('/api/ping', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Sunucu ayakta! (Pong)',
  });
});

// =========================================================================
// 📦 API Rotaları
// =========================================================================

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
app.use('/api/v1/contact', require('./api/routes/contactRoutes')); // 👈 YENİ EKLENEN
// =========================================================================
// 🔊 Sesli kanal state (bellek üstünde)
// =========================================================================

let voiceChannelState = {};

// =========================================================================
// 🔐 Socket.IO Auth Middleware
// =========================================================================

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication Error: Token not provided'));
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    return next(new Error('Authentication Error: Invalid token'));
  }
});

// =========================================================================
// 🌐 Socket.IO Bağlantı Mantığı
// =========================================================================

io.on('connection', (socket) => {
  console.log(`[SOCKET]: Yeni kullanici baglandi: ${socket.id} (Kullanici: ${socket.userId})`);

  // Presence: bağlanınca online işaretle
  if (socket.userId) {
    const now = new Date();
    User.updateOne(
      { _id: socket.userId },
      { $set: { onlineStatus: 'online', lastSeenAt: now } }
    )
      .then(() => {
        io.emit('userStatusChanged', {
          userId: socket.userId,
          status: 'online',
          lastSeenAt: now,
        });
      })
      .catch((err) => console.error('[PRESENCE] online guncelleme hatasi', err));

    // Kullanıcıya özel oda
    socket.join(socket.userId.toString());
    console.log(`[SOCKET]: Kullanici ${socket.userId} kendi ozel odasina katildi.`);
  }

  // -------------------------------------
  // Sunucu odasına katılma (ses state için)
  // -------------------------------------
  socket.on('joinServer', (serverId) => {
    if (!serverId) return;

    if (socket.currentServerId && socket.currentServerId !== serverId) {
      socket.leave(socket.currentServerId);
      console.log(
        `[SOCKET]: Kullanici ${socket.id}, ${socket.currentServerId} odasindan (otomatik) ayrildi.`
      );
    }

    socket.join(serverId);
    socket.currentServerId = serverId;
    console.log(`[SOCKET]: Kullanici ${socket.id}, ${serverId} odasina katildi.`);

    const currentVoiceStateForServer = voiceChannelState[serverId] || {};
    socket.emit('voiceStateUpdate', currentVoiceStateForServer);
  });

  socket.on('get-server-voice-state', (serverId) => {
    if (!serverId) return;
    const currentVoiceStateForServer = voiceChannelState[serverId] || {};
    socket.emit('voiceStateUpdate', currentVoiceStateForServer);
  });

  socket.on('leaveServer', (serverId) => {
    if (!serverId) return;
    socket.leave(serverId);
    console.log(`[SOCKET]: Kullanici ${socket.id}, ${serverId} odasindan (manuel) ayrildi.`);
    if (socket.currentServerId === serverId) {
      socket.currentServerId = null;
    }
  });

  // Metin kanalı odaları
  socket.on('joinChannel', (channelId) => {
    if (!channelId) return;
    socket.join(channelId);
    console.log(`[SOCKET]: Kullanici ${socket.id}, Kanal Odasina Katildi: ${channelId}`);
  });

  socket.on('leaveChannel', (channelId) => {
    if (channelId) socket.leave(channelId);
  });

  // -------------------------------------
  // Mesaj gönderme (Sunucu kanalı)
  // -------------------------------------
  socket.on('sendMessage', async (data) => {
    try {
      if (!data.content || !data.channelId || !data.authorId) {
        return socket.emit('messageError', {
          message: 'Eksik veri (content, channelId, authorId)',
        });
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

      const populatedMessage = await Message.findById(newMessage._id).populate(
        'author',
        'username avatarUrl onlineStatus'
      );

      io.to(data.channelId).emit('newMessage', populatedMessage);
    } catch (error) {
      console.error(`[SOCKET HATA]: Sunucu Mesaji gonderilemedi:`, error);
      socket.emit('messageError', { message: 'Sunucu hatasi, mesaj gonderilemedi' });
    }
  });

  // -------------------------------------
  // Ses kanalından çıkma helper'ı
  // -------------------------------------
  const handleLeaveVoice = (sock) => {
    if (!sock.currentVoiceChannel) return;

    const { channelId, serverId, userId } = sock.currentVoiceChannel;

    sock.leave(channelId);
    console.log(
      `[SOCKET-SES]: Kullanıcı ${userId} (${sock.id}), ${channelId} SES odasından ayrıldı.`
    );

    if (voiceChannelState[serverId] && voiceChannelState[serverId][channelId]) {
      voiceChannelState[serverId][channelId] = voiceChannelState[serverId][channelId].filter(
        (u) => u.socketId !== sock.id
      );
      if (voiceChannelState[serverId][channelId].length === 0) {
        delete voiceChannelState[serverId][channelId];
      }
    }

    sock.to(channelId).emit('user-left-voice', { socketId: sock.id });
    io.to(serverId).emit('voiceStateUpdate', voiceChannelState[serverId]);

    delete sock.currentVoiceChannel;
  };

  // -------------------------------------
  // Ses kanalına katılma (izin + limit kontrolü)
  // -------------------------------------
  socket.on('join-voice-channel', async (data) => {
    const { channelId, serverId, userId, username } = data || {};
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

      // Rol bazlı izin
      if (channel.allowedRoles && channel.allowedRoles.length > 0) {
        const hasPermission = member.roles.some((memberRole) =>
          channel.allowedRoles.some((allowedRole) => allowedRole._id.equals(memberRole))
        );
        if (!hasPermission) {
          return socket.emit('join-voice-error', {
            message: 'Bu sesli kanala girme izniniz yok.',
          });
        }
      }

      const usersInChannel = voiceChannelState[serverId]?.[channelId]?.length || 0;
      if (channel.maxUsers > 0 && usersInChannel >= channel.maxUsers) {
        return socket.emit('join-voice-error', { message: 'Bu sesli kanal dolu.' });
      }

      socket.join(channelId);
      console.log(
        `[SOCKET-SES]: Kullanıcı ${username} (${socket.id}), ${channelId} SES odasına katıldı.`
      );

      socket.currentVoiceChannel = { channelId, serverId, userId, username };

      if (!voiceChannelState[serverId]) voiceChannelState[serverId] = {};
      if (!voiceChannelState[serverId][channelId]) voiceChannelState[serverId][channelId] = [];

      if (!voiceChannelState[serverId][channelId].find((u) => u.userId === userId)) {
        voiceChannelState[serverId][channelId].push({
          userId,
          username,
          socketId: socket.id,
        });
      }

      if (!socket.rooms.has(serverId)) {
        socket.join(serverId);
      }

      socket.to(channelId).emit('user-joined-voice', {
        socketId: socket.id,
        userId,
        username,
      });

      io.to(serverId).emit('voiceStateUpdate', voiceChannelState[serverId]);
    } catch (error) {
      console.error('Join voice error:', error);
      socket.emit('join-voice-error', { message: error.message });
    }
  });

  // -------------------------------------
  // Moderatörün sesli kullanıcı taşıması
  // -------------------------------------
  socket.on('move-voice-user', async (payload) => {
    const { serverId, fromChannelId, toChannelId, targetUserId } = payload || {};

    if (!serverId || !fromChannelId || !toChannelId || !targetUserId) return;
    if (fromChannelId === toChannelId) return;

    try {
      // 1) Yetki Kontrolü (Aynı kalsın)
      const operatorMember = await Member.findOne({ user: socket.userId, server: serverId }).populate('roles');
      if (!operatorMember) return;

      let canMove = false;
      if (operatorMember.roles && operatorMember.roles.length > 0) {
        canMove = operatorMember.roles.some((role) =>
          role.permissions && (role.permissions.includes('ADMINISTRATOR') || role.permissions.includes('MANAGE_CHANNELS'))
        );
      }

      if (!canMove) {
        console.log('[move-voice-user]: yetki yok');
        return;
      }

      // 2) Hedef kullanıcıyı bul
      const serverState = voiceChannelState[serverId] || {};
      const fromList = serverState[fromChannelId] || [];
      const targetEntry = fromList.find((u) => String(u.userId) === String(targetUserId));

      if (!targetEntry) return;

      const targetSocketId = targetEntry.socketId;
      const targetSocket = io.sockets.sockets.get(targetSocketId);

      // 3) STATE GÜNCELLEMESİ (Kritik Kısım)

      // A. Eski kanaldan sil
      if (voiceChannelState[serverId] && voiceChannelState[serverId][fromChannelId]) {
          voiceChannelState[serverId][fromChannelId] = voiceChannelState[serverId][fromChannelId].filter(
              u => String(u.userId) !== String(targetUserId)
          );
          // Kanal boşaldıysa sil
          if (voiceChannelState[serverId][fromChannelId].length === 0) {
              delete voiceChannelState[serverId][fromChannelId];
          }
      }

      // B. Yeni kanala ekle
      if (!voiceChannelState[serverId]) voiceChannelState[serverId] = {};
      if (!voiceChannelState[serverId][toChannelId]) voiceChannelState[serverId][toChannelId] = [];

      // Mükerrer eklemeyi önle
      if (!voiceChannelState[serverId][toChannelId].find(u => String(u.userId) === String(targetUserId))) {
           voiceChannelState[serverId][toChannelId].push(targetEntry);
      }

      // 4) Socket Odalarını Güncelle (Hedef kullanıcı için)
      if (targetSocket) {
          targetSocket.leave(fromChannelId); // Eskiden çık
          targetSocket.join(toChannelId);    // Yeniye gir

          // Frontend'deki "currentVoiceChannel" bilgisini güncelle
          targetSocket.currentVoiceChannel = {
              channelId: toChannelId,
              serverId,
              userId: targetUserId,
              username: targetEntry.username
          };

          // Hedef kullanıcıya "Taşındın" sinyali gönder (İsteğe bağlı, UI'ı zorlamak için)
          targetSocket.emit('voice-channel-moved', {
              newChannelId: toChannelId,
              serverId
          });
      }

      // 5) HERKESE GÜNCEL LİSTEYİ GÖNDER (Kartların görünmesi için en önemlisi bu)
      io.to(serverId).emit('voiceStateUpdate', voiceChannelState[serverId]);

      console.log(`[move-voice-user]: ${targetUserId} taşındı: ${fromChannelId} -> ${toChannelId}`);

    } catch (err) {
      console.error('[move-voice-user] hata:', err);
    }
  });

  socket.on('disconnect-voice-user', async (payload) => {
      const { serverId, targetUserId } = payload || {};
      if (!serverId || !targetUserId) return;

      try {
          // 1. Yetki Kontrolü (MOVE_MEMBERS yetkisine sahip olmalı)
          const operatorMember = await Member.findOne({ user: socket.userId, server: serverId }).populate('roles');
          if (!operatorMember) return;

          let canDisconnect = false;
          if (operatorMember.roles && operatorMember.roles.length > 0) {
              canDisconnect = operatorMember.roles.some((role) =>
                  role.permissions && (role.permissions.includes('ADMINISTRATOR') || role.permissions.includes('MOVE_MEMBERS'))
              );
          }

          if (!canDisconnect) return; // Yetkisiz işlem

          // 2. Hedef kullanıcıyı bul ve soketini al
          // (voiceChannelState içinde tüm kanalları ara)
          let targetSocketId = null;
          let targetChannelId = null;

          const serverState = voiceChannelState[serverId];
          if (!serverState) return;

          // Hangi kanalda olduğunu bul
          Object.keys(serverState).forEach(channelId => {
              const userEntry = serverState[channelId].find(u => String(u.userId) === String(targetUserId));
              if (userEntry) {
                  targetSocketId = userEntry.socketId;
                  targetChannelId = channelId;
              }
          });

          if (targetSocketId) {
              const targetSocket = io.sockets.sockets.get(targetSocketId);
              if (targetSocket) {
                  // 3. Kullanıcıyı kanaldan çıkar (handleLeaveVoice)
                  // Ancak handleLeaveVoice için 'currentVoiceChannel' dolu olmalı
                  if(targetSocket.currentVoiceChannel) {
                      // Fonksiyonu dışarıdan çağıramadığımız için manuel yapıyoruz:
                      targetSocket.leave(targetChannelId);

                      // State'den sil
                      if (voiceChannelState[serverId][targetChannelId]) {
                          voiceChannelState[serverId][targetChannelId] = voiceChannelState[serverId][targetChannelId].filter(u => u.socketId !== targetSocketId);
                      }

                      delete targetSocket.currentVoiceChannel;

                      // 4. Bildirimler
                      targetSocket.emit('voice-channel-disconnected'); // Kullanıcıya haber ver
                      io.to(serverId).emit('voiceStateUpdate', voiceChannelState[serverId]); // Listeyi güncelle
                  }
              }
          }

      } catch (err) {
          console.error('[disconnect-voice-user] hata:', err);
      }
  });

  // -------------------------------------
  // WebRTC Sinyalleşme
  // -------------------------------------
  socket.on('webrtc-offer', (data) => {
    io.to(data.targetSocketId).emit('webrtc-offer', {
      socketId: socket.id,
      sdp: data.sdp,
    });
  });

  socket.on('webrtc-answer', (data) => {
    io.to(data.targetSocketId).emit('webrtc-answer', {
      socketId: socket.id,
      sdp: data.sdp,
    });
  });

  socket.on('webrtc-ice-candidate', (data) => {
    io.to(data.targetSocketId).emit('webrtc-ice-candidate', {
      socketId: socket.id,
      candidate: data.candidate,
    });
  });

  socket.on('leave-voice-channel', () => {
    handleLeaveVoice(socket);
  });

  // -------------------------------------
  // DM Olayları
  // -------------------------------------
  socket.on('joinDmRoom', (conversationId) => {
    socket.join(conversationId);
  });

  socket.on('joinConversation', (conversationId) => {
    socket.join(conversationId);
  });

  socket.on('leaveConversation', (conversationId) => {
    socket.leave(conversationId);
  });

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

      // 👇 YENİ: Konuşmanın tarihini güncelle (Listede yukarı çıksın diye)
      await Conversation.findByIdAndUpdate(data.conversationId, { lastMessageAt: Date.now() });

      const populatedDm = await PrivateMessage.findById(newDm._id).populate('author', 'username');

      io.to(data.conversationId).emit('newPrivateMessage', populatedDm);

      const conversation = await Conversation.findById(data.conversationId);
      const recipientId = conversation.participants.find(p => p.toString() !== data.authorId.toString());

      if (recipientId) {
          io.to(recipientId.toString()).emit('unreadDm', {
              conversationId: data.conversationId,
              senderId: data.authorId // Frontend'de kimden geldiğini anlamak için
          });
      }
    } catch (error) {
      console.error('[SOCKET HATA]: DM gönderilemedi:', error);
      socket.emit('messageError', { message: 'Sunucu hatası, DM gönderilemedi' });
    }
  });

  // -------------------------------------
  // Moderasyon Olayları
  // -------------------------------------
  socket.on('memberUpdated', (data) => {
    const { serverId, memberId, isMuted, isDeafened } = data;
    io.to(serverId).emit('memberUpdated', { memberId, isMuted, isDeafened });
  });

  socket.on('memberBanned', (data) => {
    io.to(data.serverId).emit('memberBanned', data);
  });

  socket.on('channelCreated', (data) =>
    io.to(data.serverId).emit('channelCreated', data.newChannel)
  );
  socket.on('channelUpdated', (data) =>
    io.to(data.serverId).emit('channelUpdated', data.updatedChannel)
  );
  socket.on('channelDeleted', (data) =>
    io.to(data.serverId).emit('channelDeleted', { channelId: data.channelId })
  );
  socket.on('roleUpdated', (data) => io.to(data.serverId).emit('roleUpdated', data));
  socket.on('roleDeleted', (data) => io.to(data.serverId).emit('roleDeleted', data));

  // -------------------------------------
  // Disconnect
  // -------------------------------------
  socket.on('disconnect', () => {
    console.log(`[SOCKET]: Kullanıcı ayrıldı. ID: ${socket.id}`);

    if (socket.userId) {
      const now = new Date();
      User.updateOne(
        { _id: socket.userId },
        { $set: { onlineStatus: 'offline', lastSeenAt: now } }
      )
        .then(() => {
          io.emit('userStatusChanged', {
            userId: socket.userId,
            status: 'offline',
            lastSeenAt: now,
          });
        })
        .catch((err) => console.error('[PRESENCE] offline guncelleme hatasi', err));
    }

    handleLeaveVoice(socket);
  });
});

// =========================================================================
// 🚀 Sunucu Başlatma
// =========================================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(
    `[SERVER]: API Sunucusu http://localhost:${PORT} adresinde başarıyla başlatıldı.`
  );
  console.log('[SOCKET]: Socket.IO sunucusu da aynı portta dinlemede.');
});

// Media Server
nms.run();

console.log(`[MEDIA-SERVER]: RTMP sunucusu rtmp://localhost:1935 adresinde başladı.`);
console.log(`[MEDIA-SERVER]: HLS sunucusu http://localhost:8000 adresinde başladı.`);

process.on('unhandledRejection', (err) => {
  console.log(`[HATA]: ${err.message}`);
  server.close(() => process.exit(1));
});
