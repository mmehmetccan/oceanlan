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
  const [draggedUser, setDraggedUser] = useState(null);

  // Yetki Kontrolü
  const canMoveMembers = activeServer && (
      checkUserPermission(activeServer, user?.id, 'MUTE_MEMBERS') ||
      checkUserPermission(activeServer, user?.id, 'ADMINISTRATOR') ||
      checkUserPermission(activeServer, user?.id, 'MOVE_MEMBERS') ||
      activeServer.owner === user?.id
  );

  const handleJoinVoiceChannel = (channel) => {
    if (!activeServer || !channel) return;
    joinVoiceChannel(
      { _id: activeServer._id, name: activeServer.name },
      { _id: channel._id, name: channel.name }
    );
  };

  useEffect(() => {
    if (!activeServer || activeServer._id !== serverId) {
      fetchServerDetails(serverId);
      return;
    }
    if (activeServer && activeServer._id === serverId && activeServer.channels.length > 0 && !location.pathname.includes('/channel/') && !location.pathname.includes('/settings') && !currentVoiceChannelId) {
      const defaultChannel = activeServer.channels.find((c) => c.type === 'text') || activeServer.channels[0];
      if (defaultChannel) {
        navigate(`/dashboard/server/${serverId}/channel/${defaultChannel._id}`, { replace: true });
        setActiveChannel(defaultChannel);
      }
    }
  }, [serverId, activeServer, navigate, location.pathname, fetchServerDetails, currentVoiceChannelId, setActiveChannel]);

  useEffect(() => {
    if (!socket || !serverId) return;

    const handleVoiceStateUpdate = (newServerVoiceState) => {
      setVoiceState({ ...(newServerVoiceState || {}) });
    };

    const handleMemberUpdate = () => fetchServerDetails(serverId);
    const refetchServer = () => fetchServerDetails(serverId);
    const handleJoinVoiceError = (error) => addToast(error.message, 'error');

    socket.on('voiceStateUpdate', handleVoiceStateUpdate);
    socket.on('memberUpdated', handleMemberUpdate);
    socket.on('channelCreated', refetchServer);
    socket.on('channelUpdated', refetchServer);
    socket.on('channelDeleted', refetchServer);
    socket.on('join-voice-error', handleJoinVoiceError);

    socket.emit('get-server-voice-state', serverId);

    return () => {
      socket.off('voiceStateUpdate', handleVoiceStateUpdate);
      socket.off('memberUpdated', handleMemberUpdate);
      socket.off('channelCreated', refetchServer);
      socket.off('channelUpdated', refetchServer);
      socket.off('channelDeleted', refetchServer);
      socket.off('join-voice-error', handleJoinVoiceError);
    };
  }, [socket, serverId, fetchServerDetails, addToast]);

  // =======================================================
  // 🔥 DRAG & DROP DÜZELTMESİ 🔥
  // =======================================================

  const handleVoiceUserDragStart = (e, fromChannelId, userId) => {
    if (!canMoveMembers) return;

    console.log('[DRAG] Başladı:', userId);
    setDraggedUser({ fromChannelId, userId });

    // Firefox ve bazı tarayıcılar için veri seti şarttır
    e.dataTransfer.setData("text/plain", userId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleVoiceUserDragEnd = () => {
      setDraggedUser(null);
  };

  const handleVoiceChannelDragOver = (e, channel) => {
    // 🔴 KRİTİK DÜZELTME: preventDefault() EN BAŞTA OLMALI
    // Bunu yapmazsan tarayıcı drop işlemini engeller!
    e.preventDefault();
    e.stopPropagation();

    if (!draggedUser || !canMoveMembers) {
        e.dataTransfer.dropEffect = 'none';
        return;
    }

    // Aynı kanala taşımaya çalışma
    if (draggedUser.fromChannelId === channel._id) {
        e.dataTransfer.dropEffect = 'none';
        return;
    }

    e.dataTransfer.dropEffect = 'move';
  };

  const handleVoiceChannelDrop = (e, channel) => {
    e.preventDefault();
    e.stopPropagation();

    console.log('[DROP] Bırakıldı:', channel.name);

    if (!draggedUser || !canMoveMembers) return;
    if (draggedUser.fromChannelId === channel._id) return;

    // Backend'e emit et
    socket.emit('move-voice-user', {
      serverId,
      fromChannelId: draggedUser.fromChannelId,
      toChannelId: channel._id,
      targetUserId: draggedUser.userId,
    });

    setDraggedUser(null);
  };

  const handleContextMenu = (e, member) => {
    e.preventDefault();
    if (!member || !member.user) return;
    setContextMenu({ x: e.pageX, y: e.pageY, member });
  };

  if (loading || !activeServer || activeServer._id !== serverId) {
    return <div className="server-view-loading">Sunucu Yükleniyor...</div>;
  }

  const textChannels = activeServer.channels.filter((c) => c.type === 'text');
  const voiceChannels = activeServer.channels.filter((c) => c.type === 'voice');
  const serverIconUrl = activeServer?.iconUrl ? (activeServer.iconUrl.startsWith('http') ? activeServer.iconUrl : `${BASE_URL}${activeServer.iconUrl}`) : null;
  const serverInitial = activeServer?.name?.charAt(0)?.toUpperCase() || '#';

  return (
    <div className="server-view" onClick={() => setContextMenu(null)}>
      <header className="server-view-header">
        <div className="server-title-block">
          <div className="server-avatar-chip" style={{ overflow: 'hidden', padding: 0, background: serverIconUrl ? 'transparent' : '' }}>
            {serverIconUrl ? (
              <img src={serverIconUrl} alt={activeServer.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; e.target.parentNode.innerText = serverInitial; }} />
            ) : (serverInitial)}
          </div>
          <div className="server-title-text">
            <h2 className="server-name">{activeServer.name}</h2>
          </div>
        </div>
      </header>

      <div className="channels-list">
        <div className="channel-group text-channels-group">
          <h3># Metin Kanalları</h3>
          {textChannels.map((channel) => {
            const isActive = location.pathname.includes(`/channel/${channel._id}`);
            return (
              <Link key={channel._id} to={`/dashboard/server/${serverId}/channel/${channel._id}`} className={`channel-item text-channel ${isActive ? 'active' : ''}`} onClick={() => setActiveChannel(channel)}>
                <div className="channel-main">
                  <span className="channel-icon">#</span>
                  <span className="channel-name">{channel.name}</span>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="channel-group voice-channels-group">
          <h3>🎤 Ses Kanalları</h3>
          {voiceChannels.map((channel) => {
            const isActiveVoice = currentVoiceChannelId === channel._id;

            // 🛠️ DUPLICATE USER FİX (Kopya Kullanıcı Çözümü)

            // 1. Backend listesini al
            let usersInThisChannel = [...(voiceState[channel._id] || [])];

            // 2. Kendi ID'ni güvenli al
            const myId = user?._id || user?.id;

            if (myId) {
                // 3. Backend listesinden BENİ SİL (Böylece kopya oluşamaz)
                usersInThisChannel = usersInThisChannel.filter(u => String(u.userId) !== String(myId));

                // 4. Eğer gerçekten bu kanaldaysam, BENİ GERİ EKLE (Optimistic Update)
                if (currentVoiceChannelId === channel._id) {
                    // (Opsiyonel: Backend'den gelen mute/deaf durumunu korumak istersen find yapabilirsin, şimdilik temiz ekliyoruz)
                    usersInThisChannel.push({
                        userId: myId,
                        username: user.username,
                        socketId: socket?.id || 'temp',
                        isMuted: false, // Local state'den de çekilebilir
                        isDeafened: false
                    });
                }
            }

            return (
              <div
                key={channel._id}
                className="channel-group-item"
                // 🔥 Eventleri buraya koyduk ki tüm alan tutulabilir olsun
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

                {usersInThisChannel.length > 0 && (
                  <div className="voice-channel-users">
                    {usersInThisChannel.map((voiceUser) => {
                      const member = activeServer.members.find(m => m.user && String(m.user._id) === String(voiceUser.userId));
                      const isSelf = String(voiceUser.userId) === String(user?.id);
                      const displayName = member?.user?.username || (isSelf ? user.username : voiceUser.username);

                      let rawAvatar = member?.user?.avatarUrl || member?.user?.avatar;
                      if (!rawAvatar && isSelf) rawAvatar = user.avatarUrl;
                      if (!rawAvatar) rawAvatar = DEFAULT_AVATAR;
                      const absoluteAvatarSrc = rawAvatar.startsWith('/uploads') ? `${API_URL_BASE}${rawAvatar}` : rawAvatar;

                      const isMuted = member?.isMuted || false;
                      const isDeafened = member?.isDeafened || false;
                      const isSpeaking = speakingUsers?.[voiceUser.userId] || false;

                      return (
                        <div
                          key={voiceUser.userId}
                          className={`voice-user-item ${canMoveMembers ? 'draggable' : ''} ${isSpeaking ? 'is-speaking' : ''}`}
                          draggable={canMoveMembers} // Sürüklenebilirlik burada
                          onDragStart={(e) => handleVoiceUserDragStart(e, channel._id, voiceUser.userId)}
                          onDragEnd={handleVoiceUserDragEnd}
                          onContextMenu={(e) => member && handleContextMenu(e, member)}
                        >
                          <div className={`voice-user-avatar ${isSpeaking ? 'speaking' : ''}`}>
                            <img src={absoluteAvatarSrc} alt={displayName} onError={handleAvatarError} />
                            {isSpeaking && <span className="voice-speaking-ring" />}
                          </div>
                          <div className="voice-user-details">
                            <span className={`voice-user-name ${isMuted ? 'text-muted' : ''}`}>{displayName}</span>
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

      {contextMenu && (
        <MemberContextMenu member={contextMenu.member} x={contextMenu.x} y={contextMenu.y} serverId={serverId} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
};

export default ServerView;