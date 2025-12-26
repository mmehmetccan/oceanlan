// src/components/gamification/LevelUpModal.jsx
import React, { useEffect, useState } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { XMarkIcon, StarIcon, FireIcon } from '@heroicons/react/24/solid';
import '../../styles/ModalStyles.css'; // Mevcut stil dosyan

const LevelUpModal = () => {
  const { socket } = useSocket();
  const [notification, setNotification] = useState(null); // { type: 'badge' | 'level', data: ... }

  useEffect(() => {
    if (!socket) return;

    // 🏆 Backend'den gelen 'badge-earned' sinyalini dinle
    const handleBadgeEarned = (badge) => {
      console.log("Yeni Rozet Geldi!", badge);
      // Sesi çal (Opsiyonel)
      // const audio = new Audio('/assets/sounds/notification.mp3'); audio.play().catch(e=>{});
      setNotification({ type: 'badge', data: badge });
    };

    // 📈 Backend'den gelen 'level-up' sinyalini dinle
    const handleLevelUp = ({ level, xp }) => {
      console.log("Level Atlandı!", level);
      setNotification({ type: 'level', data: { level, xp } });
    };

    socket.on('badge-earned', handleBadgeEarned);
    socket.on('level-up', handleLevelUp);

    return () => {
      socket.off('badge-earned', handleBadgeEarned);
      socket.off('level-up', handleLevelUp);
    };
  }, [socket]);

  const handleClose = () => setNotification(null);

  if (!notification) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.8)' }}>
      <div className="modal-content" style={{ textAlign: 'center', maxWidth: '400px', background: 'linear-gradient(135deg, #202225 0%, #2f3136 100%)', border: '2px solid #ffd700', borderRadius: '15px', padding: '30px' }}>

        <button onClick={handleClose} style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <XMarkIcon width={24} />
        </button>

        {notification.type === 'badge' && (
          <div className="animate-bounce-in">
            <div style={{ fontSize: '60px', marginBottom: '15px', filter: 'drop-shadow(0 0 10px gold)' }}>🏆</div>
            <h2 style={{ color: '#ffd700', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>TEBRİKLER!</h2>
            <p style={{ color: '#fff', fontSize: '18px', margin: 0 }}>Yeni Bir Rozet Kazandın</p>

            <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px' }}>
                <h3 style={{ color: '#00b0f4', margin: '0 0 5px 0' }}>{notification.data.name}</h3>
                <p style={{ color: '#b9bbbe', fontSize: '14px', margin: 0 }}>{notification.data.description}</p>
                {notification.data.xp > 0 && <div style={{ marginTop: '10px', color: '#43b581', fontWeight: 'bold' }}>+{notification.data.xp} XP</div>}
            </div>
          </div>
        )}

        {notification.type === 'level' && (
          <div className="animate-bounce-in">
            <div style={{ fontSize: '60px', marginBottom: '15px', filter: 'drop-shadow(0 0 10px #00b0f4)' }}>🚀</div>
            <h2 style={{ color: '#00b0f4', margin: '0 0 10px 0', textTransform: 'uppercase' }}>SEVİYE ATLADIN!</h2>
            <p style={{ color: '#fff', fontSize: '18px' }}>Artık <strong>Level {notification.data.level}</strong> oldun!</p>
          </div>
        )}

        <button onClick={handleClose} className="copy-btn" style={{ width: '100%', marginTop: '25px', background: '#5865F2', padding: '12px', fontSize: '16px' }}>Harika!</button>
      </div>
    </div>
  );
};

export default LevelUpModal;