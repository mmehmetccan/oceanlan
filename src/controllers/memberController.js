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
        const { isMuted, isDeafened } = req.body;

        // findByIdAndUpdate kullanarak doğrudan veritabanına yazalım (daha güvenli)
        const updateData = {};
        if (typeof isMuted === 'boolean') updateData.isMuted = isMuted;
        if (typeof isDeafened === 'boolean') updateData.isDeafened = isDeafened;

        const updatedMember = await Member.findByIdAndUpdate(
            memberId,
            { $set: updateData },
            { new: true }
        );

        if (!updatedMember) {
            return res.status(404).json({ success: false, message: 'Üye bulunamadı' });
        }

        // Socket bildirimi gönder (Anlık etkileşim için önemli)
        const io = req.app.get('io');
        if (io) {
            io.to(req.params.serverId).emit('memberUpdated', { 
                memberId: updatedMember._id, 
                isMuted: updatedMember.isMuted, 
                isDeafened: updatedMember.isDeafened 
            });
        }

        res.status(200).json({ success: true, data: updatedMember });
    } catch (error) {
        console.error("Status Update Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Üyeyi banlar
const banMember = async (req, res) => {
    try {
        const { serverId, memberId } = req.params;
        const { reason } = req.body;

        const memberToBan = await Member.findById(memberId);
        if (!memberToBan) return res.status(404).json({ success: false, message: 'Üye bulunamadı' });

        // Ban kaydı oluştur
        await Ban.create({
            server: serverId,
            user: memberToBan.user,
            reason: reason || 'Sebep belirtilmedi',
            bannedBy: req.user.id
        });

        // Üyeliği sil ve sunucudan çıkar
        const userId = memberToBan.user.toString();
        await Member.findByIdAndDelete(memberId);
        await Server.findByIdAndUpdate(serverId, { $pull: { members: memberId } });
        await User.findByIdAndUpdate(userId, { $pull: { servers: serverId } });

        res.status(200).json({ success: true, message: 'Kullanıcı yasaklandı' });
    } catch (error) {
        console.error("Ban Error:", error);
        res.status(500).json({ success: false, message: error.message });
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