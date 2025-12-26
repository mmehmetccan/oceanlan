import React, { useEffect, useState } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { XMarkIcon } from '@heroicons/react/24/solid';
import Confetti from 'react-confetti'; // 🎉 EKLENDİ
import '../../styles/ModalStyles.css';

// 🖼️ ROZET RESİMLERİNİ BURAYA TANIMLIYORUZ
const BADGE_IMAGES = {
  EARLY_ADOPTER: '/assets/badges/earlymember.png', // Senin yüklediğin altın rozet
  VETERAN_2025: '/assets/badges/2025badge.png',   // Diğer rozet
};

const LevelUpModal = () => {
  const { socket } = useSocket();
  const [notification, setNotification] = useState(null);
  // Ekran boyutunu al (Konfeti için)
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    if (!socket) return;

    const handleBadgeEarned = (badge) => {
      setNotification({ type: 'badge', data: badge });
    };

    const handleLevelUp = ({ level, xp }) => {
      setNotification({ type: 'level', data: { level, xp } });
    };

    // ✅ DÜZELTME: Resize fonksiyonunu isimlendirip değişkene atıyoruz
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    socket.on('badge-earned', handleBadgeEarned);
    socket.on('level-up', handleLevelUp);

    // ✅ DÜZELTME: İsimli fonksiyonu ekliyoruz
    window.addEventListener('resize', handleResize);

    return () => {
      socket.off('badge-earned', handleBadgeEarned);
      socket.off('level-up', handleLevelUp);

      // ✅ DÜZELTME: Aynı isimli fonksiyonu kaldırıyoruz (2 argümanlı)
      window.removeEventListener('resize', handleResize);
    };
  }, [socket]);
  const handleClose = () => setNotification(null);

  if (!notification) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.9)' }}>
      {/* 🎉 KONFETİ EFEKTİ */}
      <Confetti width={windowSize.width} height={windowSize.height} recycle={false} numberOfPieces={300} />

      <div className="modal-content animate-bounce-in" style={{
        textAlign: 'center',
        maxWidth: '400px',
        background: 'linear-gradient(135deg, #202225 0%, #0f1012 100%)',
        border: '1px solid #ffd700',
        borderRadius: '20px',
        padding: '40px',
        boxShadow: '0 0 50px rgba(255, 215, 0, 0.3)'
      }}>

        <button onClick={handleClose} style={{ position: 'absolute', top: 15, right: 15, background: 'none', border: 'none', color: '#777', cursor: 'pointer' }}>
          <XMarkIcon width={24} />
        </button>

        {notification.type === 'badge' && (
          <div>
            {/* 🖼️ LOGO GÖSTERİMİ */}
            <div style={{ marginBottom: '20px', position: 'relative', display: 'inline-block' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'gold', filter: 'blur(20px)', opacity: 0.4, borderRadius: '50%' }}></div>
              <img
                src={BADGE_IMAGES[notification.data.icon] || '/assets/badges/default.png'}
                alt="Badge"
                style={{ width: '120px', height: '120px', objectFit: 'contain', position: 'relative', zIndex: 1 }}
              />
            </div>

            <h2 style={{ color: '#ffd700', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '2px', fontSize: '24px' }}>TEBRİKLER!</h2>
            <p style={{ color: '#fff', fontSize: '16px', margin: 0, opacity: 0.8 }}>Yeni Bir Rozet Kazandın</p>

            <div style={{ marginTop: '25px', padding: '20px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '15px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ color: '#fff', margin: '0 0 5px 0', fontSize: '18px' }}>{notification.data.name}</h3>
              <p style={{ color: '#b9bbbe', fontSize: '14px', margin: 0 }}>{notification.data.description}</p>
              {notification.data.xp > 0 && (
                <div style={{ marginTop: '10px', display: 'inline-block', background: 'rgba(67, 181, 129, 0.2)', color: '#43b581', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
                  +{notification.data.xp} XP
                </div>
              )}
            </div>
          </div>
        )}

        {notification.type === 'level' && (
          <div>
            <div style={{ fontSize: '80px', marginBottom: '10px' }}>🚀</div>
            <h2 style={{ color: '#00b0f4', margin: '0 0 10px 0', textTransform: 'uppercase' }}>SEVİYE ATLADIN!</h2>
            <p style={{ color: '#fff', fontSize: '18px' }}>Tebrikler, artık <strong>Level {notification.data.level}</strong> oldun!</p>
          </div>
        )}

        <button onClick={handleClose} style={{
          width: '100%', marginTop: '30px',
          background: 'linear-gradient(90deg, #5865F2, #4752C4)',
          color: 'white', border: 'none', borderRadius: '10px',
          padding: '14px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(88, 101, 242, 0.4)'
        }}>
          Harika!
        </button>
      </div>
    </div>
  );
};

export default LevelUpModal;