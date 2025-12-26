// src/components/views/ServerMembersPanel.jsx
import React, { useContext, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import MemberContextMenu from '../modals/MemberContextMenu';
import { getImageUrl } from '../../utils/urlHelper';
import "../../styles/ServerMembersPanel.css";
import UserBadgeList from '../gamification/UserBadgeList';
import UserLevelTag from '../gamification/UserLevelTag';

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
        <div className="smp-sidebar" onClick={() => setContextMenu(null)}>
            {/* 🟢 YENİ CSS SINIFI: smp-title */}
            <h3 className="smp-title">Üyeler — {activeServer.members?.length || 0}</h3>

            {/* 🟢 YENİ CSS SINIFI: smp-scroll-area */}
            <div className="smp-scroll-area">
                {groupedMembers.map((group, index) => (
                    <div key={group.title + index} className="smp-group">
                        {/* 🟢 YENİ CSS SINIFI: smp-role-header */}
                        <h4 className="smp-role-header" style={{ color: group.color || '#96989d' }}>
                            {group.title.toUpperCase()} — {group.members.length}
                        </h4>

                        <div className="smp-list">
                            {group.members.map((member) => {
                                const isOwner = activeServer.owner && member.user && (
                                    activeServer.owner._id === member.user._id || activeServer.owner === member.user._id
                                );

                                const isOnline = member.user?.onlineStatus === 'online';
                                const avatarSrc = getImageUrl(member.user?.avatarUrl || member.user?.avatar);

                                return (
                                    <div
                                        key={member._id}
                                        // 🟢 YENİ CSS SINIFI: smp-item
                                        className={`smp-item ${!isOnline ? 'offline' : ''}`}
                                        onContextMenu={(e) => handleContextMenu(e, member)}
                                    >
                                        {/* 🟢 YENİ CSS SINIFI: smp-avatar-wrapper */}
                                        <div className="smp-avatar-wrapper">
                                            <img
                                                src={avatarSrc}
                                                alt={member.user?.username}
                                                onError={handleAvatarError}
                                                className="smp-avatar-img"
                                            />
                                            {/* 🟢 YENİ CSS SINIFI: smp-status-dot */}
                                            <span className={`smp-status-dot ${isOnline ? 'online' : 'offline'}`} />
                                        </div>

                                        <div className="smp-info">
                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                <span className="smp-name" style={{ color: isOnline ? '#fff' : '#96989d' }}>
                                                    {member.user?.username || 'Bilinmeyen'}
                                                </span>
                                                {isOwner && <span className="smp-badge">👑</span>}

                                                {/* 👇 SADECE LEVEL EKLENDİ */}
                                                <UserLevelTag
                                                    level={member.user?.level}
                                                    activeBadge={member.user?.activeBadge}
                                                />                                    </div>
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