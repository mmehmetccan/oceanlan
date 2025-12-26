// src/utils/gamificationEngine.js
const User = require('../models/UserModel');

const BADGE_DEFINITIONS = {
  // --- ÖZEL ROZETLER ---
  VETERAN_2025: {
    id: 'VETERAN_2025',
    name: '2025 Üyesi',
    description: '2025 yılı bitmeden aramıza katıldın.',
    xpReward: 200,
    // 🟢 DÜZELTME: Burası dosya adı değil, "ANAHTAR KELİME" olmalı
    icon: 'veteran_2025',
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
    // 🟢 DÜZELTME: Anahtar kelime
    icon: 'early_adopter',
    condition: async (user) => {
      try {
        const count = await User.countDocuments({ createdAt: { $lt: user.createdAt } });
        return count < 1000;
      } catch (e) { return false; }
    }
  },
  // --- DİĞERLERİ AYNI ---
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

// ... (calculateLevel ve processGamification fonksiyonları AYNI KALSIN)

const calculateLevel = (totalXp) => Math.floor(0.1 * Math.sqrt(totalXp)) + 1;

const processGamification = async (userId, actionType, io, extraValue = 0) => {
  // ... (Bu kısım önceki güvenli versiyonun aynısı olarak kalsın)
  // Sadece üstteki BADGE_DEFINITIONS kısmını güncellemen yeterli.
  try {
    const user = await User.findById(userId);
    if (!user) return;

    if (!user.stats) user.stats = { createdServers: 0, friendCount: 0, messagesSent: 0, voiceTime: 0 };
    if (!user.badges) user.badges = [];

    let xpGained = 0;
    let newBadges = [];

    if (actionType === 'CREATE_SERVER') user.stats.createdServers = (user.stats.createdServers || 0) + 1;
    if (actionType === 'ADD_FRIEND') user.stats.friendCount = (user.stats.friendCount || 0) + 1;
    if (actionType === 'SEND_MESSAGE') {
       user.stats.messagesSent = (user.stats.messagesSent || 0) + 1;
       xpGained += 0.05;
    }
    if (actionType === 'VOICE_SPEAKING') {
       const duration = extraValue || 0;
       xpGained += duration * 0.01;
       user.stats.voiceTime = (user.stats.voiceTime || 0) + duration;
    }

    for (const key of Object.keys(BADGE_DEFINITIONS)) {
      const badge = BADGE_DEFINITIONS[key];
      const hasBadge = user.badges.some(b => b.id === badge.id);
      if (!hasBadge) {
          try {
              if (await badge.condition(user)) {
                user.badges.push({ id: badge.id, name: badge.name, icon: badge.icon, earnedAt: new Date() });
                xpGained += badge.xpReward;
                newBadges.push(badge);
              }
          } catch (e) { console.error(`Rozet hatası (${badge.id}):`, e); }
      }
    }

    if (xpGained > 0) {
      user.xp = Math.round(((user.xp || 0) + xpGained) * 100) / 100;
      const newLevel = calculateLevel(user.xp);
      if (newLevel > (user.level || 1)) {
        user.level = newLevel;
        if (io) io.to(userId.toString()).emit('level-up', { level: newLevel, xp: user.xp });
      }
    }

    await user.save();

    if (newBadges.length > 0 && io) {
      newBadges.forEach(b => io.to(userId.toString()).emit('badge-earned', { name: b.name, icon: b.icon, xp: b.xpReward, description: b.description }));
    }

  } catch (error) {
    console.error("[Gamification] Hata:", error);
  }
};

module.exports = { processGamification };