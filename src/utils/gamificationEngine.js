const User = require('../models/UserModel');

// 🏆 ROZET TANIMLARI
const BADGE_DEFINITIONS = {
  // --- SUNUCU ROZETLERİ ---
  SERVER_CREATOR_1: {
    id: 'SERVER_CREATOR_1',
    name: 'Topluluk Kurucusu',
    description: 'İlk sunucunu kurdun.',
    xpReward: 100,
    icon: 'server_bronze',
    condition: (user) => user.stats.createdServers >= 1
  },
  SERVER_CREATOR_2: {
    id: 'SERVER_CREATOR_2',
    name: 'İmparator',
    description: '5 adet sunucu kurdun.',
    xpReward: 500,
    icon: 'server_gold',
    condition: (user) => user.stats.createdServers >= 5
  },

  // --- ARKADAŞ ROZETLERİ ---
  FRIENDLY_1: {
    id: 'FRIENDLY_1',
    name: 'Sosyal Kelebek',
    description: '5 Arkadaşa ulaştın.',
    xpReward: 150,
    icon: 'friend_bronze',
    condition: (user) => user.stats.friendCount >= 5
  },
  FRIENDLY_2: {
    id: 'FRIENDLY_2',
    name: 'Popüler',
    description: '20 Arkadaşa ulaştın.',
    xpReward: 600,
    icon: 'friend_gold',
    condition: (user) => user.stats.friendCount >= 20
  }
};

// 📈 SEVİYE HESAPLAMA (Her seviye bir öncekinden %20 daha zor olsun)
// Örn: Lvl 1->2 (1000 XP), Lvl 2->3 (1200 XP)...
const calculateLevel = (totalXp) => {
  return Math.floor(0.1 * Math.sqrt(totalXp)) + 1;
};

// 🔥 ANA FONKSİYON
const processGamification = async (userId, actionType, io) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    let xpGained = 0;
    let newBadges = [];

    // 1. İstatistikleri Güncelle
    if (actionType === 'CREATE_SERVER') user.stats.createdServers += 1;
    if (actionType === 'ADD_FRIEND') user.stats.friendCount += 1;
    if (actionType === 'SEND_MESSAGE') {
       user.stats.messagesSent += 1;
       xpGained += 5; // Her mesaj 5 XP verir (Standart kazanç)
    }

    // 2. Rozetleri Kontrol Et
    Object.values(BADGE_DEFINITIONS).forEach(badge => {
      // Eğer kullanıcıda bu rozet yoksa VE şartı sağlıyorsa
      const hasBadge = user.badges.some(b => b.id === badge.id);

      if (!hasBadge && badge.condition(user)) {
        // Rozeti Ver
        user.badges.push({
          id: badge.id,
          name: badge.name,
          icon: badge.icon
        });

        // Ödül XP'yi ekle
        xpGained += badge.xpReward;
        newBadges.push(badge);
      }
    });

    // 3. XP ve Seviye Güncelleme
    if (xpGained > 0) {
      user.xp += xpGained;
      const newLevel = calculateLevel(user.xp);

      // Seviye atladı mı?
      if (newLevel > user.level) {
        user.level = newLevel;
        // 🎉 SOCKET İLE BİLDİRİM GÖNDER (LEVEL UP!)
        io.to(userId.toString()).emit('level-up', {
          level: newLevel,
          xp: user.xp
        });
      }
    }

    // Değişiklikleri kaydet
    await user.save();

    // 🎉 YENİ ROZET VARSA BİLDİRİM GÖNDER
    if (newBadges.length > 0) {
      newBadges.forEach(badge => {
        io.to(userId.toString()).emit('badge-earned', {
          name: badge.name,
          description: badge.description,
          icon: badge.icon,
          xp: badge.xpReward
        });
      });
    }

  } catch (error) {
    console.error("Gamification Error:", error);
  }
};

module.exports = { processGamification };