// src/utils/gamificationEngine.js
const User = require('../models/UserModel');

// Sadece prestijli ve tarihsel rozetler kaldı
const BADGE_DEFINITIONS = {
  EARLY_ADOPTER: {
    id: 'EARLY_ADOPTER',
    name: 'ilk 1000 Kullanıcı', // Veya "Kurucu Üye"
    description: 'Oceanlan kullanan ilk 1000 üyeden birisin.',
    xpReward: 500,
    icon: 'early_adopter', // Frontend'de bu ismi kullanacaksın
    condition: async (user) => {
      // Eğer kullanıcı zaten çok yeniyse sorgu yapmaya bile gerek yok, ama
      // güvenli olması için veritabanı sırasını kontrol ediyoruz.
      try {
        const count = await User.countDocuments({ createdAt: { $lt: user.createdAt } });
        return count < 1000;
      } catch (e) { return false; }
    }
  },
  VETERAN_2025: {
    id: 'VETERAN_2025',
    name: '2025 Üyesi',
    description: '2025 yılı bitmeden aramıza katıldın.',
    xpReward: 200,
    icon: 'veteran_2025',
    condition: async (user) => {
      const limitDate = new Date('2026-01-01');
      return user.createdAt < limitDate;
    }
  }
};

const calculateLevel = (totalXp) => Math.floor(0.1 * Math.sqrt(totalXp)) + 1;

const processGamification = async (userId, actionType, io, extraValue = 0) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    // Stats objesi level sistemi için hala gerekli olabilir
    if (!user.stats) user.stats = { messagesSent: 0, voiceTime: 0 };
    if (!user.badges) user.badges = [];

    let xpGained = 0;
    let newBadges = [];

    // --- XP ve İstatistik Mantığı (Level Atlamak İçin) ---
    // Rozet vermesek bile level atlamaları için XP vermeye devam edebiliriz.
    if (actionType === 'SEND_MESSAGE') {
      user.stats.messagesSent = (user.stats.messagesSent || 0) + 1;
      xpGained += 0.05; // Mesaj başı az XP
    }
    if (actionType === 'VOICE_SPEAKING') {
      const duration = extraValue || 0;
      xpGained += duration * 0.01; // Konuşma süresine göre XP
      user.stats.voiceTime = (user.stats.voiceTime || 0) + duration;
    }

    // --- Rozet Kontrolü ---
    for (const key of Object.keys(BADGE_DEFINITIONS)) {
      const badge = BADGE_DEFINITIONS[key];

      // Kullanıcının bu rozeti zaten var mı?
      const hasBadge = user.badges.some(b => b.id === badge.id);

      if (!hasBadge) {
        try {
          // Şart sağlanıyor mu?
          if (await badge.condition(user)) {
            user.badges.push({
              id: badge.id,
              name: badge.name,
              icon: badge.icon,
              earnedAt: new Date()
            });

            // Rozet kazanıldığı an XP ödülünü de ver
            xpGained += badge.xpReward;
            newBadges.push(badge);
          }
        } catch (e) { console.error(`Rozet kontrol hatası (${badge.id}):`, e); }
      }
    }

    // --- Level ve XP Kaydetme ---
    if (xpGained > 0) {
      user.xp = Math.round(((user.xp || 0) + xpGained) * 100) / 100;
      const newLevel = calculateLevel(user.xp);

      if (newLevel > (user.level || 1)) {
        user.level = newLevel;
        // Level atlama bildirimi
        if (io) io.to(userId.toString()).emit('level-up', { level: newLevel, xp: user.xp });
      }
    }

    await user.save();

    // --- Yeni Rozet Bildirimi ---
    if (newBadges.length > 0 && io) {
      newBadges.forEach(b => io.to(userId.toString()).emit('badge-earned', {
        name: b.name,
        icon: b.icon,
        xp: b.xpReward,
        description: b.description
      }));
    }

  } catch (error) {
    console.error("[Gamification] Hata:", error);
  }
};

module.exports = { processGamification };