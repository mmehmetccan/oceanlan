const User = require('../models/UserModel');

// 🏆 ROZET TANIMLARI
const BADGE_DEFINITIONS = {
  // --- ÖZEL ROZETLER (YENİ EKLENDİ) ---
  VETERAN_2025: {
    id: 'VETERAN_2025',
    name: '2025 Üyesi',
    description: '2025 yılı bitmeden aramıza katıldın.',
    xpReward: 200,
    icon: 'server_gold', // Uygun bir ikon seçebilirsin
    // Şart: Kayıt tarihi 2025'ten önceyse
    condition: async (user) => {
      const limitDate = new Date('2026-01-01');
      return user.createdAt < limitDate;
    }
  },
  EARLY_ADOPTER: {
    id: 'EARLY_ADOPTER',
    name: 'Öncü Kaşif',
    description: 'Sunucunun ilk 1000 üyesinden birisin.',
    xpReward: 500,
    icon: 'friend_gold', // Uygun bir ikon seçebilirsin
    // Şart: Kendisinden önce kayıt olan kişi sayısı 1000'den azsa
    condition: async (user) => {
      // Bu sorgu biraz ağır olabilir, o yüzden sadece rozeti yoksa çalışır
      const count = await User.countDocuments({ createdAt: { $lt: user.createdAt } });
      return count < 1000;
    }
  },

  // --- SUNUCU ROZETLERİ ---
  SERVER_CREATOR_1: {
    id: 'SERVER_CREATOR_1',
    name: 'Topluluk Kurucusu',
    description: 'İlk sunucunu kurdun.',
    xpReward: 100,
    icon: 'server_bronze',
    condition: async (user) => user.stats.createdServers >= 1
  },
  SERVER_CREATOR_2: {
    id: 'SERVER_CREATOR_2',
    name: 'İmparator',
    description: '5 adet sunucu kurdun.',
    xpReward: 500,
    icon: 'server_gold',
    condition: async (user) => user.stats.createdServers >= 5
  },

  // --- ARKADAŞ ROZETLERİ ---
  FRIENDLY_1: {
    id: 'FRIENDLY_1',
    name: 'Sosyal Kelebek',
    description: '5 Arkadaşa ulaştın.',
    xpReward: 150,
    icon: 'friend_bronze',
    condition: async (user) => user.stats.friendCount >= 5
  },
  FRIENDLY_2: {
    id: 'FRIENDLY_2',
    name: 'Popüler',
    description: '20 Arkadaşa ulaştın.',
    xpReward: 600,
    icon: 'friend_gold',
    condition: async (user) => user.stats.friendCount >= 20
  }
};

// 📈 SEVİYE HESAPLAMA
const calculateLevel = (totalXp) => {
  return Math.floor(0.1 * Math.sqrt(totalXp)) + 1;
};

// 🔥 ANA FONKSİYON (GÜNCELLENDİ: ARTIK ASYNC DÖNGÜ KULLANIYOR)
const processGamification = async (userId, actionType, io, extraValue = 0) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    // 🛡️ GÜVENLİK KONTROLÜ
    if (!user.stats) user.stats = { createdServers: 0, friendCount: 0, messagesSent: 0, voiceTime: 0 };
    if (!user.badges) user.badges = [];

    let xpGained = 0;
    let newBadges = [];

    // 1. İstatistikleri Güncelle
    if (actionType === 'CREATE_SERVER') user.stats.createdServers = (user.stats.createdServers || 0) + 1;
    if (actionType === 'ADD_FRIEND') user.stats.friendCount = (user.stats.friendCount || 0) + 1;

    // Mesajlaşma (Mesaj Başına 0.05 XP)
    if (actionType === 'SEND_MESSAGE') {
       user.stats.messagesSent = (user.stats.messagesSent || 0) + 1;
       xpGained += 0.05;
    }

    // Sesli Sohbet (Saniye Başına 0.01 XP)
    if (actionType === 'VOICE_SPEAKING') {
       const durationSeconds = extraValue || 0;
       const earnedVoiceXP = durationSeconds * 0.01;
       if (earnedVoiceXP > 0) {
           xpGained += earnedVoiceXP;
           user.stats.voiceTime = (user.stats.voiceTime || 0) + durationSeconds;
       }
    }

    // 2. Rozetleri Kontrol Et (YENİ: FOR DÖNGÜSÜ İLE ASYNC KONTROL)
    // Map veya forEach içinde async/await düzgün çalışmaz, for..of kullanıyoruz.
    const badgeKeys = Object.keys(BADGE_DEFINITIONS);

    for (const key of badgeKeys) {
      const badge = BADGE_DEFINITIONS[key];

      // Kullanıcının bu rozeti zaten var mı?
      const hasBadge = user.badges.some(b => b.id === badge.id);

      // Yoksa ve Şartları sağlıyorsa (Await ile bekle)
      if (!hasBadge) {
          const isEligible = await badge.condition(user);

          if (isEligible) {
            user.badges.push({
              id: badge.id,
              name: badge.name,
              icon: badge.icon,
              earnedAt: new Date()
            });

            xpGained += badge.xpReward;
            newBadges.push(badge);
          }
      }
    }

    // 3. XP ve Seviye Güncelleme
    if (xpGained > 0) {
      let newTotalXP = (user.xp || 0) + xpGained;
      newTotalXP = Math.round(newTotalXP * 100) / 100; // Yuvarlama

      user.xp = newTotalXP;
      const newLevel = calculateLevel(user.xp);

      if (newLevel > (user.level || 1)) {
        user.level = newLevel;
        if (io) io.to(userId.toString()).emit('level-up', { level: newLevel, xp: user.xp });
      }
    }

    await user.save();

    // 🎉 YENİ ROZET VARSA BİLDİRİM GÖNDER
    if (newBadges.length > 0 && io) {
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