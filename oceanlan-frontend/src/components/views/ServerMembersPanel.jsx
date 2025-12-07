// src/components/views/ServerMembersPanel.jsx
import React, { useContext, useState, useMemo, useEffect } from 'react'; // useEffect eklendi
import { useLocation } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket'; // 🟢 useSocket eklendi
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
  const { socket } = useSocket(); // 🟢 Socket bağlantısı alındı
  const location = useLocation();
  const [contextMenu, setContextMenu] = useState(null);

  // 🟢 Anlık Online Durumlarını Tutacak State
  const [onlineStates, setOnlineStates] = useState({});

  const isOnServerRoute = location.pathname.includes('/dashboard/server/');

  // 1. Sunucu değiştiğinde veya sayfa açıldığında mevcut üyelerin durumunu kaydet
  useEffect(() => {
    if (activeServer?.members) {
      const initialStates = {};
      activeServer.members.forEach(member => {
        if (member.user) {
          initialStates[member.user._id] = member.user.onlineStatus || 'offline';
        }
      });
      setOnlineStates(initialStates);
    }
  }, [activeServer]);

  // 2. Socket üzerinden gelen anlık durum değişikliklerini dinle
  useEffect(() => {
    if (!socket) return;

    const handleUserStatusChanged = ({ userId, status }) => {
      setOnlineStates(prev => ({
        ...prev,
        [userId]: status
      }));
    };

    // Backend'de bu eventin adının 'userStatusChanged' olduğundan emin olun.
    // Eğer 'userConnected' / 'userDisconnected' ayrı ayrıysa ona göre düzenlenmeli.
    socket.on('userStatusChanged', handleUserStatusChanged);

    return () => {
      socket.off('userStatusChanged', handleUserStatusChanged);
    };
  }, [socket]);

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
        if (!member.user) return; // Kullanıcı verisi yoksa atla

        let assigned = false;
        const memberRoleIds = member.roles.map(r => String(r._id || r));

        // 🟢 Durumu local state'den kontrol et (Statik veriden değil)
        const currentStatus = onlineStates[member.user._id] || member.user.onlineStatus || 'offline';
        const isOnline = currentStatus === 'online';

        // Role göre gruplama
        for (const role of specialRoles) {
            if (memberRoleIds.includes(String(role._id))) {
                groupsMap.get(role._id).members.push({ ...member, isOnline }); // Durumu objeye ekle
                assigned = true;
                break;
            }
        }

        // Eğer bir rol grubuna girmediyse Online/Offline listesine ekle
        if (!assigned) {
            if (isOnline) {
                onlineList.push({ ...member, isOnline: true });
            } else {
                offlineList.push({ ...member, isOnline: false });
            }
        }
    });

    const result = [];

    // Rol Gruplarını Ekle
    specialRoles.forEach(role => {
        const group = groupsMap.get(role._id);
        if (group && group.members.length > 0) {
            group.members.sort((a, b) => (a.user?.username || '').localeCompare(b.user?.username || ''));
            result.push({ title: group.name, color: group.color, members: group.members });
        }
    });

    // 🟢 Çevrimiçi Listesi
    if (onlineList.length > 0) {
        onlineList.sort((a, b) => (a.user?.username || '').localeCompare(b.user?.username || ''));
        result.push({ title: 'Çevrimiçi', color: '#43b581', members: onlineList });
    }

    // Çevrimdışı Listesi
    if (offlineList.length > 0) {
        offlineList.sort((a, b) => (a.user?.username || '').localeCompare(b.user?.username || ''));
        result.push({ title: 'Çevrimdışı', color: '#747f8d', members: offlineList });
    }

    return result;

  }, [activeServer, isOnServerRoute, onlineStates]); // 🟢 onlineStates bağımlılığı eklendi

  if (!isOnServerRoute || !activeServer) return null;

  const handleContextMenu = (e, member) => {
    e.preventDefault();
    if (!member || !member.user || member.user._id === user.id) return;
    setContextMenu({ x: e.pageX, y: e.pageY, member });
  };

  return (
    <div className="smp-sidebar" onClick={() => setContextMenu(null)}>
      <h3 className="smp-title">Üyeler — {activeServer.members?.length || 0}</h3>

      <div className="smp-scroll-area">
        {groupedMembers.map((group, index) => (
            <div key={group.title + index} className="smp-group">
                <h4 className="smp-role-header" style={{ color: group.color || '#96989d' }}>
                    {group.title.toUpperCase()} — {group.members.length}
                </h4>

                <div className="smp-list">
                    {group.members.map((member) => {
                        const isOwner = activeServer.owner && member.user && (
                            String(activeServer.owner._id || activeServer.owner) === String(member.user._id)
                        );

                        // 🟢 Artık durumu groupedMembers içinde hesaplayıp member objesine 'isOnline' olarak ekledik
                        const isOnline = member.isOnline;
                        const avatarSrc = getImageUrl(member.user?.avatarUrl || member.user?.avatar);

                        return (
                            <div
                                key={member._id}
                                className={`smp-item ${!isOnline ? 'offline' : ''}`}
                                onContextMenu={(e) => handleContextMenu(e, member)}
                            >
                                <div className="smp-avatar-wrapper">
                                    <img
                                        src={avatarSrc}
                                        alt={member.user?.username}
                                        onError={handleAvatarError}
                                        className="smp-avatar-img"
                                    />
                                    {/* 🟢 Durum Noktası */}
                                    <span className={`smp-status-dot ${isOnline ? 'online' : 'offline'}`} />
                                </div>

                                <div className="smp-info">
                                    <span
                                        className="smp-name"
                                        style={{ color: isOnline ? '#fff' : '#96989d' }}
                                    >
                                        {member.user?.username || 'Bilinmeyen'}
                                    </span>
                                    {isOwner && <span className="smp-badge" title="Sunucu Sahibi">👑</span>}
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