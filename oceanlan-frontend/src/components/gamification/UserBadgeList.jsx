// src/components/gamification/UserBadgeList.jsx
import React, { useState } from 'react';
import { XMarkIcon, CheckBadgeIcon } from '@heroicons/react/24/solid';

// 🟢 KLASÖR YOLU
const BADGE_PATH = '/assets/badges';

// 🟢 1. ADIM: Export eklendi ve bileşen dışına taşındı
export const BADGE_IMAGES = {
  'veteran_2025': '2025badge.png',
  'early_adopter': 'earlymember.png',
  'default': 'default-badge.png'
};

// 🟢 2. ADIM: Helper fonksiyon dışarı taşındı ve export edildi
export const getBadgeImg = (iconName) => {
  // Eğer backend'den gelen isim listede varsa onu kullan, yoksa default'u kullan
  const fileName = BADGE_IMAGES[iconName] || BADGE_IMAGES['default'];
  return `${BADGE_PATH}/${fileName}`;
};

const UserBadgeList = ({ badges, onEquip }) => {
  const [selectedBadge, setSelectedBadge] = useState(null);

  if (!badges || badges.length === 0) return null;

  // getBadgeImg artık dışarıda olduğu için burada tekrar tanımlamaya gerek yok.
  // Doğrudan kullanabiliriz.

  return (
    <>
      {/* --- KÜÇÜK LİSTE GÖRÜNÜMÜ --- */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
        {badges.map((badge, index) => (
          <div
            key={index}
            className="user-badge-item"
            onClick={() => setSelectedBadge(badge)}
            title={badge.name}
            style={{
                cursor: 'pointer',
                transition: 'transform 0.2s',
                padding: '4px',
                borderRadius: '6px',
                backgroundColor: 'rgba(0,0,0,0.2)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {/* Dışarıdaki getBadgeImg fonksiyonunu kullanıyoruz */}
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

      {/* --- BÜYÜTME MODALI (ZOOM) --- */}
      {selectedBadge && (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 10000,
                backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'fadeIn 0.2s ease-in-out'
            }}
            onClick={() => setSelectedBadge(null)}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'linear-gradient(135deg, #2f3136 0%, #202225 100%)',
                    borderRadius: '16px',
                    padding: '30px',
                    maxWidth: '320px',
                    width: '90%',
                    textAlign: 'center',
                    position: 'relative',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                }}
            >
                <button
                    onClick={() => setSelectedBadge(null)}
                    style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}
                >
                    <XMarkIcon width={24} />
                </button>

                <div style={{ width: '140px', height: '140px', margin: '0 auto 20px', position: 'relative' }}>
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'radial-gradient(circle, rgba(255,215,0,0.3) 0%, rgba(0,0,0,0) 70%)',
                        borderRadius: '50%'
                    }}></div>

                    <img
                        src={getBadgeImg(selectedBadge.icon)}
                        alt={selectedBadge.name}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'relative', zIndex: 1 }}
                    />
                </div>

                <h2 style={{ color: 'white', fontSize: '20px', fontWeight: 'bold', margin: '0 0 8px' }}>
                    {selectedBadge.name}
                </h2>

                <p style={{ color: '#b9bbbe', fontSize: '14px', lineHeight: '1.5', margin: 0 }}>
                    {selectedBadge.description}
                </p>

                <div style={{ marginTop: '20px', fontSize: '12px', color: '#72767d', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
                   Kazanılma: {new Date(selectedBadge.earnedAt).toLocaleDateString('tr-TR')}
                   {selectedBadge.xpReward && <span style={{ marginLeft: '10px', color: '#43b581' }}>+{selectedBadge.xpReward} XP</span>}
                </div>

                {onEquip && (
                    <button
                        onClick={() => {
                            onEquip(selectedBadge);
                            setSelectedBadge(null);
                        }}
                        style={{
                            marginTop: '15px',
                            background: 'linear-gradient(90deg, #5865F2, #4752C4)',
                            color: 'white', border: 'none', borderRadius: '8px',
                            padding: '10px 20px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%'
                        }}
                    >
                         {/* Eğer CheckBadgeIcon import edilmediyse hata vermemesi için kontrol et veya importuna ekle */}
                         <CheckBadgeIcon width={18} />
                        Profilde Göster
                    </button>
                )}

            </div>
        </div>
      )}
    </>
  );
};

export default UserBadgeList;