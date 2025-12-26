// src/components/gamification/UserBadgeList.jsx
import React from 'react';

// 🟢 KLASÖR YOLU: 'badges' (Çoğul) olduğundan emin ol.
// Dosyanın yeri: oceanlan-frontend/public/assets/badges/2025badge.png
const BADGE_PATH = '/assets/badges';

const BADGE_IMAGES = {
  // Backend'den gelen 'icon' kodu : 'Gerçek dosya adı'
  'server_gold': 'gold-medal.png',
  'server_bronze': 'bronze-medal.png',
  'friend_gold': 'social-star.png',
  'friend_bronze': 'friendly.png',

  // 🟢 EŞLEŞTİRME BURADA YAPILIYOR:
  'veteran_2025': '2025badge.png',
  'early_adopter': 'early-bird.png',

  'default': 'default-badge.png'
};

const UserBadgeList = ({ badges }) => {
  if (!badges || badges.length === 0) return null;

  const getBadgeImg = (iconName) => {
    // Eğer backend'den gelen isim listede varsa onu kullan, yoksa default'u kullan
    const fileName = BADGE_IMAGES[iconName] || BADGE_IMAGES['default'];
    return `${BADGE_PATH}/${fileName}`;
  };

  return (
    <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
      {badges.map((badge, index) => (
        <div
            key={index}
            className="user-badge-item"
            title={badge.description || badge.name}
            style={{
                cursor: 'help',
                transition: 'transform 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <img
            src={getBadgeImg(badge.icon)}
            alt={badge.name}
            style={{
              width: '24px',
              height: '24px',
              objectFit: 'contain',
              filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))'
            }}
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        </div>
      ))}
    </div>
  );
};

export default UserBadgeList;