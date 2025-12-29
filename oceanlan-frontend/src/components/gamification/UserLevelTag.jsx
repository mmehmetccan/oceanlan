// src/components/gamification/UserLevelTag.jsx
import React from 'react';
import { getBadgeImg } from './UserBadgeList';
// 🟢 YENİ: URL Helper'ı import et (utils klasörünün yerini kontrol et)
import { getImageUrl } from '../../utils/urlHelper';

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
          fontSize: '13px',
          fontWeight: 'bold',
          background: 'linear-gradient(45deg, #5865F2, #4752C4)', // Discord mavisi
          color: '#fff',
          padding: '1px 5px',
          borderRadius: '4px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
          userSelect: 'none',
          cursor: 'default'
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
            width: '28px',
            height: '28px',
            marginLeft: '4px',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <img
            // 🟢 DÜZELTME BURADA:
            // 1. getBadgeImg ile ikon yolunu alıyoruz.
            // 2. getImageUrl ile başına sunucu adresini (http://localhost:3000) ekliyoruz.
            // Böylece Electron 'file://' yerine doğru adrese gidiyor.
            src={getImageUrl(getBadgeImg(badgeIcon) || badgeIcon)}
            alt="Badge"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))'
            }}
            // Resim yüklenemezse (404 vs) gizle ki çirkin durmasın
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </div>
      )}
    </div>
  );
};

export default UserLevelTag;