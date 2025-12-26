import React from 'react';
import { ShieldCheckIcon, StarIcon, FireIcon, TrophyIcon } from '@heroicons/react/24/solid';

const UserBadgeList = ({ badges }) => {
  if (!badges || badges.length === 0) return null;

  const getBadgeIcon = (iconName) => {
    const style = { width: 20, height: 20 };
    switch (iconName) {
      case 'server_gold': return <FireIcon style={{ ...style, color: '#FFD700' }} />;
      case 'server_bronze': return <FireIcon style={{ ...style, color: '#CD7F32' }} />;
      case 'friend_gold': return <StarIcon style={{ ...style, color: '#FFD700' }} />;
      case 'friend_bronze': return <StarIcon style={{ ...style, color: '#CD7F32' }} />;
      default: return <TrophyIcon style={{ ...style, color: '#5865F2' }} />;
    }
  };

  return (
    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
      {badges.map((badge, index) => (
        <div
            key={index}
            title={badge.name}
            style={{
                background: 'rgba(0, 0, 0, 0.2)',
                padding: '4px',
                borderRadius: '6px',
                cursor: 'help'
            }}
        >
          {getBadgeIcon(badge.icon)}
        </div>
      ))}
    </div>
  );
};

export default UserBadgeList;