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
import ServerInviteModal from '../modals/ServerInviteModal';
import { UserPlusIcon, Cog6ToothIcon, UsersIcon } from '@heroicons/react/24/solid'; // Solid ikonlar daha net
import '../../styles/ServerView.css';

const DEFAULT_AVATAR = `${API_URL_BASE}/uploads/default-avatar.png`;

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
  const [dragOverChannelId, setDragOverChannelId] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // 🛠️ YETKİ KONTROLÜ (GÜÇLENDİRİLMİŞ)
  const isOwner = React.useMemo(() => {
      if (!activeServer || !user) return false;
      const ownerId = activeServer.owner?._id || activeServer.owner; // Populate edilmişse _id, değilse direkt string
      const myId = user._id || user.id; // Context bazen _id bazen id verebilir
      return String(ownerId) === String(myId);
  }, [activeServer, user]);

  const canManageServer = activeServer && (
      isOwner ||
      checkUserPermission(activeServer, user?.id, 'ADMINISTRATOR') ||
      checkUserPermission(activeServer, user?.id, 'MANAGE_SERVER')
  );

  const canMoveMembers = activeServer && (
      isOwner ||
      checkUserPermission(activeServer, user?.id, 'MUTE_MEMBERS') ||
      checkUserPermission(activeServer, user?.id, 'ADMINISTRATOR') ||
      checkUserPermission(activeServer, user?.id, 'MOVE_MEMBERS')
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
    // Varsayılan kanal
    if (activeServer && activeServer._id === serverId && activeServer.channels.length > 0 && !location.pathname.includes('/channel/') && !location.pathname.includes('/settings') && !currentVoiceChannelId) {
      const defaultChannel = activeServer.channels.find((c) => c.type === 'text') || activeServer.channels[0];
      if (defaultChannel) {
        navigate(`/dashboard/server/${serverId}/channel/${defaultChannel._id}`, { replace: true });
        setActiveChannel(defaultChannel);
      }
    }
  }, [serverId, activeServer, navigate, location.pathname, fetchServerDetails, currentVoiceChannelId, setActiveChannel]);

  // Socket
  useEffect(() => {
    if (!socket || !serverId) return;

    const handleVoiceStateUpdate = (newServerVoiceState) => setVoiceState({ ...(newServerVoiceState || {}) });
    const refetch = () => fetchServerDetails(serverId);
    const handleError = (error) => addToast(error.message, 'error');

    socket.on('voiceStateUpdate', handleVoiceStateUpdate);
    socket.on('memberUpdated', refetch);
    socket.on('channelCreated', refetch);
    socket.on('channelUpdated', refetch);
    socket.on('channelDeleted', refetch);
    socket.on('join-voice-error', handleError);

    socket.emit('get-server-voice-state', serverId);

    return () => {
      socket.off('voiceStateUpdate', handleVoiceStateUpdate);
      socket.off('memberUpdated', refetch);
      socket.off('channelCreated', refetch);
      socket.off('channelUpdated', refetch);
      socket.off('channelDeleted', refetch);
      socket.off('join-voice-error', handleError);
    };
  }, [socket, serverId, fetchServerDetails, addToast]);

  // DRAG & DROP
  const handleVoiceUserDragStart = (e, fromChannelId, userId) => {
    if (!canMoveMembers) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData("text/plain", userId);
    setDraggedUser({ fromChannelId, userId });
  };

  const handleVoiceUserDragEnd = () => { setDraggedUser(null); setDragOverChannelId(null); };

  const handleVoiceChannelDragOver = (e, channel) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedUser || !canMoveMembers) { e.dataTransfer.dropEffect = 'none'; return; }
    if (draggedUser.fromChannelId === channel._id) { e.dataTransfer.dropEffect = 'none'; setDragOverChannelId(null); return; }
    e.dataTransfer.dropEffect = 'move';
    setDragOverChannelId(channel._id);
  };

  const handleVoiceChannelDrop = (e, channel) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverChannelId(null);
    if (!draggedUser || !canMoveMembers || draggedUser.fromChannelId === channel._id) return;

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
  const serverMemberCount = activeServer.members?.length || 0;

  return (
    <div className="server-view" onClick={() => setContextMenu(null)}>

      {/* 🎨 YENİ HEADER TASARIMI */}
      <header className="server-view-header">

        {/* Üst: İsim ve Logo */}
        <div className="server-header-top">
            <div className="server-avatar-chip">
                {serverIconUrl ? (
                <img src={serverIconUrl} alt={activeServer.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; e.target.parentNode.innerText = serverInitial; }} />
                ) : (serverInitial)}
            </div>
            <h2 className="server-name">{activeServer.name}</h2>
        </div>

        {/* Alt: Butonlar ve Bilgi */}
        <div className="server-header-toolbar">
            <div className="server-stat-badge">
                <UsersIcon style={{ width: 14 }} />
                <span>{serverMemberCount}</span>
            </div>

            <div className="server-actions">
                <button
                    className="action-btn invite"
                    onClick={() => setShowInviteModal(true)}
                    title="Davet Et"
                >
                    <UserPlusIcon /> Davet Et
                </button>

                {canManageServer && (
                    <Link to={`/dashboard/server/${serverId}/settings`} className="action-btn" title="Ayarlar">
                        <Cog6ToothIcon /> Ayarlar
                    </Link>
                )}
            </div>
        </div>
      </header>

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
            const isDragOver = dragOverChannelId === channel._id;

            // DUPLICATE & OPTIMISTIC UI
            let usersInThisChannel = [...(voiceState[channel._id] || [])];
            const myId = user?._id || user?.id;

            if (myId) {
                usersInThisChannel = usersInThisChannel.filter(u => String(u.userId) !== String(myId));
                if (currentVoiceChannelId === channel._id) {
                    usersInThisChannel.push({
                        userId: myId,
                        username: user.username,
                        socketId: socket?.id || 'temp',
                        isMuted: false,
                        isDeafened: false
                    });
                }
            }

            return (
              <div
                key={channel._id}
                className={`channel-group-item ${isDragOver ? 'drag-over-active' : ''}`}
                onDragOver={(e) => handleVoiceChannelDragOver(e, channel)}
                onDrop={(e) => handleVoiceChannelDrop(e, channel)}
              >
                <button
                  className={`channel-item voice-channel ${isActiveVoice ? 'active' : ''}`}
                  onClick={() => handleJoinVoiceChannel(channel)}
                  style={{ pointerEvents: draggedUser ? 'none' : 'auto' }}
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

                      // 🟢 YEŞİL IŞIK KONTROLÜ
                      const isSpeaking = speakingUsers && speakingUsers[voiceUser.userId];
                      const isMuted = member?.isMuted || false;
                      const isDeafened = member?.isDeafened || false;

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
                            <img
                                src={absoluteAvatarSrc}
                                alt={displayName}
                                onError={handleAvatarError}
                                draggable="false"
                                style={{ pointerEvents: 'none' }}
                            />
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

      {showInviteModal && <ServerInviteModal serverId={serverId} onClose={() => setShowInviteModal(false)} />}

      {contextMenu && (
        <MemberContextMenu member={contextMenu.member} x={contextMenu.x} y={contextMenu.y} serverId={serverId} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
};

export default ServerView;