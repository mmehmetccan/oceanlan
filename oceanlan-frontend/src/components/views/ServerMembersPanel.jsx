// src/components/views/ServerMembersPanel.jsx
import React, { useContext, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import MemberContextMenu from '../modals/MemberContextMenu';
import "../../styles/ServerMembersPanel.css";

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Helper: Tarih formatlama
const formatLastSeen = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('tr-TR', {
        day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const DEFAULT_AVATAR = '/default-avatar.png';

const getAvatarUrl = (member) =>
  member?.user?.avatarUrl || member?.user?.avatar || DEFAULT_AVATAR;

const handleAvatarError = (e) => {
  if (e?.target?.dataset?.fallbackApplied === 'true') return;
  if (e?.target) {
    e.target.dataset.fallbackApplied = 'true';
    e.target.src = DEFAULT_AVATAR;
  }
};

const getTopRolePosition = (member, server) => {
  // ... (Bu fonksiyon aynı kalsın) ...
  const roles = server.roles || [];
  if (!member.roles || member.roles.length === 0) return 0;
  const roleMap = roles.reduce((acc, role) => {
    acc[role._id] = role;
    return acc;
  }, {});
  let maxPos = 0;
  member.roles.forEach((roleId) => {
    const role = roleMap[roleId];
    if (role && typeof role.position === 'number') {
      if (role.position > maxPos) maxPos = role.position;
    }
  });
  return maxPos;
};

const ServerMembersPanel = () => {
  const { activeServer } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const [contextMenu, setContextMenu] = useState(null);

  const isOnServerRoute = location.pathname.includes('/dashboard/server/');

  // Sıralama Logic'i (Aynı kalsın)
  const sortedMembers = useMemo(() => {
    if (!activeServer || !isOnServerRoute) return [];
    const members = activeServer.members || [];
    return [...members].sort((a, b) => {
      // Önce Online olanları yukarı alalım mı? İstersen bu satırı aç:
      // if (a.user.onlineStatus === 'online' && b.user.onlineStatus !== 'online') return -1;
      // if (b.user.onlineStatus === 'online' && a.user.onlineStatus !== 'online') return 1;

      const posA = getTopRolePosition(a, activeServer);
      const posB = getTopRolePosition(b, activeServer);
      if (posA !== posB) return posB - posA;
      const nameA = a.user?.username?.toLowerCase() || '';
      const nameB = b.user?.username?.toLowerCase() || '';
      return nameA.localeCompare(nameB);
    });
  }, [activeServer, isOnServerRoute]);

  if (!isOnServerRoute || !activeServer) return null;

  const handleContextMenu = (e, member) => {
    e.preventDefault();
    if (!member || !member.user || member.user._id === user.id) return;
    setContextMenu({ x: e.pageX, y: e.pageY, member });
  };

  return (
    <div className="members-sidebar" onClick={() => setContextMenu(null)}>
      <h3>Üyeler ({activeServer.members?.length || 0})</h3>

      <div className="members-list">
        {sortedMembers.map((member) => {
          const isOwner = activeServer.owner && member.user && activeServer.owner._id === member.user._id;

          const avatarSrc = getAvatarUrl(member);
          const absoluteAvatarSrc = avatarSrc.startsWith('/uploads')
              ? `${API_URL_BASE}${avatarSrc}`
              : avatarSrc;

          // 📢 YENİ: Durum bilgileri
          const isOnline = member.user?.onlineStatus === 'online';
          const lastSeenText = isOnline ? 'Çevrimiçi' : `Son görülme: ${formatLastSeen(member.user?.lastSeenAt)}`;

          return (
              <div
                  key={member._id}
                  className="member-item"
                  onContextMenu={(e) => handleContextMenu(e, member)}
                  title={lastSeenText} // Mouse üzerine gelince tarih yazar
              >
                <div className="member-avatar-container"> {/* Container ekledik */}
                  <div className="member-avatar">
                    <img
                        src={absoluteAvatarSrc}
                        alt={`${member.user?.username} avatarı`}
                        onError={handleAvatarError}
                    />
                  </div>
                  {/* 📢 DURUM NOKTASI */}
                  <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`} />
                </div>

                <div className="member-info">
                  <span className={`member-name ${member.isMuted ? 'text-muted' : ''}`} style={{ opacity: isOnline ? 1 : 0.7 }}>
                    {member.user?.username || 'Bilinmeyen'}
                  </span>
                  {/* 📢 Sahip değilse ve offline ise tarihi küçük yaz (Opsiyonel) */}
                  {/* {!isOnline && <span className="member-sub-status">{formatLastSeen(member.user?.lastSeenAt)}</span>} */}

                  {isOwner && <span className="member-badge">Kurucu</span>}
                </div>
              </div>
          );
        })}
      </div>

      {contextMenu && (
          <MemberContextMenu
              member={contextMenu.member}
              x={contextMenu.x}
              y={contextMenu.y}
              serverId={activeServer._id}
              onClose={() => setContextMenu(null)}
          />
      )}
    </div>
  );
};

export default ServerMembersPanel;