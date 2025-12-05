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

const getBaseUrl = () => {
  const url = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  return url.replace(/\/api\/v1\/?$/, '');
};
const BASE_URL = getBaseUrl();

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

  const { activeServer, loading, fetchServerDetails, setActiveChannel } =
    useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const { socket } = useSocket();
  const { addToast } = useContext(ToastContext);
  const { joinVoiceChannel, currentVoiceChannelId, speakingUsers } =
    useContext(VoiceContext);

  useServerSocket(serverId);

  const [voiceState, setVoiceState] = useState({});
  const [contextMenu, setContextMenu] = useState(null);
  const [draggedUser, setDraggedUser] = useState(null);

  const canMoveMembers =
    activeServer &&
    (checkUserPermission(activeServer, user?.id, 'MUTE_MEMBERS') ||
      checkUserPermission(activeServer, user?.id, 'ADMINISTRATOR'));

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

    if (
      activeServer &&
      activeServer._id === serverId &&
      activeServer.channels.length > 0 &&
      !location.pathname.includes('/channel/') &&
      !location.pathname.includes('/settings') &&
      !currentVoiceChannelId
    ) {
      const defaultChannel =
        activeServer.channels.find((c) => c.type === 'text') ||
        activeServer.channels[0];
      if (defaultChannel) {
        navigate(
          `/dashboard/server/${serverId}/channel/${defaultChannel._id}`,
          { replace: true }
        );
        setActiveChannel(defaultChannel);
      }
    }
  }, [serverId, activeServer, navigate, location.pathname, fetchServerDetails, currentVoiceChannelId, setActiveChannel]);

  // Socket Listener
  useEffect(() => {
    if (!socket || !serverId) return;

    const handleVoiceStateUpdate = (newServerVoiceState) => {
      // Backend'den gelen veriyi state'e yaz
      // Bu, diğer kullanıcıların hareketlerini görmeni sağlar
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
    socket.on('roleUpdated', refetchServer);
    socket.on('roleDeleted', refetchServer);
    socket.on('join-voice-error', handleJoinVoiceError);

    // İlk açılışta mevcut durumu iste
    socket.emit('get-server-voice-state', serverId);

    return () => {
      socket.off('voiceStateUpdate', handleVoiceStateUpdate);
      socket.off('memberUpdated', handleMemberUpdate);
      socket.off('channelCreated', refetchServer);
      socket.off('channelUpdated', refetchServer);
      socket.off('channelDeleted', refetchServer);
      socket.off('roleUpdated', refetchServer);
      socket.off('roleDeleted', refetchServer);
      socket.off('join-voice-error', handleJoinVoiceError);
    };
  }, [socket, serverId, fetchServerDetails, addToast]);

  const handleContextMenu = (e, member) => {
    e.preventDefault();
    if (!member || !member.user || member.user._id === user.id) return;
    setContextMenu({ x: e.pageX, y: e.pageY, member });
  };

  const handleVoiceUserDragStart = (e, fromChannelId, userId) => {
    if (!canMoveMembers) return;
    setDraggedUser({ fromChannelId, userId });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleVoiceUserDragEnd = () => setDraggedUser(null);

  const handleVoiceChannelDragOver = (e, channel) => {
    if (!draggedUser || !canMoveMembers || channel.type !== 'voice' || draggedUser.fromChannelId === channel._id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleVoiceChannelDrop = (e, channel) => {
    e.preventDefault();
    if (!draggedUser || !canMoveMembers || channel.type !== 'voice' || draggedUser.fromChannelId === channel._id) return;
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

  const serverMemberCount = activeServer?.members?.length ?? 0;
  const textChannels = activeServer.channels.filter((c) => c.type === 'text');
  const voiceChannels = activeServer.channels.filter((c) => c.type === 'voice');

  const serverIconUrl = activeServer?.iconUrl
    ? activeServer.iconUrl.startsWith('http') ? activeServer.iconUrl : `${BASE_URL}${activeServer.iconUrl}`
    : null;

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
            <span className="server-subtitle">{serverMemberCount} Üye</span>
          </div>
        </div>
      </header>

      {checkUserPermission(activeServer, user?.id, 'ADMINISTRATOR') && (
        <div className="server-view-toolbar">
          <Link to={`/dashboard/server/${serverId}/settings`} className="server-settings-button">⚙ Sunucu Ayarları</Link>
        </div>
      )}

      <div className="channels-list">
        {/* Metin Kanalları */}
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

        {/* Ses Kanalları */}
        <div className="channel-group voice-channels-group">
          <h3>🎤 Ses Kanalları</h3>
          {voiceChannels.map((channel) => {
            const isActiveVoice = currentVoiceChannelId === channel._id;
            const isDropTarget = draggedUser && canMoveMembers && draggedUser.fromChannelId !== channel._id;

            // 🟢 OPTIMISTIC UI: Anında Güncelleme Mantığı
            let usersInThisChannel = [...(voiceState[channel._id] || [])];

            // 1. Ben bu kanaldaysam ve listede yoksam, beni ekle
            if (currentVoiceChannelId === channel._id && user) {
                const amIInList = usersInThisChannel.find(u => String(u.userId) === String(user.id));
                if (!amIInList) {
                    usersInThisChannel.push({
                        userId: user.id,
                        socketId: socket?.id || 'temp',
                        username: user.username,
                        isMuted: false,
                        isDeafened: false
                    });
                }
            }

            // 2. Başka kanaldaysam eski kanaldan sil
            if (currentVoiceChannelId !== channel._id && user) {
                usersInThisChannel = usersInThisChannel.filter(u => String(u.userId) !== String(user.id));
            }

            return (
              <div key={channel._id} className="channel-group-item">
                <button
                  className={`channel-item voice-channel ${isActiveVoice ? 'active' : ''} ${isDropTarget ? 'drop-target' : ''}`}
                  onClick={() => handleJoinVoiceChannel(channel)}
                  onDragOver={(e) => handleVoiceChannelDragOver(e, channel)}
                  onDrop={(e) => handleVoiceChannelDrop(e, channel)}
                >
                  <div className="channel-main">
                    <span className="channel-icon">🎤</span>
                    <span className="channel-name">{channel.name}</span>
                  </div>
                  <div className="channel-meta">
                    <span className="channel-occupancy">{usersInThisChannel.length} / {channel.maxUsers || '∞'}</span>
                  </div>
                </button>

                {usersInThisChannel.length > 0 && (
                  <div className="voice-channel-users">
                    {usersInThisChannel.map((voiceUser) => {
                      const member = activeServer.members.find((m) => m.user && String(m.user._id) === String(voiceUser.userId));
                      const isSelf = String(voiceUser.userId) === String(user?.id);

                      const displayName = member?.user?.username || (isSelf ? user.username : voiceUser.username) || 'Kullanıcı';

                      // 🟢 AVATAR DÜZELTMESİ: Önce member'a bak, yoksa isSelf ise kendi Auth verime bak
                      let rawAvatar = member?.user?.avatarUrl || member?.user?.avatar;
                      if (!rawAvatar && isSelf && user.avatarUrl) {
                          rawAvatar = user.avatarUrl; // AuthContext'ten al
                      }
                      if (!rawAvatar) rawAvatar = DEFAULT_AVATAR;

                      const absoluteAvatarSrc = rawAvatar.startsWith('/uploads') ? `${API_URL_BASE}${rawAvatar}` : rawAvatar;

                      const isMuted = member?.isMuted;
                      const isDeafened = member?.isDeafened;
                      const statusClass = isDeafened ? 'status-deafened' : isMuted ? 'status-muted' : 'status-live';
                      const isSpeaking = speakingUsers?.[voiceUser.userId] || speakingUsers?.[voiceUser.socketId];

                      return (
                        <div
                          key={voiceUser.userId}
                          className={`voice-user-item ${canMoveMembers ? 'draggable' : ''} ${isSelf ? 'voice-user-item-self' : ''} ${isSpeaking ? 'is-speaking' : ''}`}
                          draggable={canMoveMembers}
                          onDragStart={(e) => handleVoiceUserDragStart(e, channel._id, voiceUser.userId)}
                          onDragEnd={handleVoiceUserDragEnd}
                          onContextMenu={(e) => member && handleContextMenu(e, member)}
                        >
                          <div className={`voice-user-avatar ${statusClass} ${isSpeaking ? 'speaking' : ''}`}>
                            <img src={absoluteAvatarSrc} alt={displayName} onError={handleAvatarError} />
                            {isSpeaking && <span className="voice-speaking-ring" />}
                          </div>
                          <div className="voice-user-details">
                            <span className={`voice-user-name ${isMuted ? 'text-muted' : ''}`}>{displayName}</span>
                            <div className="voice-user-tags">
                              {isSelf && <span className="voice-user-tag">Sen</span>}
                              {isMuted && <span className="voice-user-tag voice-user-tag-muted">Mute</span>}
                              {isDeafened && <span className="voice-user-tag voice-user-tag-deafened">Deaf</span>}
                            </div>
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