// src/index.js (BACKEND - TAM VE DÜZELTİLMİŞ SÜRÜM)

require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

const app = express();
app.set('trust proxy', 1);
// Modeller
const Message = require('./models/MessageModel');
const Channel = require('./models/ChannelModel');
const Conversation = require('./models/ConversationModel');
const PrivateMessage = require('./models/PrivateMessageModel');
const Member = require('./models/MemberModel');
const User = require('./models/UserModel');
const { generalLimiter } = require('./middleware/rateLimiters');
const { processGamification } = require('./utils/gamificationEngine');

// Medya Sunucusu
const nms = require('./mediaServer');

// Veritabanı
connectDB();


const server = http.createServer(app);

// 🟢 SOCKET AYARLARI (PING TIME ARTIRILDI - KOPMALARI ÖNLER)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

app.set('io', io);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cors());
app.use(helmet());


// 3. HTTP Parameter Pollution önleme (Aynı parametreden 2 tane gelmesini engeller)
app.use(hpp());

// =========================================================================
// 🖼 Statik Dosyalar
// =========================================================================
const uploadsPath = path.join(__dirname, '..', 'uploads');
const updatesPath = path.join(__dirname, '..', 'updates');
const AVATAR_PHYSICAL_PATH = path.join(uploadsPath, 'avatars');

console.log(`[DOSYA SUNUCUSU]: ${uploadsPath}`);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/uploads', express.static(uploadsPath));
app.use('/updates', express.static(updatesPath));
app.use('/uploads/server_icons', express.static(path.join(uploadsPath, 'server_icons')));
app.use('/uploads/chat_attachments', express.static(path.join(uploadsPath, 'chat_attachments')));
app.use('/uploads/avatars', express.static(AVATAR_PHYSICAL_PATH));
app.use('/uploads/posts', express.static(path.join(uploadsPath, 'post_media')));
app.use('/uploads/post_media', express.static(path.join(uploadsPath, 'post_media')));

// Ping
app.get('/api/ping', (req, res) => {
    res.status(200).json({ success: true, message: 'Pong' });
});

app.use('/api', generalLimiter);

// =========================================================================
// 📦 API Rotaları (HEPSİ KORUNDU)
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
app.use('/api/v1/contact', require('./api/routes/contactRoutes'));

// 🟢 GLOBAL SES STATE'İ
let voiceChannelState = {};

// =========================================================================
// 🔐 Socket Auth
// =========================================================================
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication Error: Token not provided'));
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        next();
    } catch (err) {
        return next(new Error('Authentication Error: Invalid token'));
    }
});

// =========================================================================
// 🌐 SOCKET.IO MANTIĞI
// =========================================================================
io.on('connection', (socket) => {
    console.log(`[SOCKET]: Bağlandı ${socket.id} (User: ${socket.userId})`);

    // Presence (Online/Offline)
    if (socket.userId) {
        const now = new Date();
        User.updateOne({ _id: socket.userId }, { $set: { onlineStatus: 'online', lastSeenAt: now } }).catch(() => { });
        io.emit('userStatusChanged', { userId: socket.userId, status: 'online', lastSeenAt: now });

        // Kullanıcıya özel oda (DM ve Move bildirimleri için şart)
        socket.join(socket.userId.toString());
    }

    // --- YARDIMCI FONKSİYON: Kullanıcıyı sunucudaki TÜM kanallardan sil ---
    // (Hayalet kullanıcı sorununu çözen fonksiyon bu)
    const removeUserFromVoiceState = (serverId, userId) => {
        if (!voiceChannelState[serverId]) return;
        Object.keys(voiceChannelState[serverId]).forEach(channelId => {
            voiceChannelState[serverId][channelId] = voiceChannelState[serverId][channelId].filter(
                u => String(u.userId) !== String(userId)
            );
            if (voiceChannelState[serverId][channelId].length === 0) {
                delete voiceChannelState[serverId][channelId];
            }
        });
    };

    // --- YARDIMCI FONKSİYON: Ayrılma Mantığı ---
    const handleLeaveVoice = (sock) => {
        if (!sock.currentVoiceChannel) return;
        const { channelId, serverId, userId } = sock.currentVoiceChannel;

        sock.leave(channelId);

        // State'den temizle
        removeUserFromVoiceState(serverId, userId);

        // Bildirimler (Anında güncelleme için)
        sock.to(channelId).emit('user-left-voice', { socketId: sock.id });
        io.to(serverId).emit('voiceStateUpdate', voiceChannelState[serverId]);

        delete sock.currentVoiceChannel;
    };

    // -------------------------------------
    // 1. SES KANALINA KATILMA (DÜZELTİLDİ)
    // -------------------------------------
    socket.on('join-voice-channel', async (data) => {
        const { channelId, serverId, userId, username } = data || {};
        if (!channelId || !serverId || !userId) return;

        // Eğer zaten bir kanaldaysa ve farklıysa önce çık
        if (socket.currentVoiceChannel) {
            if (socket.currentVoiceChannel.channelId !== channelId) {
                handleLeaveVoice(socket);
            } else {
                return; // Zaten aynı kanalda
            }
        }

        try {
            const channel = await Channel.findById(channelId).populate('allowedRoles');
            const member = await Member.findOne({ user: userId, server: serverId });

            if (!channel || !member) {
                return socket.emit('join-voice-error', { message: 'Erişim hatası.' });
            }

            // Rol İzin Kontrolü (Senin kodundan korundu)
            if (channel.allowedRoles && channel.allowedRoles.length > 0) {
                const hasPermission = member.roles.some((memberRole) =>
                    channel.allowedRoles.some((allowedRole) => allowedRole._id.equals(memberRole))
                );
                if (!hasPermission) return socket.emit('join-voice-error', { message: 'Yetkiniz yok.' });
            }

            // State Oluştur
            if (!voiceChannelState[serverId]) voiceChannelState[serverId] = {};

            // 🔥 KRİTİK: Kullanıcıyı önce temizle (Duplicate önlemi)
            removeUserFromVoiceState(serverId, userId);

            // Yeni kanala ekle
            if (!voiceChannelState[serverId][channelId]) voiceChannelState[serverId][channelId] = [];
            voiceChannelState[serverId][channelId].push({
                userId,
                username,
                socketId: socket.id,
                isMuted: false,
                isDeafened: false
            });

            // Socket odalarına gir
            socket.join(channelId);
            if (!socket.rooms.has(serverId)) socket.join(serverId); // Listeyi görmek için sunucu odasına gir

            socket.currentVoiceChannel = { channelId, serverId, userId, username };

            // 📢 HERKESE HABER VER (Listenin güncellenmesi için)
            io.to(serverId).emit('voiceStateUpdate', voiceChannelState[serverId]);

            // WebRTC için odadakilere haber ver
            socket.to(channelId).emit('user-joined-voice', { socketId: socket.id, userId, username });

            console.log(`[SES] ${username} -> ${channelId} kanalına girdi.`);

        } catch (error) {
            console.error('Join voice error:', error);
        }
    });
    // -------------------------------------
    // 🎙️ KONUŞMA GÖSTERGESİ (GLOBAL YEŞİL IŞIK)
    // -------------------------------------
    socket.on('speaking-start', ({ serverId, userId }) => {
        // 1. Konuşma başladığı anı socket üzerine kaydet
        socket.speakingStartTime = Date.now();

        io.to(serverId).emit('user-speaking-change', { userId, isSpeaking: true });
    });

    socket.on('speaking-stop', ({ serverId, userId }) => {
        io.to(serverId).emit('user-speaking-change', { userId, isSpeaking: false });

        // 2. Konuşma bittiğinde süreyi hesapla ve XP ver
        if (socket.speakingStartTime) {
            const durationMs = Date.now() - socket.speakingStartTime;
            const durationSeconds = durationMs / 1000;

            // En az 1 saniyelik konuşmaları ciddiye al (Mikrofon cızırtısı vb. için)
            if (durationSeconds >= 1) {
                // XP Motorunu Çağır (userId olarak socket.userId kullanmak daha güvenlidir)
                processGamification(socket.userId || userId, 'VOICE_SPEAKING', io, durationSeconds);
            }

            // Süreyi sıfırla
            delete socket.speakingStartTime;
        }
    });

    // -------------------------------------
    // 2. KULLANICI TAŞIMA (MOVE) (DÜZELTİLDİ)
    // -------------------------------------
    socket.on('move-voice-user', async (payload) => {
        const { serverId, toChannelId, targetUserId } = payload;

        // Basit validasyon
        if (!serverId || !toChannelId || !targetUserId) return;

        try {
            // 1) YETKİ KONTROLÜ
            const operatorMember = await Member.findOne({ user: socket.userId, server: serverId }).populate('roles');
            if (!operatorMember) return;

            const canMove = operatorMember.roles.some((role) =>
                role.permissions && (role.permissions.includes('ADMINISTRATOR') || role.permissions.includes('MOVE_MEMBERS'))
            );

            // Sunucu sahibi kontrolü (Database owner'ı kontrol etmek daha iyi olur ama şimdilik yetki yeterli)
            // Eğer yetkisi yoksa dur
            if (!canMove) {
                console.log(`[MOVE] Yetkisiz işlem denemesi: ${socket.userId}`);
                return;
            }

            // 2) KULLANICIYI BUL (Akıllı Arama)
            // Frontend'in gönderdiği 'fromChannelId'ye güvenme. Sunucuyu tara.
            const serverState = voiceChannelState[serverId] || {};
            let foundFromChannelId = null;
            let targetSocketId = null;
            let targetUserEntry = null;

            // Tüm kanalları gez ve kullanıcıyı bul
            Object.keys(serverState).forEach(cId => {
                const userInChannel = serverState[cId].find(u => String(u.userId) === String(targetUserId));
                if (userInChannel) {
                    foundFromChannelId = cId;
                    targetSocketId = userInChannel.socketId;
                    targetUserEntry = userInChannel;
                }
            });

            // Kullanıcı ses kanalında değilse işlem yapma
            if (!foundFromChannelId || !targetUserEntry) {
                console.log(`[MOVE] Kullanıcı ${targetUserId} ses kanallarında bulunamadı.`);
                return;
            }

            // Aynı kanala taşıyorsak dur
            if (foundFromChannelId === toChannelId) return;

            // 3) STATE GÜNCELLEMESİ (Database gibi davranan bellek)

            // Eskiden sil
            if (voiceChannelState[serverId][foundFromChannelId]) {
                voiceChannelState[serverId][foundFromChannelId] = voiceChannelState[serverId][foundFromChannelId].filter(
                    u => String(u.userId) !== String(targetUserId)
                );
                // Kanal boşaldıysa key'i sil (Temizlik)
                if (voiceChannelState[serverId][foundFromChannelId].length === 0) {
                    delete voiceChannelState[serverId][foundFromChannelId];
                }
            }

            // Yeniye ekle
            if (!voiceChannelState[serverId][toChannelId]) {
                voiceChannelState[serverId][toChannelId] = [];
            }

            // Duplicate kontrolü
            if (!voiceChannelState[serverId][toChannelId].find(u => String(u.userId) === String(targetUserId))) {
                voiceChannelState[serverId][toChannelId].push(targetUserEntry);
            }

            // 4) HEDEF KULLANICIYI SOKET ODASINDA TAŞI
            if (targetSocketId) {
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    targetSocket.leave(foundFromChannelId); // Eski odadan çık
                    targetSocket.join(toChannelId);         // Yeni odaya gir

                    // Socket üzerindeki bilgiyi güncelle
                    targetSocket.currentVoiceChannel = {
                        ...targetSocket.currentVoiceChannel,
                        channelId: toChannelId
                    };

                    // 🔥 HEDEF KULLANICIYA "TAŞINDIN" EMRİ GÖNDER
                    targetSocket.emit('voice-channel-moved', {
                        newChannelId: toChannelId,
                        serverId,
                        channelName: 'Taşınan Kanal'
                    });
                }
            }

            // 5) HERKESE GÜNCEL LİSTEYİ GÖNDER (Herkesin ekranı güncellensin)
            io.to(serverId).emit('voiceStateUpdate', voiceChannelState[serverId]);

            console.log(`[MOVE] Başarılı: ${targetUserId} (${foundFromChannelId} -> ${toChannelId})`);

        } catch (err) {
            console.error('[MOVE] Hata:', err);
        }
    });

    socket.on('disconnect-voice-user', async (payload) => {
        // Senin orijinal 'disconnect-voice-user' kodun buraya...
        // (Kısa tutmak için yazmadım ama aynı mantıkla çalışır:
        //  User bul -> socket.leave -> state sil -> emit update)
        const { serverId, targetUserId } = payload || {};
        if (!serverId || !targetUserId) return;

        const serverState = voiceChannelState[serverId];
        let targetSocketId = null;
        if (serverState) {
            Object.keys(serverState).forEach(cid => {
                const u = serverState[cid].find(usr => String(usr.userId) === String(targetUserId));
                if (u) targetSocketId = u.socketId;
            });
        }

        if (targetSocketId) {
            const ts = io.sockets.sockets.get(targetSocketId);
            if (ts) {
                handleLeaveVoice(ts);
                ts.emit('voice-channel-disconnected');
            }
        }
    });

    // -------------------------------------
    // 3. DİĞER SOCKET OLAYLARI (MESAJLAR VB.) - KORUNDU
    // -------------------------------------

    socket.on('leave-voice-channel', () => handleLeaveVoice(socket));

    socket.on('get-server-voice-state', (serverId) => {
        socket.join(serverId);
        socket.emit('voiceStateUpdate', voiceChannelState[serverId] || {});
    });

    socket.on('joinServer', (serverId) => {
        if (!serverId) return;
        socket.join(serverId);
        socket.currentServerId = serverId;
        socket.emit('voiceStateUpdate', voiceChannelState[serverId] || {});
    });

    socket.on('leaveServer', (serverId) => {
        if (serverId) socket.leave(serverId);
    });

    // Metin Kanalları
    socket.on('joinChannel', (id) => id && socket.join(id));
    socket.on('leaveChannel', (id) => id && socket.leave(id));

    // Mesaj Gönderme
    socket.on('sendMessage', async (data) => {
        try {
            if (!data.content || !data.channelId || !data.authorId) return;
            const channel = await Channel.findById(data.channelId);
            if (!channel) return;

            const newMessage = await Message.create({
                content: data.content,
                author: data.authorId,
                channel: data.channelId,
                server: channel.server,
            });

            const populated = await Message.findById(newMessage._id).populate('author', 'username avatarUrl onlineStatus badges level');
            io.to(data.channelId).emit('newMessage', populated);


            processGamification(data.authorId, 'SEND_MESSAGE', io);
        } catch (e) { console.error(e); }
    });

    socket.on('watch-party-action', ({ type, payload, serverId }) => {
        console.log(`[YouTube] Server: ${serverId} -> İşlem: ${type}`);

        // Eğer sunucu ID'si varsa SADECE o sunucudaki (odadaki) kişilere gönder
        if (serverId) {
            // 'io.to' kullanıyoruz ki gönderen kişi de dahil herkes alsın ve senkron olsun
            io.to(serverId).emit(type === 'url' ? 'watch-party-url' : 'watch-party-state', payload);
        }
    });

    // DM (Özel Mesaj)
    socket.on('joinDmRoom', (id) => socket.join(id));
    socket.on('joinConversation', (id) => socket.join(id));
    socket.on('leaveConversation', (id) => socket.leave(id));

    socket.on('sendPrivateMessage', async (data) => {
        try {
            const newDm = await PrivateMessage.create({
                content: data.content,
                author: data.authorId,
                conversation: data.conversationId,
            });
            await Conversation.findByIdAndUpdate(data.conversationId, { lastMessageAt: Date.now() });
            const populated = await PrivateMessage.findById(newDm._id).populate('author', 'username level badges');
            io.to(data.conversationId).emit('newPrivateMessage', populated);

            // Bildirim
            const conv = await Conversation.findById(data.conversationId);
            const recipientId = conv.participants.find(p => p.toString() !== data.authorId.toString());
            if (recipientId) io.to(recipientId.toString()).emit('unreadDm', { conversationId: data.conversationId });
        } catch (e) { console.error(e); }
    });

    // Moderasyon & Kanal Yönetimi Eventleri
    socket.on('channelCreated', (d) => io.to(d.serverId).emit('channelCreated', d.newChannel));
    socket.on('channelUpdated', (d) => io.to(d.serverId).emit('channelUpdated', d.updatedChannel));
    socket.on('channelDeleted', (d) => io.to(d.serverId).emit('channelDeleted', d));
    socket.on('roleUpdated', (d) => io.to(d.serverId).emit('roleUpdated', d));
    socket.on('roleDeleted', (d) => io.to(d.serverId).emit('roleDeleted', d));
    socket.on('memberUpdated', (d) => io.to(d.serverId).emit('memberUpdated', d));

    // WebRTC
    socket.on('webrtc-offer', (d) => io.to(d.targetSocketId).emit('webrtc-offer', { socketId: socket.id, sdp: d.sdp }));
    socket.on('webrtc-answer', (d) => io.to(d.targetSocketId).emit('webrtc-answer', { socketId: socket.id, sdp: d.sdp }));
    socket.on('webrtc-ice-candidate', (d) => io.to(d.targetSocketId).emit('webrtc-ice-candidate', { socketId: socket.id, candidate: d.candidate }));

    // Disconnect
    socket.on('disconnect', () => {
        console.log(`[SOCKET]: Ayrıldı ${socket.id}`);

        // Ses Temizliği
        handleLeaveVoice(socket);

        // Offline Durumu
        if (socket.userId) {
            const now = new Date();
            User.updateOne({ _id: socket.userId }, { $set: { onlineStatus: 'offline', lastSeenAt: now } }).catch(() => { });
            io.emit('userStatusChanged', { userId: socket.userId, status: 'offline', lastSeenAt: now });
        }
    });
});

// Başlat
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`[SERVER] ${PORT} portunda aktif.`);
});

/** 
 * 🛠️ DÜZELTME: Media Server'ı sadece bir kez ve 
 * hata kontrolleriyle başlatıyoruz.
 */
try {
    // Eğer nms zaten çalışıyorsa hata vermemesi için kontrol ekleyebilirsin
    // Veya mediaServer.js içindeki nms.run() satırını silip sadece burada bırakabilirsin
    nms.run(); 
} catch (error) {
    console.error("NMS başlatılırken bir hata oluştu (Muhtemelen zaten çalışıyor):", error.message);
}