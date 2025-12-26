const User = require('../models/UserModel');

// 🏆 ROZET TANIMLARI
const BADGE_DEFINITIONS = {
  // --- ÖZEL ROZETLER ---
  VETERAN_2025: {
    id: 'VETERAN_2025',
    name: '2025 Üyesi',
    description: '2025 yılı bitmeden aramıza katıldın.',
    xpReward: 200,
    icon: '2025badge',
    // 2025'ten önce kayıt olanlar
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
    icon: 'friend_gold',
    // Kendisinden önce kayıtlı kişi sayısı 1000'den azsa
    condition: async (user) => {
      try {
        const count = await User.countDocuments({ createdAt: { $lt: user.createdAt } });
        return count < 1000;
      } catch (e) {
        console.error("Rozet kontrol hatası (Early Adopter):", e);
        return false;
      }
    }
  },

  // --- SUNUCU ROZETLERİ ---
  SERVER_CREATOR_1: {
    id: 'SERVER_CREATOR_1',
    name: 'Topluluk Kurucusu',
    description: 'İlk sunucunu kurdun.',
    xpReward: 100,
    icon: 'server_bronze',
    condition: async (user) => (user.stats?.createdServers || 0) >= 1
  },
  SERVER_CREATOR_2: {
    id: 'SERVER_CREATOR_2',
    name: 'İmparator',
    description: '5 adet sunucu kurdun.',
    xpReward: 500,
    icon: 'server_gold',
    condition: async (user) => (user.stats?.createdServers || 0) >= 5
  },

  // --- ARKADAŞ ROZETLERİ ---
  FRIENDLY_1: {
    id: 'FRIENDLY_1',
    name: 'Sosyal Kelebek',
    description: '5 Arkadaşa ulaştın.',
    xpReward: 150,
    icon: 'friend_bronze',
    condition: async (user) => (user.stats?.friendCount || 0) >= 5
  },
  FRIENDLY_2: {
    id: 'FRIENDLY_2',
    name: 'Popüler',
    description: '20 Arkadaşa ulaştın.',
    xpReward: 600,
    icon: 'friend_gold',
    condition: async (user) => (user.stats?.friendCount || 0) >= 20
  }
};

// 📈 SEVİYE HESAPLAMA
const calculateLevel = (totalXp) => {
  return Math.floor(0.1 * Math.sqrt(totalXp)) + 1;
};

// 🔥 ANA FONKSİYON
const processGamification = async (userId, actionType, io, extraValue = 0) => {
  try {
    // Kullanıcıyı bul
    const user = await User.findById(userId);
    if (!user) return;

    // 🛡️ GÜVENLİK KONTROLÜ (CRITICAL FIX)
    // Eski kullanıcılarda 'stats' veya 'badges' alanı olmayabilir.
    // Eğer yoksa varsayılan değerlerle başlatıyoruz.
    if (!user.stats) {
        user.stats = {
            createdServers: 0,
            friendCount: 0,
            messagesSent: 0,
            voiceTime: 0
        };
    }
    if (!user.badges) {
        user.badges = [];
    }

    let xpGained = 0;
    let newBadges = [];

    // 1. İstatistikleri Güncelle
    if (actionType === 'CREATE_SERVER') {
       user.stats.createdServers = (user.stats.createdServers || 0) + 1;
    }
    if (actionType === 'ADD_FRIEND') {
       user.stats.friendCount = (user.stats.friendCount || 0) + 1;
    }
    if (actionType === 'SEND_MESSAGE') {
       user.stats.messagesSent = (user.stats.messagesSent || 0) + 1;
       xpGained += 0.05;
    }
    if (actionType === 'VOICE_SPEAKING') {
       const durationSeconds = extraValue || 0;
       const earnedVoiceXP = durationSeconds * 0.01;
       if (earnedVoiceXP > 0) {
           xpGained += earnedVoiceXP;
           user.stats.voiceTime = (user.stats.voiceTime || 0) + durationSeconds;
       }
    }

    // 2. Rozetleri Kontrol Et (ASYNC FOR LOOP)
    // forEach yerine for...of kullanmalıyız çünkü async/await beklemeli
    for (const key of Object.keys(BADGE_DEFINITIONS)) {
      const badge = BADGE_DEFINITIONS[key];

      // Kullanıcının bu rozeti zaten var mı?
      const hasBadge = user.badges.some(b => b.id === badge.id);

      if (!hasBadge) {
          try {
              // Condition fonksiyonunu çalıştır ve bekle
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
                console.log(`[Gamification] Rozet Kazanıldı: ${user.username} -> ${badge.name}`);
              }
          } catch (err) {
              console.error(`[Gamification] Rozet kontrol hatası (${badge.id}):`, err);
          }
      }
    }

    // 3. XP ve Seviye Güncelleme
    if (xpGained > 0) {
      let newTotalXP = (user.xp || 0) + xpGained;
      newTotalXP = Math.round(newTotalXP * 100) / 100;

      user.xp = newTotalXP;
      const newLevel = calculateLevel(user.xp);

      if (newLevel > (user.level || 1)) {
        user.level = newLevel;
        if (io) {
            io.to(userId.toString()).emit('level-up', {
                level: newLevel,
                xp: user.xp
            });
        }
      }
    }

    // Tüm değişiklikleri kaydet
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
    console.error("[Gamification] Kritik Hata:", error);
  }
};

module.exports = { processGamification };