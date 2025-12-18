// src/components/modals/ServerContextMenu.jsx
import React, { useEffect, useRef } from 'react';
import {
  ArrowRightOnRectangleIcon, // Ayrılma ikonu
  TrashIcon,                 // Silme ikonu (Sahibi ise)
  Cog6ToothIcon              // Ayarlar ikonu
} from '@heroicons/react/24/outline';

const ServerContextMenu = ({ x, y, server, user, onClose, onLeave, onDelete, onSettings }) => {
  const menuRef = useRef(null);

  // Menü dışına tıklanınca kapat
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  if (!server || !user) return null;

  // 🟢 KONTROL: Kullanıcı bu sunucunun sahibi mi?
  // Sunucu objesindeki owner alanı bazen obje bazen string (ID) gelebilir, ikisini de kontrol ediyoruz.
  const ownerId = server.owner?._id || server.owner;
  const currentUserId = user.id || user._id;
  const isOwner = String(ownerId) === String(currentUserId);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ top: y, left: x }}
    >
      {/* Sadece Sunucu Sahibi Ayarları Görebilir */}
      {isOwner && (
        <>
            <div className="context-menu-item" onClick={() => { onSettings(server); onClose(); }}>
                <Cog6ToothIcon className="icon" /> Sunucu Ayarları
            </div>
            <div className="context-menu-item danger" onClick={() => { onDelete(server); onClose(); }}>
                <TrashIcon className="icon" /> Sunucuyu Sil
            </div>
        </>
      )}

      {/* 🟢 Sahibi DEĞİLSE 'Ayrıl' butonu çıkar */}
      {!isOwner && (
        <div className="context-menu-item danger" onClick={() => { onLeave(server._id); onClose(); }}>
          <ArrowRightOnRectangleIcon className="icon" /> Sunucudan Ayrıl
        </div>
      )}
    </div>
  );
};

export default ServerContextMenu;