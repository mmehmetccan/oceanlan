// src/components/views/ServerMembersPanel.jsx
import React, { useContext, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import MemberContextMenu from '../modals/MemberContextMenu';
// 👇 URL Helper eklendi (Kırık resim sorunu için)
import { getImageUrl } from '../../utils/urlHelper';
import "../../styles/ServerMembersPanel.css";

const handleAvatarError = (e) => {
  if (e?.target?.dataset?.fallbackApplied === 'true') return;
  if (e?.target) {
    e.target.dataset.fallbackApplied = 'true';
    // Helper'dan default resmi al
    e.target.src = getImageUrl(null);
  }
};

const ServerMembersPanel = () => {
  const { activeServer } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const [contextMenu, setContextMenu] = useState(null);

  const isOnServerRoute = location.pathname.includes('/dashboard/server/');

  // 1. ÜYELERİ ROLLERE GÖRE GRUPLA
  const groupedMembers = useMemo(() => {
    if (!activeServer || !isOnServerRoute) return [];

    const members = activeServer.members || [];
    const roles = activeServer.roles || [];

    // Rolleri pozisyona göre sırala (Yüksek yetki en üstte)
    // Eğer position yoksa varsayılan sırayı kullan
    const sortedRoles = [...roles].sort((a, b) => (b.position || 0) - (a.position || 0));

    // Her rol için bir grup oluştur
    const groups = sortedRoles.map(role => ({
      roleId: role._id,
      roleName: role.name,
      color: role.color,
      members: []
    }));

    // "Çevrimiçi" ve "Çevrimdışı" (Rolü olmayanlar veya @everyone) için varsayılan gruplar
    // İstersen sadece "Online" ve "Offline" diye de ayırabilirsin.
    // Biz Discord gibi en yüksek role göre atama yapacağız.

    const memberSet = new Set(); // Bir üyeyi birden fazla gruba koymamak için

    groups.forEach(group => {
      // Bu role sahip üyeleri bul
      group.members = members.filter(member => {
        if (memberSet.has(member._id)) return false; // Zaten bir gruba eklendiyse geç

        // Üyenin bu rolü var mı?
        const hasRole = member.roles.some(r => r._id === group.roleId || r === group.roleId);

        if (hasRole) {
            memberSet.add(member._id);
            return true;
        }
        return false;
      });
    });

    // Hiçbir özel rolü olmayanlar (veya sadece @everyone olanlar)
    const noRoleMembers = members.filter(m => !memberSet.has(m._id));

    // Online / Offline diye ayırabiliriz
    const onlineNoRole = noRoleMembers.filter(m => m.user?.onlineStatus === 'online');
    const offlineNoRole = noRoleMembers.filter(m => m.user?.onlineStatus !== 'online');

    // Grupları birleştir (Boş grupları filtrele)
    const result = [
        ...groups.filter(g => g.members.length > 0 && g.roleName !== '@everyone'),
        { roleName: 'Çevrimiçi', members: onlineNoRole },
        { roleName: 'Çevrimdışı', members: offlineNoRole }
    ];

    return result.filter(g => g.members.length > 0);

  }, [activeServer, isOnServerRoute]);

  if (!isOnServerRoute || !activeServer) return null;

  const handleContextMenu = (e, member) => {
    e.preventDefault();
    if (!member || !member.user || member.user._id === user.id) return;
    setContextMenu({ x: e.pageX, y: e.pageY, member });
  };

  return (
    <div className="members-sidebar" onClick={() => setContextMenu(null)}>

      {groupedMembers.map((group, index) => (
        <div key={group.roleName + index} className="member-group">
            <h3 className="role-header" style={{ color: group.color || '#96989d' }}>
                {group.roleName.toUpperCase()} — {group.members.length}
            </h3>

            <div className="members-list">
                {group.members.map((member) => {
                    const isOwner = activeServer.owner && member.user && activeServer.owner._id === member.user._id;
                    const isOnline = member.user?.onlineStatus === 'online';

                    // 👇 RESİM URL DÜZELTME
                    const avatarSrc = getImageUrl(member.user?.avatarUrl || member.user?.avatar);

                    return (
                        <div
                            key={member._id}
                            className={`member-item ${!isOnline ? 'offline' : ''}`}
                            onContextMenu={(e) => handleContextMenu(e, member)}
                        >
                            <div className="member-avatar-container">
                                <div className="member-avatar">
                                    <img
                                        src={avatarSrc}
                                        alt={member.user?.username}
                                        onError={handleAvatarError}
                                    />
                                </div>
                                <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`} />
                            </div>

                            <div className="member-info">
                                <span
                                    className="member-name"
                                    style={{ color: isOnline ? '#fff' : '#8e9297' }}
                                >
                                    {member.user?.username || 'Bilinmeyen'}
                                </span>
                                {isOwner && <span className="member-badge">👑</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
      ))}

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