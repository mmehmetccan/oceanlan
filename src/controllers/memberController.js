// src/api/controllers/memberController.js
const Member = require('../models/MemberModel');
const Server = require('../models/ServerModel');
const Ban = require('../models/BanModel'); // YENİ IMPORT



// ... (updateMemberRoles ve kickMember fonksiyonları aynı)

// ---------------- YENİ FONKSİYON ----------------
// @desc    Bir üyenin mute durumunu günceller
// @route   PUT /api/v1/servers/:serverId/members/:memberId/status
// @access  Private (MUTE_MEMBERS izni gerekir)
const updateMemberStatus = async (req, res) => {
    try {
        const { memberId } = req.params;
        // isMuted: true veya false
        const { isMuted ,isDeafened} = req.body;



        // TODO: İzin kontrolü (checkPermission('MUTE_MEMBERS')) middleware'de

        const member = await Member.findById(memberId);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Üye bulunamadı' });
        }

        let message = 'Durum güncellendi';

        // Sadece 'isMuted' güncelleniyorsa
        if (typeof isMuted === 'boolean') {
             // TODO: İzin kontrolü (MUTE_MEMBERS)
             member.isMuted = isMuted;
             message = `Üye başarıyla ${isMuted ? 'susturuldu' : 'açıldı'}`;
        }

        // Sadece 'isDeafened' güncelleniyorsa
        if (typeof isDeafened === 'boolean') {
            // TODO: İzin kontrolü (DEAFEN_MEMBERS)
            member.isDeafened = isDeafened;
            message = `Üye başarıyla ${isDeafened ? 'sağırlaştırıldı' : 'açıldı'}`;
        }
        // ---------------------
        await member.save();

        // 🚨 ÖNEMLİ: Güncellemeyi tüm sunucuya socket ile bildir
        // Bu işlemi socket sunucunuzdan (index.js) yapmanız daha sağlıklı olacaktır
        // Veya buradan bir event emit edebilirsiniz (eğer io'yu req'e eklerseniz)

        // io.to(member.server.toString()).emit('memberUpdated', member);

        res.status(200).json({
            success: true,
            message: `Üye başarıyla ${isMuted ? 'susturuldu' : 'açıldı'}`,
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
        const bannerUserId = req.user.id; // 'protect' kalkanından

        // TODO: İzin kontrolü (BAN_MEMBERS)

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

        // 1. Yasaklama kaydını oluştur (Kalıcı)
        await Ban.create({
            user: memberToBan.user,
            server: serverId,
            bannedBy: bannerUserId,
            reason: reason || 'Neden belirtilmedi'
        });

        // 2. Üyeyi sunucudan at (Kick ile aynı mantık)
        await Member.findByIdAndDelete(memberId);
        await Server.findByIdAndUpdate(serverId, {
            $pull: { members: memberId }
        });

        // TODO: Socket ile 'userBanned' event'i yayınla
        // req.io.to(serverId).emit('userBanned', { userId: memberToBan.user, serverId });

        res.status(200).json({ success: true, message: 'Üye başarıyla sunucudan yasaklandı' });

    } catch (error) {
        // Eğer zaten yasaklıysa (unique index hatası)
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
        // 🚨 DİKKAT: 'roles' bir dizi ID olmalıdır
        const { roles } = req.body;

        // TODO: İzin kontrolü (Giriş yapan kullanıcının 'MANAGE_ROLES' izni var mı?)

        const member = await Member.findById(memberId);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Üye bulunamadı' });
        }

        // Sunucunun @everyone rolünü her zaman koru
        const server = await Server.findById(member.server);
        let newRoles = [...roles]; // Gelen yeni rolleri al
        if (!newRoles.includes(server.defaultRole.toString())) {
             newRoles.push(server.defaultRole.toString()); // @everyone rolünü ekle
        }

        member.roles = newRoles; // Rolleri güncelle
        await member.save();

        const populatedMember = await Member.findById(memberId).populate('roles', 'name color');

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

    await Member.findByIdAndDelete(memberId);
    await Server.findByIdAndUpdate(serverId, {
        $pull: { members: memberId }
    });

    res.status(200).json({ success: true, message: 'Üye başarıyla sunucudan atıldı' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Sunucu Hatası', error: error.message });
  }
};

module.exports = {
  kickMember,
  updateMemberRoles, // 🚨 YENİ EKLENDİ
    updateMemberStatus,
    banMember,
};