// src/components/modals/FeedContextMenu.jsx
import React, { useRef, useState, useLayoutEffect } from 'react';
import '../../styles/MemberContextMenu.css';

const FeedContextMenu = ({ x, y, user, relationshipType, onClose, onAction }) => {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: y, left: x, opacity: 0 });

  useLayoutEffect(() => {
      if (menuRef.current) {
          const rect = menuRef.current.getBoundingClientRect();
          const { innerWidth, innerHeight } = window;

          let newTop = y;
          let newLeft = x;

          if (x + rect.width > innerWidth) {
              newLeft = x - rect.width;
          }
          if (y + rect.height > innerHeight) {
              newTop = y - rect.height;
          }

          setPosition({ top: newTop, left: newLeft, opacity: 1 });
      }
  }, [x, y]);

  if (!user) return null;

  const handleOpenProfile = () => {
      onAction('profile', user);
  };

  return (
    <>
      <div className="member-menu-overlay" onClick={onClose} />
      <div
        ref={menuRef}
        className="member-menu-panel"
        style={{
            top: position.top,
            left: position.left,
            opacity: position.opacity,
            position: 'fixed',
            zIndex: 1000
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="member-menu-header">
          <div
            className="member-menu-avatar"
            onClick={handleOpenProfile}
            style={{ cursor: 'pointer' }}
          >
            <img
              src={user.avatarUrl}
              alt={user.username}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
            />
          </div>
          <div className="member-menu-info">
            <div
                className="member-menu-name clickable"
                onClick={handleOpenProfile}
                style={{ cursor: 'pointer', fontWeight: 'bold' }}
                title="Profili Görüntüle"
            >
                {user.username}
            </div>
            <div className="member-menu-sub">
                {relationshipType === 'friend' ? 'Arkadaş' : 'Kullanıcı'}
            </div>
          </div>
        </div>

        <div className="member-menu-actions">
          {relationshipType === 'friend' && (
            <button className="member-menu-btn" onClick={() => onAction('message', user)}>
              Mesaj Gönder
            </button>
          )}

          {(relationshipType === 'friend' || relationshipType.startsWith('pending')) && (
             <hr className="menu-divider" />
          )}

          {relationshipType === 'friend' && (
            <button className="member-menu-btn danger" onClick={() => onAction('remove', user)}>
              Arkadaşlıktan Çıkar
            </button>
          )}

          {relationshipType === 'pending_outgoing' && (
            <button className="member-menu-btn danger" onClick={() => onAction('cancel', user)}>
              İsteği İptal Et
            </button>
          )}

          {relationshipType === 'pending_incoming' && (
            <>
                <button className="member-menu-btn" style={{color:'#3ba55c'}} onClick={() => onAction('accept', user)}>
                Kabul Et
                </button>
                <button className="member-menu-btn danger" onClick={() => onAction('reject', user)}>
                Reddet
                </button>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default FeedContextMenu;