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

  // 🟢 DÜZELTİLEN GRUPLAMA MANTIĞI
  const groupedMembers = useMemo(() => {
    if (!activeServer || !isOnServerRoute) return [];

    const members = activeServer.members || [];
    const roles = activeServer.roles || [];

    // 1. "@everyone" hariç diğer rolleri al ve sıraya diz (En yüksek en üstte)
    const specialRoles = roles
        .filter(r => r.name !== '@everyone')
        .sort((a, b) => (b.position || 0) - (a.position || 0));

    // 2. Grupları oluştur
    const groupsMap = new Map();
    specialRoles.forEach(role => {
        groupsMap.set(role._id, {
            id: role._id,
            name: role.name,
            color: role.color,
            members: []
        });
    });

    // 3. Online / Offline Listeleri (Rolsüzler için)
    const onlineList = [];
    const offlineList = [];

    // 4. Her üyeyi tara ve en yüksek rolüne ata
    members.forEach(member => {
        let assigned = false;

        // Üyenin rollerini kontrol et
        // (Backend bazen role objesi, bazen ID gönderir, ikisini de kapsayalım)
        const memberRoleIds = member.roles.map(r => r._id || r);

        // En yüksekten en düşüğe doğru özel rolleri kontrol et
        for (const role of specialRoles) {
            if (memberRoleIds.includes(role._id)) {
                groupsMap.get(role._id).members.push(member);
                assigned = true;
                break; // En yüksek role atadık, döngüden çık (Bir kişi bir yerde görünsün)
            }
        }

        // Eğer hiçbir özel role girmediyse, durumuna göre listeye at
        if (!assigned) {
            if (member.user?.onlineStatus === 'online') {
                onlineList.push(member);
            } else {
                offlineList.push(member);
            }
        }
    });

    // 5. Sonuç dizisini oluştur
    const result = [];

    // Önce Rol Grupları (Boş olanları gösterme)
    specialRoles.forEach(role => {
        const group = groupsMap.get(role._id);
        if (group && group.members.length > 0) {
            // Üyeleri isme göre sırala
            group.members.sort((a, b) => (a.user?.username || '').localeCompare(b.user?.username || ''));
            result.push({ title: group.name, color: group.color, members: group.members });
        }
    });

    // Sonra Çevrimiçi
    if (onlineList.length > 0) {
        onlineList.sort((a, b) => (a.user?.username || '').localeCompare(b.user?.username || ''));
        result.push({ title: 'Çevrimiçi', color: '#43b581', members: onlineList });
    }

    // Sonra Çevrimdışı
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
      {/* Başlık */}
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
                        const isOnline = member.user?.onlineStatus === 'online';
                        const avatarSrc = getImageUrl(member.user?.avatarUrl || member.user?.avatar);

                        return (
                            <div
                                key={member._id}
                                className={`member-item ${!isOnline ? 'offline' : ''}`}
                                onContextMenu={(e) => handleContextMenu(e, member)}
                            >
                                <div className="member-avatar-container">
                                    <img
                                        src={avatarSrc}
                                        alt={member.user?.username}
                                        onError={handleAvatarError}
                                        className="member-avatar-img"
                                    />
                                    <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`} />
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