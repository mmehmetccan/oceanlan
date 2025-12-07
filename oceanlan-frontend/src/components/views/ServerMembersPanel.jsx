// src/components/views/ServerMembersPanel.jsx
import React, { useContext, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import MemberContextMenu from '../modals/MemberContextMenu';
// 👇 URL Helper
import { getImageUrl } from '../../utils/urlHelper';
import "../../styles/ServerMembersPanel.css";

const handleAvatarError = (e) => {
  if (e?.target?.dataset?.fallbackApplied === 'true') return;
  if (e?.target) {
    e.target.dataset.fallbackApplied = 'true';
    e.target.src = getImageUrl(null);
  }
};

const ServerMembersPanel = () => {
  const { activeServer } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const [contextMenu, setContextMenu] = useState(null);

  // Sadece sunucu rotalarındaysa göster
  const isOnServerRoute = location.pathname.includes('/dashboard/server/');

  const groupedMembers = useMemo(() => {
    if (!activeServer || !isOnServerRoute) return [];

    const members = activeServer.members || [];
    const roles = activeServer.roles || [];

    // Rolleri en yüksek pozisyona göre sırala
    const sortedRoles = [...roles].sort((a, b) => (b.position || 0) - (a.position || 0));

    // Grupları hazırla
    const groups = sortedRoles.map(role => ({
      roleId: role._id,
      roleName: role.name,
      color: role.color,
      members: []
    }));

    const memberSet = new Set();

    // Her kullanıcıyı en yüksek rolüne ata
    groups.forEach(group => {
      group.members = members.filter(member => {
        if (memberSet.has(member._id)) return false;

        const hasRole = member.roles.some(r => r._id === group.roleId || r === group.roleId);
        if (hasRole) {
            memberSet.add(member._id);
            return true;
        }
        return false;
      });
    });

    // Rolsüzler (veya @everyone)
    const noRoleMembers = members.filter(m => !memberSet.has(m._id));

    // Online / Offline
    const onlineNoRole = noRoleMembers.filter(m => m.user?.onlineStatus === 'online');
    const offlineNoRole = noRoleMembers.filter(m => m.user?.onlineStatus !== 'online');

    const result = [
        ...groups.filter(g => g.members.length > 0 && g.roleName !== '@everyone'),
        { roleName: 'Çevrimiçi', members: onlineNoRole },
        { roleName: 'Çevrimdışı', members: offlineNoRole }
    ];

    return result.filter(g => g.members.length > 0);

  }, [activeServer, isOnServerRoute]);

  // Eğer sunucuda değilsek hiç render etme
  if (!isOnServerRoute || !activeServer) return null;

  const handleContextMenu = (e, member) => {
    e.preventDefault();
    if (!member || !member.user) return;
    setContextMenu({ x: e.pageX, y: e.pageY, member });
  };

  return (
    <div className="members-sidebar" onClick={() => setContextMenu(null)}>
      {/* BAŞLIK KISMI */}
      <h3 className="members-title">Üyeler ({activeServer.members?.length || 0})</h3>

      <div className="members-scroll-area">
        {groupedMembers.map((group, index) => (
            <div key={group.roleName + index} className="member-group">
                <h4 className="role-header" style={{ color: group.color || '#96989d' }}>
                    {group.roleName.toUpperCase()} — {group.members.length}
                </h4>

                <div className="members-list">
                    {group.members.map((member) => {
                        const isOwner = activeServer.owner && member.user && (
                            activeServer.owner._id === member.user._id || activeServer.owner === member.user._id
                        );
                        const isOnline = member.user?.onlineStatus === 'online';

                        // Resim düzeltmesi
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
                                    {isOwner && <span className="member-badge" title="Sunucu Sahibi">👑</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        ))}
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