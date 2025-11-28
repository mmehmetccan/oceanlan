// src/api/controllers/roleController.js
// ... (Tüm importlar aynı)
const Role = require('../models/RoleModel');
const Server = require('../models/ServerModel');
const Member = require('../models/MemberModel');

const createRole = async (req, res) => {
  try {
    const { serverId } = req.params;
    const { name, color, permissions } = req.body;
    const server = await Server.findById(serverId);
    if (!server) {
        return res.status(404).json({ success: false, message: 'Sunucu bulunamadı' });
    }

    // TODO: İzin kontrolü

    const newRole = await Role.create({
      name: name || 'Yeni Rol',
      color: color || '#99AAB5',
      permissions: permissions || ['SEND_MESSAGES', 'VOICE_SPEAK'], // Gelen izinleri veya varsayılanı al
      server: serverId,
    });

    // 🚨 EKSİK ADIM EKLENDİ: Rolü sunucuya kaydet
    server.roles.push(newRole._id);
    await server.save();

    res.status(201).json({ success: true, data: newRole });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Rol oluşturulamadı', error: error.message });
  }
};

// ... (updateRole aynı)
const updateRole = async (req, res) => {
  try {
    const { roleId } = req.params;
    const { name, color, permissions } = req.body;
    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Rol bulunamadı' });
    }
    if (role.name === '@everyone' && name) {
        return res.status(400).json({ success: false, message: '@everyone rolünün adı değiştirilemez' });
    }
    const updatedRole = await Role.findByIdAndUpdate(
      roleId,
      { name, color, permissions },
      { new: true, runValidators: true }
    );
    res.status(200).json({ success: true, data: updatedRole });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Rol güncellenemedi', error: error.message });
  }
};

// @desc    Bir rolü siler
const deleteRole = async (req, res) => {
    try {
        const { roleId } = req.params;
        const role = await Role.findById(roleId);
        if (!role) {
            return res.status(404).json({ success: false, message: 'Rol bulunamadı' });
        }

        if (role.isDefault || role.name === 'Admin' || role.name === '@everyone') {
            return res.status(400).json({ success: false, message: 'Varsayılan roller silinemez' });
        }

        // 1. Rolü sil
        await Role.findByIdAndDelete(roleId);

        // 2. Üyelerden rolü kaldır
        await Member.updateMany(
            { roles: roleId },
            { $pull: { roles: roleId } }
        );

        // 3. 🚨 ROLÜ SUNUCUDAN KALDIR
        await Server.findByIdAndUpdate(role.server, {
            $pull: { roles: roleId }
        });

        res.status(200).json({ success: true, message: 'Rol başarıyla silindi' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Rol silinemedi', error: error.message });
    }
};

module.exports = {
  createRole,
  updateRole,
  deleteRole,
};