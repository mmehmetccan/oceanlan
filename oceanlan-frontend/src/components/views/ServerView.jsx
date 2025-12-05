// src/components/views/ServerView.jsx
import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { ServerContext } from '../../context/ServerContext';
import { useSocket } from '../../hooks/useSocket';
import { AuthContext } from '../../context/AuthContext';
import MemberContextMenu from '../modals/MemberContextMenu';
import { ToastContext } from '../../context/ToastContext';
import { checkUserPermission } from '../../utils/permissionChecker';
import { useServerSocket } from '../../hooks/useServerSocket';
import { VoiceContext } from '../../context/VoiceContext';
import '../../styles/ServerView.css';

const DEFAULT_AVATAR = '/default-avatar.png';
const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const BASE_URL = API_URL_BASE.replace(/\/api\/v1\/?$/, '');

const handleAvatarError = (e) => {
  if (e?.target?.dataset?.fallbackApplied === 'true') return;
  if (e?.target) {
    e.target.dataset.fallbackApplied = 'true';
    e.target.src = DEFAULT_AVATAR;
  }
};

const ServerView = () => {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { activeServer, loading, fetchServerDetails, setActiveChannel } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const { socket } = useSocket();
  const { addToast } = useContext(ToastContext);
  const { joinVoiceChannel, currentVoiceChannelId, speakingUsers } = useContext(VoiceContext);

  useServerSocket(serverId);

  const [voiceState, setVoiceState] = useState({});
  const [contextMenu, setContextMenu] = useState(null);

  // Drag & Drop State
  const [draggedUser, setDraggedUser] = useState(null);

  // Yetki Kontrolü
  const canMoveMembers = activeServer && (
      checkUserPermission(activeServer, user?.id, 'MUTE_MEMBERS') ||
      checkUserPermission(activeServer, user?.id, 'ADMINISTRATOR') ||
      activeServer.owner === user?.id // Sunucu sahibi her şeyi yapar
  );

  const handleJoinVoiceChannel = (channel) => {
    if (!activeServer || !channel) return;
    joinVoiceChannel(
      { _id: activeServer._id, name: activeServer.name },
      { _id: channel._id, name: channel.name }
    );
  };

  // ... (useEffect'ler aynı kalabilir: fetchServerDetails vb.) ...
  // BURAYI KISALTTIM, MEVCUT KODUNDAKİ GİBİ KALSIN (Detayları çekme kısımları)
  useEffect(() => {
    if (!activeServer || activeServer._id !== serverId) { fetchServerDetails(serverId); }
  }, [serverId, activeServer]);

  // Socket Listener
  useEffect(() => {
    if (!socket || !serverId) return;

    const handleVoiceStateUpdate = (newServerVoiceState) => {
      // Backend'den gelen en güncel liste
      setVoiceState({ ...(newServerVoiceState || {}) });
    };

    socket.on('voiceStateUpdate', handleVoiceStateUpdate);
    socket.emit('get-server-voice-state', serverId);

    return () => {
      socket.off('voiceStateUpdate', handleVoiceStateUpdate);
    };
  }, [socket, serverId]);

  // --- DRAG & DROP HANDLERS (DÜZELTİLDİ) ---

  const handleVoiceUserDragStart = (e, fromChannelId, userId) => {
    if (!canMoveMembers) return;
    e.stopPropagation(); // Event çakışmasını önle
    setDraggedUser({ fromChannelId, userId });
    e.dataTransfer.setData("text/plain", userId); // Firefox desteği için
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleVoiceUserDragEnd = () => {
      setDraggedUser(null);
  };

  const handleVoiceChannelDragOver = (e, channel) => {
    e.preventDefault(); // Drop'a izin ver
    e.stopPropagation();

    if (!draggedUser || !canMoveMembers) return;
    // Kendi olduğu kanala bırakırsa işlem yapma
    if (draggedUser.fromChannelId === channel._id) {
        e.dataTransfer.dropEffect = 'none';
        return;
    }
    e.dataTransfer.dropEffect = 'move';
  };

  const handleVoiceChannelDrop = (e, channel) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedUser || !canMoveMembers) return;
    if (draggedUser.fromChannelId === channel._id) return;

    console.log(`[MOVE] ${draggedUser.userId} kullanıcısı ${channel.name} kanalına taşınıyor...`);

    // Backend'e taşıma emri ver
    socket.emit('move-voice-user', {
      serverId,
      fromChannelId: draggedUser.fromChannelId,
      toChannelId: channel._id,
      targetUserId: draggedUser.userId,
    });

    setDraggedUser(null);
  };

  if (loading || !activeServer || activeServer._id !== serverId) {
    return <div className="server-view-loading">Sunucu Yükleniyor...</div>;
  }

  // Kanalları hazırla
  const textChannels = activeServer.channels.filter((c) => c.type === 'text');
  const voiceChannels = activeServer.channels.filter((c) => c.type === 'voice');
  const serverInitial = activeServer?.name?.charAt(0)?.toUpperCase() || '#';
  const serverIconUrl = activeServer?.iconUrl ? (activeServer.iconUrl.startsWith('http') ? activeServer.iconUrl : `${BASE_URL}${activeServer.iconUrl}`) : null;

  return (
    <div className="server-view" onClick={() => setContextMenu(null)}>
      {/* Header kısmı aynı kalsın... */}
      <header className="server-view-header">
         <div className="server-title-block">
             <h2>{activeServer.name}</h2>
         </div>
      </header>

      <div className="channels-list">
        {/* Metin Kanalları */}
        <div className="channel-group text-channels-group">
            <h3># Metin Kanalları</h3>
            {textChannels.map(c => (
                <Link key={c._id} to={`/dashboard/server/${serverId}/channel/${c._id}`} className={`channel-item text-channel`}>
                    <span className="channel-name"># {c.name}</span>
                </Link>
            ))}
        </div>

        {/* 📢 SES KANALLARI (OPTIMISTIC UPDATE İLE) */}
        <div className="channel-group voice-channels-group">
          <h3>🎤 Ses Kanalları</h3>
          {voiceChannels.map((channel) => {
            const isActiveVoice = currentVoiceChannelId === channel._id;

            // 🟢 ANINDA GÜNCELLEME İÇİN HESAPLAMA
            // 1. Backend listesini al
            let usersInThisChannel = [...(voiceState[channel._id] || [])];

            // 2. Eğer BEN bu kanaldaysam ve listede yoksam, EKLİYORUM (Optimistic Add)
            if (currentVoiceChannelId === channel._id && user) {
                const amIHere = usersInThisChannel.find(u => String(u.userId) === String(user.id));
                if (!amIHere) {
                    usersInThisChannel.push({
                        userId: user.id,
                        username: user.username,
                        socketId: socket?.id || 'temp',
                        isMuted: false,
                        isDeafened: false
                    });
                }
            }
            // 3. Eğer BEN başka kanaldaysam ama listede varsam, SİLİYORUM (Optimistic Remove)
            if (currentVoiceChannelId && currentVoiceChannelId !== channel._id && user) {
                usersInThisChannel = usersInThisChannel.filter(u => String(u.userId) !== String(user.id));
            }

            return (
              <div
                key={channel._id}
                className="channel-group-item"
                // Kanalın üzerine sürüklenince eventleri yakala
                onDragOver={(e) => handleVoiceChannelDragOver(e, channel)}
                onDrop={(e) => handleVoiceChannelDrop(e, channel)}
              >
                <button
                  className={`channel-item voice-channel ${isActiveVoice ? 'active' : ''}`}
                  onClick={() => handleJoinVoiceChannel(channel)}
                >
                  <div className="channel-main">
                    <span className="channel-icon">🎤</span>
                    <span className="channel-name">{channel.name}</span>
                  </div>
                  <span className="channel-occupancy">{usersInThisChannel.length}</span>
                </button>

                {/* KULLANICI LİSTESİ */}
                {usersInThisChannel.length > 0 && (
                  <div className="voice-channel-users">
                    {usersInThisChannel.map((voiceUser) => {
                      const member = activeServer.members.find(m => m.user && String(m.user._id) === String(voiceUser.userId));
                      const isSelf = String(voiceUser.userId) === String(user?.id);

                      // İsim ve Avatar Çözümleme
                      const displayName = member?.user?.username || (isSelf ? user.username : voiceUser.username);

                      let rawAvatar = member?.user?.avatarUrl || member?.user?.avatar;
                      if (!rawAvatar && isSelf) rawAvatar = user.avatarUrl;
                      if (!rawAvatar) rawAvatar = DEFAULT_AVATAR;
                      const absoluteAvatarSrc = rawAvatar.startsWith('/uploads') ? `${API_URL_BASE}${rawAvatar}` : rawAvatar;

                      const isSpeaking = speakingUsers?.[voiceUser.userId] || false;

                      return (
                        <div
                          key={voiceUser.userId}
                          className={`voice-user-item ${canMoveMembers ? 'draggable' : ''} ${isSpeaking ? 'is-speaking' : ''}`}
                          draggable={canMoveMembers}
                          onDragStart={(e) => handleVoiceUserDragStart(e, channel._id, voiceUser.userId)}
                          onDragEnd={handleVoiceUserDragEnd}
                          onContextMenu={(e) => member && handleContextMenu(e, member)}
                        >
                          <div className={`voice-user-avatar ${isSpeaking ? 'speaking' : ''}`}>
                            <img src={absoluteAvatarSrc} alt={displayName} onError={handleAvatarError} />
                            {isSpeaking && <span className="voice-speaking-ring" />}
                          </div>
                          <div className="voice-user-details">
                            <span className="voice-user-name">{displayName}</span>
                            {isSelf && <span className="voice-user-tag">Sen</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Context Menu varsa render et */}
      {contextMenu && (
        <MemberContextMenu member={contextMenu.member} x={contextMenu.x} y={contextMenu.y} serverId={serverId} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
};

export default ServerView;