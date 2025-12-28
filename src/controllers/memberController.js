// src/api/controllers/memberController.js
const Member = require('../models/MemberModel');
const Server = require('../models/ServerModel');
const Ban = require('../models/BanModel');
const User = require('../models/UserModel'); // User modeline ihtiyaç olabilir

// ---------------- YENİ FONKSİYON ----------------
// @desc    Bir üyenin mute durumunu günceller
// @route   PUT /api/v1/servers/:serverId/members/:memberId/status
// @access  Private (MUTE_MEMBERS izni gerekir)
const updateMemberStatus = async (req, res) => {
    try {
        const { memberId } = req.params;
        // isMuted: true veya false
        const { isMuted, isDeafened } = req.body;

        const member = await Member.findById(memberId);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Üye bulunamadı' });
        }

        let message = 'Durum güncellendi';
        let updatedFields = {};

        // Sadece 'isMuted' güncelleniyorsa
        if (typeof isMuted === 'boolean') {
            member.isMuted = isMuted;
            updatedFields.isMuted = isMuted;
            message = `Üye başarıyla ${isMuted ? 'susturuldu' : 'açıldı'}`;
        }

        // Sadece 'isDeafened' güncelleniyorsa
        if (typeof isDeafened === 'boolean') {
            member.isDeafened = isDeafened;
            updatedFields.isDeafened = isDeafened;
            message = `Üye başarıyla ${isDeafened ? 'sağırlaştırıldı' : 'açıldı'}`;
        }

        await member.save();

        // 🟢 SOCKET BİLDİRİMİ (MUTE/DEAFEN)
        const io = req.app.get('io');
        if (io) {
            // Sunucudaki herkese üyenin yeni durumunu gönder
            io.to(member.server.toString()).emit('memberUpdated', member);
        }

        res.status(200).json({
            success: true,
            message: message,
            data: member
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Durum güncellenemedi', error: error.message });
    }
};


const banMember = async (req, res) => {
    try {
        const { serverId, memberId } = req.params;
        const { reason } = req.body;
        const bannerUserId = req.user.id;

        const memberToBan = await Member.findById(memberId);
        if (!memberToBan) {
            return res.status(404).json({ success: false, message: 'Yasaklanacak üye bulunamadı' });
        }

        const server = await Server.findById(serverId);
        if (server.owner.equals(memberToBan.user)) {
            return res.status(400).json({ success: false, message: 'Sunucu sahibi yasaklanamaz' });
        }
        if (bannerUserId.toString() === memberToBan.user.toString()) {
            return res.status(400).json({ success: false, message: 'Kendinizi yasaklayamazsınız' });
        }

        const bannedUserId = memberToBan.user.toString(); // ID'yi sakla

        // 1. Yasaklama kaydını oluştur (Kalıcı)
        await Ban.create({
            user: memberToBan.user,
            server: serverId,
            bannedBy: bannerUserId,
            reason: reason || 'Neden belirtilmedi'
        });

        // 2. Üyeyi sunucudan at
        await Member.findByIdAndDelete(memberId);
        await Server.findByIdAndUpdate(serverId, {
            $pull: { members: memberId }
        });

        // Kullanıcının sunucu listesinden de kaldır (Veritabanı temizliği)
        await User.findByIdAndUpdate(bannedUserId, {
            $pull: { servers: serverId }
        });

        // 🟢 SOCKET BİLDİRİMİ (BAN)
        const io = req.app.get('io');
        if (io) {
            // 1. Sunucudaki herkesin listesinden bu kişiyi düşür
            io.to(serverId).emit('member-left', { serverId, userId: bannedUserId });

            // 2. Yasaklanan kişiye özel sinyal gönder (Sayfadan atmak için)
            io.to(bannedUserId).emit('removed-from-server', { serverId });
        }

        res.status(200).json({ success: true, message: 'Üye başarıyla sunucudan yasaklandı' });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Bu üye zaten yasaklanmış.' });
        }
        res.status(500).json({ success: false, message: 'Sunucu Hatası', error: error.message });
    }
};

// @desc    Bir üyenin rollerini günceller
// @route   PUT /api/v1/servers/:serverId/members/:memberId/roles
// @access  Private (MANAGE_ROLES izni gerekir)
const updateMemberRoles = async (req, res) => {
    try {
        const { memberId } = req.params;
        const { roles } = req.body;

        const member = await Member.findById(memberId);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Üye bulunamadı' });
        }

        const server = await Server.findById(member.server);
        let newRoles = [...roles];
        if (!newRoles.includes(server.defaultRole.toString())) {
            newRoles.push(server.defaultRole.toString());
        }

        member.roles = newRoles;
        await member.save();

        // Populate ederek döndür (Frontend renkleri ve isimleri bilsin diye)
        const populatedMember = await Member.findById(memberId).populate('roles', 'name color permissions');

        // 🟢 SOCKET BİLDİRİMİ (ROL GÜNCELLEME)
        const io = req.app.get('io');
        if (io) {
            // Tüm sunucuya güncel üyeyi gönder (Renk değişimi vb. için)
            io.to(member.server.toString()).emit('memberUpdated', populatedMember);
        }

        res.status(200).json({
            success: true,
            message: 'Üye rolleri güncellendi',
            data: populatedMember
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Roller güncellenemedi', error: error.message });
    }
};


// @desc    Bir üyeyi sunucudan atar (Kick)
const kickMember = async (req, res) => {
    try {
        const { serverId, memberId } = req.params;
        const kickerUserId = req.user.id;

        const memberToKick = await Member.findById(memberId);
        if (!memberToKick) {
            return res.status(404).json({ success: false, message: 'Atılacak üye bulunamadı' });
        }
        const kickerMembership = await Member.findOne({ user: kickerUserId, server: serverId });

        const server = await Server.findById(serverId);
        if (server.owner.equals(memberToKick.user)) {
            return res.status(400).json({ success: false, message: 'Sunucu sahibi atılamaz' });
        }
        if (kickerMembership._id.equals(memberToKick._id)) {
            return res.status(400).json({ success: false, message: 'Kendinizi atamazsınız' });
        }

        const kickedUserId = memberToKick.user.toString(); // ID'yi sakla

        await Member.findByIdAndDelete(memberId);
        await Server.findByIdAndUpdate(serverId, {
            $pull: { members: memberId }
        });

        // Kullanıcının sunucu listesinden de kaldır
        await User.findByIdAndUpdate(kickedUserId, {
            $pull: { servers: serverId }
        });

        // 🟢 SOCKET BİLDİRİMİ (KICK)
        const io = req.app.get('io');
        if (io) {
            // 1. Sunucudaki herkesin listesinden bu kişiyi düşür
            io.to(serverId).emit('member-left', { serverId, userId: kickedUserId });

            // 2. Atılan kişiye özel sinyal gönder (Dashboard'a yönlendirmek için)
            // Bu sinyal sayesinde frontend çökmez, ana sayfaya döner
            io.to(kickedUserId).emit('removed-from-server', { serverId });
        }

        res.status(200).json({ success: true, message: 'Üye başarıyla sunucudan atıldı' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Sunucu Hatası', error: error.message });
    }
};

module.exports = {
    kickMember,
    updateMemberRoles,
    updateMemberStatus,
    banMember,
};