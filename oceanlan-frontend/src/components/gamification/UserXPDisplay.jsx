import React, { useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import '../../styles/UserXPDisplay.css'; // Birazdan oluşturacağız

// Rozet İkonları (Heroicons veya Resim)
import { ShieldCheckIcon, StarIcon, FireIcon } from '@heroicons/react/24/solid';

const UserXPDisplay = () => {
  const { user } = useContext(AuthContext);

  if (!user) return null;

  // XP Hesabı (Basit Matematik)
  // Backend formülü: Level = 0.1 * sqrt(XP) + 1
  // Ters işlem (XP): ((Level - 1) / 0.1)^2
  const currentLevel = user.level || 1;
  const currentXP = user.xp || 0;

  const xpForCurrentLevel = Math.pow((currentLevel - 1) / 0.1, 2);
  const xpForNextLevel = Math.pow((currentLevel) / 0.1, 2);

  const progress = ((currentXP - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100;
  const safeProgress = Math.min(Math.max(progress, 0), 100); // 0-100 arası tut

  // İkon Eşleştirme (Backend'deki 'icon' adına göre)
  const getBadgeIcon = (iconName) => {
      switch(iconName) {
          case 'server_gold': return <FireIcon className="badge-icon gold" />;
          case 'server_bronze': return <FireIcon className="badge-icon bronze" />;
          case 'friend_gold': return <StarIcon className="badge-icon gold" />;
          case 'friend_bronze': return <StarIcon className="badge-icon bronze" />;
          default: return <ShieldCheckIcon className="badge-icon default" />;
      }
  };

  return (
    <div className="user-gamification-container">

      {/* 1. Rozetler Satırı (Varsa Göster) */}
      {user.badges && user.badges.length > 0 && (
          <div className="badges-row">
              {user.badges.map((badge, index) => (
                  <div key={index} className="badge-item" title={badge.name}>
                      {getBadgeIcon(badge.icon)}
                  </div>
              ))}
          </div>
      )}

      {/* 2. Level ve XP Bar */}
      <div className="xp-info-row">
          <div className="level-badge">
              <span>Lvl {currentLevel}</span>
          </div>

          <div className="xp-bar-container" title={`${Math.floor(currentXP)} / ${Math.floor(xpForNextLevel)} XP`}>
              <div className="xp-bar-fill" style={{ width: `${safeProgress}%` }}></div>
          </div>
      </div>
    </div>
  );
};

export default UserXPDisplay;