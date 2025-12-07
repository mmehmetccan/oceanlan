// src/components/modals/FeedContextMenu.jsx
import React, { useRef, useLayoutEffect, useState } from 'react';
// 👇 HELPER IMPORT
import { getImageUrl } from '../../utils/urlHelper';
import '../../styles/MemberContextMenu.css'; // Veya kendi CSS dosyan

const FeedContextMenu = ({ x, y, user, type, onClose, onAction }) => {
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({ top: y, left: x, opacity: 0 });

  // Ekran taşmasını önleyen akıllı konumlandırma
  useLayoutEffect(() => {
    if (menuRef.current) {
      const { offsetWidth: width, offsetHeight: height } = menuRef.current;
      let newTop = y;
      let newLeft = x;

      // Sağa taşıyorsa sola al
      if (x + width > window.innerWidth) newLeft = x - width;
      // Aşağı taşıyorsa yukarı al
      if (y + height > window.innerHeight) newTop = y - height;

      // Negatif değerleri engelle
      if (newLeft < 0) newLeft = 10;
      if (newTop < 0) newTop = 10;

      setMenuStyle({ top: newTop, left: newLeft, opacity: 1 });
    }
  }, [x, y]);

  if (!user) return null;

  // 👇 GÜVENLİ RESİM URL (Çökme sorununu çözen yer)
  const avatarSrc = getImageUrl(user.avatarUrl || user.avatar);

  const handleAvatarError = (e) => {
    if (e.target.dataset.fallbackApplied) return;
    e.target.dataset.fallbackApplied = 'true';
    e.target.src = getImageUrl(null);
  };

  return (
    <div className="member-menu-overlay" onClick={onClose}>
      <div
        ref={menuRef}
        className="member-menu-panel"
        style={{ top: menuStyle.top, left: menuStyle.left, opacity: menuStyle.opacity }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Üst Bilgi Kısmı */}
        <div className="member-menu-header">
          <div className="member-menu-avatar">
            <img
                src={avatarSrc}
                alt={user.username}
                onError={handleAvatarError}
                style={{width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover'}}
            />
          </div>
          <div className="member-menu-info">
            <div className="member-menu-name">{user.username}</div>
            <div className="member-menu-sub" style={{textTransform:'capitalize'}}>
                {type === 'friend' ? 'Arkadaş' : 'Kullanıcı'}
            </div>
          </div>
        </div>

        {/* Aksiyon Butonları */}
        <div className="member-menu-actions">
          <button className="member-menu-btn" onClick={() => onAction('profile', user)}>
            Profili Görüntüle
          </button>

          <button className="member-menu-btn" onClick={() => onAction('message', user)}>
            Mesaj Gönder
          </button>

          <hr className="menu-divider" />

          {type === 'friend' && (
            <button className="member-menu-btn danger" onClick={() => onAction('remove', user)}>
              Arkadaşlıktan Çıkar
            </button>
          )}

          {type === 'pending_incoming' && (
            <>
                <button className="member-menu-btn success" onClick={() => onAction('accept', user)}>
                Kabul Et
                </button>
                <button className="member-menu-btn danger" onClick={() => onAction('reject', user)}>
                Reddet
                </button>
            </>
          )}

          {type === 'pending_outgoing' && (
            <button className="member-menu-btn danger" onClick={() => onAction('cancel', user)}>
              İsteği İptal Et
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FeedContextMenu;