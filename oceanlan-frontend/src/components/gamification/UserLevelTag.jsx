// src/components/gamification/UserLevelTag.jsx
import React from 'react';
// 🟢 Rozet resimlerini çekmek için yardımcı fonksiyonu çağırıyoruz
// (UserBadgeList ile aynı klasörde olduğunu varsayıyorum)
import { getBadgeImg } from './UserBadgeList';

const UserLevelTag = ({ level, activeBadge }) => {
  // Gösterilecek bir şey yoksa hiç render etme
  const hasLevel = level && level > 0;
  const hasBadge = activeBadge && activeBadge.icon;

  if (!hasLevel && !hasBadge) return null;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', marginLeft: '6px' }}>

      {/* 1. LEVEL KISMI */}
      {hasLevel && (
        <span style={{
          fontSize: '10px',
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

      {/* 2. ROZET KISMI (Level'in hemen sağına eklenir) */}
      {hasBadge && (
        <div
          title={activeBadge.name}
          className="animate-bounce-in" // Varsa animasyon class'ın
          style={{
            width: '18px',
            height: '18px',
            marginLeft: '4px', // Level ile rozet arası boşluk
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <img
            src={getBadgeImg(activeBadge.icon)}
            alt="Badge"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))'
            }}
          />
        </div>
      )}
    </div>
  );
};

export default UserLevelTag;