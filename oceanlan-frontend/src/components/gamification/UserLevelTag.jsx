// src/components/gamification/UserLevelTag.jsx
import React from 'react';
import { getBadgeImg } from './UserBadgeList';
import { getImageUrl } from '../../utils/urlHelper';

// 🟢 LEVEL RENKLERİNİ BELİRLEYEN FONKSİYON
const getLevelStyle = (level) => {
  if (level >= 50) return 'linear-gradient(135deg, #ED4245, #8a0e0e)'; // 🔴 50+ : Kırmızı (Efsanevi)
  if (level >= 40) return 'linear-gradient(135deg, #EB459E, #781046)'; // 🟣 40-49: Pembe/Magenta
  if (level >= 25) return 'linear-gradient(135deg, #9C27B0, #53125e)'; // 🟣 30-39: Mor
  if (level >= 10) return 'linear-gradient(135deg, #FEE75C, #b38f00)'; // 🟡 20-29: Altın
  if (level >= 5) return 'linear-gradient(135deg, #57F287, #248046)'; // 🟢 10-19: Yeşil
  return 'linear-gradient(135deg, #5865F2, #4752C4)';                 // 🔵 1-9  : Mavi (Varsayılan)
};

const UserLevelTag = ({ level, activeBadge }) => {
  const hasLevel = level && level > 0;
  // Rozet ikonunu belirle (icon veya iconUrl olabilir)
  const badgeIcon = activeBadge ? (activeBadge.icon || activeBadge.iconUrl) : null;
  const hasBadge = !!badgeIcon;

  if (!hasLevel && !hasBadge) return null;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', marginLeft: '6px' }}>

      {/* 1. LEVEL KISMI */}
      {hasLevel && (
        <span style={{
          fontSize: '11px', // Biraz daha okunaklı olsun
          fontWeight: '800',
          // 🟢 BURASI DEĞİŞTİ: Dinamik arka plan rengi
          background: getLevelStyle(level),
          color: '#fff',
          padding: '2px 6px',
          borderRadius: '4px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)', // Hafif gölge ekledik
          textShadow: '0 1px 2px rgba(0,0,0,0.3)', // Yazı daha net okunsun
          userSelect: 'none',
          cursor: 'default',
          border: '1px solid rgba(255,255,255,0.1)' // İnce bir çerçeve
        }}>
          Lv{level}
        </span>
      )}

      {/* 2. ROZET KISMI */}
      {hasBadge && (
        <div
          title={activeBadge.name}
          className="animate-bounce-in"
          style={{
            // Rozetler büyük kalsın (24px idealdir)
            width: '24px',
            height: '24px',
            marginLeft: '5px',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <img
            src={getImageUrl(getBadgeImg(badgeIcon) || badgeIcon)}
            alt="Badge"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' // Rozete de gölge
            }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </div>
      )}
    </div>
  );
};

export default UserLevelTag;