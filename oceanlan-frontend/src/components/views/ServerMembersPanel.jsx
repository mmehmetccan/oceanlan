// src/components/views/ServerMembersPanel.jsx
import React, { useContext, useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
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
  const { socket } = useSocket();
  const location = useLocation();
  const [contextMenu, setContextMenu] = useState(null);

  // Anlık durumları tutacak map: { "userId123": "online", "userId456": "offline" }
  const [onlineStatusMap, setOnlineStatusMap] = useState({});

  const isOnServerRoute = location.pathname.includes('/dashboard/server/');

  // 1. Sunucu değiştiğinde mevcut üyelerin statik durumunu başlangıç değeri olarak al
  useEffect(() => {
    if (activeServer?.members) {
      const initialMap = {};
      activeServer.members.forEach(member => {
        if (member.user) {
          // Eğer sunucudan gelen veride onlineStatus varsa onu kullan, yoksa offline
          initialMap[member.user._id] = member.user.onlineStatus || 'offline';
        }
      });
      setOnlineStatusMap(initialMap);
    }
  }, [activeServer]);

  // 2. Socket Eventlerini Dinle (Çoklu İsim Desteği)
  useEffect(() => {
    if (!socket) return;

    // Kullanıcı bağlandığında
    const handleUserConnected = (userId) => {
      // Bazen userId direkt string gelir, bazen obje { userId: "..." } gelir. Kontrol edelim:
      const id = typeof userId === 'object' ? userId.userId || userId.id : userId;

      console.log("🟢 Socket: Kullanıcı Bağlandı:", id); // Debug için

      setOnlineStatusMap(prev => ({
        ...prev,
        [id]: 'online'
      }));
    };

    // Kullanıcı ayrıldığında
    const handleUserDisconnected = (userId) => {
      const id = typeof userId === 'object' ? userId.userId || userId.id : userId;

      console.log("🔴 Socket: Kullanıcı Ayrıldı:", id); // Debug için

      setOnlineStatusMap(prev => ({
        ...prev,
        [id]: 'offline'
      }));
    };

    // Alternatif event ismi (userStatusChanged)
    const handleStatusChanged = (data) => {
      const id = data.userId || data.id;
      const status = data.status; // 'online' veya 'offline'

      console.log("🟡 Socket: Durum Değişti:", id, status); // Debug için

      setOnlineStatusMap(prev => ({
        ...prev,
        [id]: status
      }));
    };

    // Olası tüm event isimlerini dinliyoruz
    socket.on('userConnected', handleUserConnected);
    socket.on('userDisconnected', handleUserDisconnected);
    socket.on('userStatusChanged', handleStatusChanged); // Yedek olarak

    return () => {
      socket.off('userConnected', handleUserConnected);
      socket.off('userDisconnected', handleUserDisconnected);
      socket.off('userStatusChanged', handleStatusChanged);
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
        if (!member.user) return;

        let assigned = false;
        const memberRoleIds = member.roles.map(r => String(r._id || r));

        // 🟢 KRİTİK NOKTA: Durumu Socket Map'inden çekiyoruz
        // Eğer map'te varsa onu kullan, yoksa sunucudan gelen ilk veriyi kullan
        const liveStatus = onlineStatusMap[member.user._id];
        const initialStatus = member.user.onlineStatus || 'offline';

        // Eğer socketten veri geldiyse liveStatus'u, gelmediyse initial'ı kullan
        const isOnline = (liveStatus ? liveStatus === 'online' : initialStatus === 'online');

        // Üye objesini güncelle (isOnline bilgisini ekle)
        const memberWithStatus = { ...member, isOnline };

        for (const role of specialRoles) {
            if (memberRoleIds.includes(String(role._id))) {
                groupsMap.get(role._id).members.push(memberWithStatus);
                assigned = true;
                break;
            }
        }

        if (!assigned) {
            if (isOnline) {
                onlineList.push(memberWithStatus);
            } else {
                offlineList.push(memberWithStatus);
            }
        }
    });

    const result = [];

    specialRoles.forEach(role => {
        const group = groupsMap.get(role._id);
        if (group && group.members.length > 0) {
            // İsim sırasına göre diz
            group.members.sort((a, b) => (a.user?.username || '').localeCompare(b.user?.username || ''));
            result.push({ title: group.name, color: group.color, members: group.members });
        }
    });

    // Online Listesi
    if (onlineList.length > 0) {
        onlineList.sort((a, b) => (a.user?.username || '').localeCompare(b.user?.username || ''));
        result.push({ title: 'Çevrimiçi', color: '#43b581', members: onlineList });
    }

    // Offline Listesi
    if (offlineList.length > 0) {
        offlineList.sort((a, b) => (a.user?.username || '').localeCompare(b.user?.username || ''));
        result.push({ title: 'Çevrimdışı', color: '#747f8d', members: offlineList });
    }

    return result;

  }, [activeServer, isOnServerRoute, onlineStatusMap]); // onlineStatusMap değiştiğinde burası yeniden hesaplanır

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

                        // useMemo içinde hesaplanan isOnline değerini kullanıyoruz
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
                                    {/* isOnline durumuna göre class ekle */}
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