const Member = require('../models/MemberModel');
const Role = require('../models/RoleModel');

// Bu, bir middleware "üreticisidir".
// Hangi izni kontrol edeceğimizi (örn: 'KICK_MEMBERS') parametre olarak alır.
const checkPermission = (requiredPermission) => {
  // Asıl middleware fonksiyonunu döndürür
  return async (req, res, next) => {
    try {
      const userId = req.user.id; // 'protect' kalkanından geliyor
      const { serverId } = req.params;

      if (!serverId) {
        return res.status(400).json({ success: false, message: 'Sunucu ID (serverId) gereklidir' });
      }


      const server = await Server.findById(serverId);
      if (!server) {
        return res.status(404).json({ success: false, message: 'Sunucu bulunamadı' });
      }

      if (server.owner.toString() === userId.toString()) {
        return next();
      }

      // 1. Kullanıcının o sunucudaki üyelik kaydını bul
      const membership = await Member.findOne({ user: userId, server: serverId })
        .populate('roles'); // Roller bilgisiyle doldur

      if (!membership) {
        return res.status(403).json({ success: false, message: 'Bu sunucuda üye değilsiniz' });
      }

      // 2. Kullanıcının sahip olduğu TÜM izinleri tek bir dizide topla
      let userPermissions = new Set();

      for (const role of membership.roles) {
        // Eğer rollerden BİRİ 'ADMINISTRATOR' ise, anında yetki ver.
        if (role.permissions.includes('ADMINISTRATOR')) {
          userPermissions.add('ADMINISTRATOR');
          break; // Döngüden çık, admin'dir
        }
        // Değilse, o rolün izinlerini listeye ekle
        role.permissions.forEach(perm => userPermissions.add(perm));
      }

      // 3. Kontrol: Kullanıcının izinleri arasında 'ADMINISTRATOR' VAR MI?
      //    VEYA, (gerekli izni, örn 'KICK_MEMBERS') VAR MI?
      if (userPermissions.has('ADMINISTRATOR') || userPermissions.has(requiredPermission)) {
        next(); // İzin verildi, bir sonraki adıma (controller'a) geç
      } else {
        res.status(403).json({ success: false, message: `Yetkisiz işlem: Bu işlemi yapmak için '${requiredPermission}' iznine ihtiyacınız var` });
      }

    } catch (error) {
      res.status(500).json({ success: false, message: 'İzin kontrolü sırasında sunucu hatası', error: error.message });
    }
  };
};

module.exports = { checkPermission };