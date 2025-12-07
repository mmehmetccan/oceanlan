// src/components/views/ServerMembersPanel.jsx
import React, { useContext, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import MemberContextMenu from '../modals/MemberContextMenu';
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

  const isOnServerRoute = location.pathname.includes('/dashboard/server/');

  const groupedMembers = useMemo(() => {
    if (!activeServer || !isOnServerRoute) return [];

    const members = activeServer.members || [];
    const roles = activeServer.roles || [];

    const specialRoles = roles
        .filter(r => r.name !== '@everyone')
        .sort((a, b) => (b.position || 0) - (a.position || 0));

    const groupsMap = new Map();
    specialRoles.forEach(role => {
        groupsMap.set(role._id, {
            id: role._id,
            name: role.name,
            color: role.color,
            members: []
        });
    });

    const onlineList = [];
    const offlineList = [];

    members.forEach(member => {
        let assigned = false;
        const memberRoleIds = member.roles.map(r => r._id || r);

        for (const role of specialRoles) {
            if (memberRoleIds.includes(role._id)) {
                groupsMap.get(role._id).members.push(member);
                assigned = true;
                break;
            }
        }

        if (!assigned) {
            if (member.user?.onlineStatus === 'online') {
                onlineList.push(member);
            } else {
                offlineList.push(member);
            }
        }
    });

    const result = [];

    specialRoles.forEach(role => {
        const group = groupsMap.get(role._id);
        if (group && group.members.length > 0) {
            group.members.sort((a, b) => (a.user?.username || '').localeCompare(b.user?.username || ''));
            result.push({ title: group.name, color: group.color, members: group.members });
        }
    });

    if (onlineList.length > 0) {
        onlineList.sort((a, b) => (a.user?.username || '').localeCompare(b.user?.username || ''));
        result.push({ title: 'Çevrimiçi', color: '#43b581', members: onlineList });
    }

    if (offlineList.length > 0) {
        offlineList.sort((a, b) => (a.user?.username || '').localeCompare(b.user?.username || ''));
        result.push({ title: 'Çevrimdışı', color: '#747f8d', members: offlineList });
    }

    return result;

  }, [activeServer, isOnServerRoute]);

  if (!isOnServerRoute || !activeServer) return null;

  const handleContextMenu = (e, member) => {
    e.preventDefault();
    if (!member || !member.user || member.user._id === user.id) return;
    setContextMenu({ x: e.pageX, y: e.pageY, member });
  };

  return (
    <div className="members-sidebar" onClick={() => setContextMenu(null)}>
      <h3 className="members-sidebar-title">Üyeler — {activeServer.members?.length || 0}</h3>

      <div className="members-scroll-area">
        {groupedMembers.map((group, index) => (
            <div key={group.title + index} className="member-group">
                <h4 className="role-header" style={{ color: group.color || '#96989d' }}>
                    {group.title.toUpperCase()} — {group.members.length}
                </h4>

                <div className="members-list">
                    {group.members.map((member) => {
                        const isOwner = activeServer.owner && member.user && (
                            activeServer.owner._id === member.user._id || activeServer.owner === member.user._id
                        );
                        // 🟢 ONLINE DURUMU KONTROLÜ
                        const isOnline = member.user?.onlineStatus === 'online';
                        const avatarSrc = getImageUrl(member.user?.avatarUrl || member.user?.avatar);

                        return (
                            <div
                                key={member._id}
                                className={`member-item ${!isOnline ? 'offline' : ''}`}
                                onContextMenu={(e) => handleContextMenu(e, member)}
                            >
                                {/* 🟢 RESİM VE NOKTA KAPSAYICISI */}
                                <div className="member-avatar-wrapper">
                                    <img
                                        src={avatarSrc}
                                        alt={member.user?.username}
                                        onError={handleAvatarError}
                                        className="member-avatar-img"
                                    />
                                    {/* 🟢 YEŞİL NOKTA (Sadece online ise yeşil, değilse gri) */}
                                    <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                                </div>

                                <div className="member-info">
                                    <span
                                        className="member-name"
                                        style={{ color: isOnline ? '#fff' : '#96989d' }}
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