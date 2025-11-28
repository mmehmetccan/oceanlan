// src/utils/permissionChecker.js
// Bu fonksiyon, kullanıcının aktif sunucudaki rollerine bakarak
// istenen izne sahip olup olmadığını kontrol eder.

/**
 * Kullanıcının belirli bir izne sahip olup olmadığını kontrol eder.
 * @param {object} activeServer - Sunucunun tüm detayları (members ve roles populated)
 * @param {string} userId - Giriş yapan kullanıcının ID'si
 * @param {string} requiredPermission - Gerekli olan izin string'i (örn: 'KICK_MEMBERS')
 * @returns {boolean} İzin varsa true, yoksa false
 */
export const checkUserPermission = (activeServer, userId, requiredPermission) => {
    if (!activeServer || !userId) return false;

    // 1. Kullanıcının üyelik kaydını bul
    // activeServer.members, populated edilmiş Member objeleri içerir
    const userMembership = activeServer.members.find(
        member => member.user._id.toString() === userId.toString()
    );

    if (!userMembership || !userMembership.roles) {
        return false;
    }

    // 2. İzinleri kontrol et
    for (const role of userMembership.roles) {
        // Rollerin permissions dizisini kontrol et
        if (role.permissions.includes('ADMINISTRATOR')) {
            return true; // Admin ise her zaman izinlidir
        }
        if (role.permissions.includes(requiredPermission)) {
            return true;
        }
    }

    return false;
};