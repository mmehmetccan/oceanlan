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

    const specialRoles = roles.filter(r => r.name !== '@everyone').sort((a, b) => (b.position || 0) - (a.position || 0));
    const groupsMap = new Map();
    specialRoles.forEach(r => groupsMap.set(r._id, { id: r._id, name: r.name, color: r.color, members: [] }));

    const onlineList = [];
    const offlineList = [];

    members.forEach(member => {
        let assigned = false;
        const memberRoleIds = member.roles.map(r => String(r._id || r));
        for (const role of specialRoles) {
            if (memberRoleIds.includes(String(role._id))) {
                groupsMap.get(role._id).members.push(member);
                assigned = true;
                break;
            }
        }
        if (!assigned) {
            if (member.user?.onlineStatus === 'online') onlineList.push(member);
            else offlineList.push(member);
        }
    });

    const result = [];
    specialRoles.forEach(r => {
        const g = groupsMap.get(r._id);
        if (g.members.length > 0) {
            g.members.sort((a, b) => (a.user?.username || '').localeCompare(b.user?.username || ''));
            result.push({ title: g.name, color: g.color, members: g.members });
        }
    });

    if (onlineList.length > 0) result.push({ title: 'Çevrimiçi', color: '#43b581', members: onlineList.sort((a,b)=>a.user?.username.localeCompare(b.user?.username)) });
    if (offlineList.length > 0) result.push({ title: 'Çevrimdışı', color: '#747f8d', members: offlineList.sort((a,b)=>a.user?.username.localeCompare(b.user?.username)) });

    return result;
  }, [activeServer, isOnServerRoute]);

  if (!isOnServerRoute || !activeServer) return null;

  const handleContextMenu = (e, member) => { e.preventDefault(); if (!member || !member.user) return; setContextMenu({ x: e.pageX, y: e.pageY, member }); };

  return (
    <div className="smp-sidebar" onClick={() => setContextMenu(null)}>
      <h3 className="smp-title">Üyeler — {activeServer.members?.length || 0}</h3>
      <div className="smp-scroll-area">
        {groupedMembers.map((group, index) => (
            <div key={index} className="smp-group">
                <h4 className="smp-role-header" style={{ color: group.color || '#96989d' }}>{group.title.toUpperCase()} — {group.members.length}</h4>
                <div className="smp-list">
                    {group.members.map((member) => {
                        const isOwner = activeServer.owner && member.user && String(activeServer.owner._id || activeServer.owner) === String(member.user._id);
                        const isOnline = member.user?.onlineStatus === 'online';
                        const avatarSrc = getImageUrl(member.user?.avatarUrl || member.user?.avatar);

                        return (
                            <div key={member._id} className={`smp-item ${!isOnline ? 'offline' : ''}`} onContextMenu={(e) => handleContextMenu(e, member)}>
                                <div className="smp-avatar-wrapper">
                                    <img src={avatarSrc} alt={member.user?.username} onError={handleAvatarError} className="smp-avatar-img" />
                                    {/* 🟢 YEŞİL NOKTA BURADA */}
                                    <span className={`smp-status-dot ${isOnline ? 'online' : 'offline'}`} />
                                </div>
                                <div className="smp-info">
                                    <span className="smp-name" style={{ color: isOnline ? '#fff' : '#96989d' }}>{member.user?.username || 'Bilinmeyen'}</span>
                                    {isOwner && <span className="smp-badge">👑</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        ))}
      </div>
      {contextMenu && <MemberContextMenu member={contextMenu.member} x={contextMenu.x} y={contextMenu.y} serverId={activeServer._id} onClose={() => setContextMenu(null)} />}
    </div>
  );
};

export default ServerMembersPanel;