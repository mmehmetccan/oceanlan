// src/components/gamification/UserXPDisplay.jsx
import React, { useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
// 🟢 YENİ: Resim sistemini kullanmak için UserBadgeList'i çağırıyoruz
import UserBadgeList from './UserBadgeList';
import '../../styles/UserXPDisplay.css';

const UserXPDisplay = () => {
  const { user } = useContext(AuthContext);

  if (!user) return null;

  // XP ve Level Hesabı
  const currentLevel = user.level || 1;
  const currentXP = user.xp || 0;

  const xpForCurrentLevel = Math.pow((currentLevel - 1) / 0.1, 2);
  const xpForNextLevel = Math.pow((currentLevel) / 0.1, 2);

  const progressRaw = ((currentXP - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100;
  const safeProgress = Math.min(Math.max(progressRaw, 0), 100);

  return (
    <div className="user-gamification-container">

      {/* 1. Rozetler Satırı (Artık UserBadgeList kullanıyor - Resimler görünür) */}
      {user.badges && user.badges.length > 0 && (
          <div className="badges-row" style={{ marginBottom: '5px' }}>
              <UserBadgeList badges={user.badges} />
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