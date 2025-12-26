import React from 'react';
import { ShieldCheckIcon, StarIcon, FireIcon, TrophyIcon } from '@heroicons/react/24/solid';

const BADGE_PATH = '/assets/badges';

const BADGE_IMAGES = {
  // Backend'deki 'icon' adı : 'Dosya adı'
  'server_gold': 'gold-medal.png',
  'server_bronze': 'bronze-medal.png',
  'friend_gold': 'social-star.png',
  'friend_bronze': 'friendly.png',
  'veteran_2025': '2025badge.png', // Yeni eklediğimiz
  'early_adopter': 'early-bird.png', // Yeni eklediğimiz
  'default': 'default-badge.png'
};


const UserBadgeList = ({ badges }) => {
  if (!badges || badges.length === 0) return null;

  const getBadgeImg = (iconName) => {
    const fileName = BADGE_IMAGES[iconName] || BADGE_IMAGES['default'];
    // Eğer resim yoksa fallback olarak varsayılanı gösterir
    return `${BADGE_PATH}/${fileName}`;
  };

  return (
    <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
      {badges.map((badge, index) => (
        <div
            key={index}
            className="user-badge-item"
            title={badge.description || badge.name} // Üzerine gelince açıklama yazar
            style={{
                cursor: 'help',
                transition: 'transform 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'} // Üzerine gelince büyüme efekti
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <img
            src={getBadgeImg(badge.icon)}
            alt={badge.name}
            style={{
              width: '24px',
              height: '24px',
              objectFit: 'contain',
              filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))' // Hafif gölge
            }}
            onError={(e) => {
              e.target.style.display = 'none'; // Resim yüklenemezse gizle
            }}
          />
        </div>
      ))}
    </div>
  );
};

export default UserBadgeList;