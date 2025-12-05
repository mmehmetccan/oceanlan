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
import { UserPlusIcon, Cog6ToothIcon, UsersIcon } from '@heroicons/react/24/outline'; // İkonlar güncellendi
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
  const [dragOverChannelId, setDragOverChannelId] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // YETKİLER
  const isOwner = activeServer && user && (
      (activeServer.owner?._id?.toString() === user.id?.toString()) ||
      (activeServer.owner?.toString() === user.id?.toString())
  );

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
      <header className="server-view-header" style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'auto', // Yüksekliği otomatik yap
          padding: '0',
          backgroundColor: '#2f3136'
      }}>
        {/* Üst Kısım: Resim ve İsim */}
        <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 16px 12px 16px',
            borderBottom: '1px solid #202225'
        }}>
            <div className="server-avatar-chip" style={{ overflow: 'hidden', padding: 0, background: serverIconUrl ? 'transparent' : '', width: '48px', height: '48px', marginRight: '12px' }}>
                {serverIconUrl ? (
                <img src={serverIconUrl} alt={activeServer.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; e.target.parentNode.innerText = serverInitial; }} />
                ) : (serverInitial)}
            </div>
            <h2 className="server-name" style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: 'white' }}>
                {activeServer.name}
            </h2>
        </div>

        {/* Alt Kısım: Toolbar (İstatistikler ve Butonlar) */}
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            backgroundColor: 'rgba(32, 34, 37, 0.6)',
            fontSize: '13px',
            color: '#b9bbbe'
        }}>
            {/* Sol: Üye Sayısı */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <UsersIcon style={{ width: 16 }} />
                <span>{serverMemberCount} Üye</span>
            </div>

            {/* Sağ: Aksiyon Butonları (Yazının altına alındı) */}
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={() => setShowInviteModal(true)}
                    title="İnsanları Davet Et"
                    style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        background: '#5865F2', border: 'none', borderRadius: '4px',
                        color: 'white', padding: '4px 8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600'
                    }}
                >
                    <UserPlusIcon style={{ width: 14 }} /> Davet
                </button>

                {canManageServer && (
                    <Link
                        to={`/dashboard/server/${serverId}/settings`}
                        title="Sunucu Ayarları"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            background: '#4f545c', border: 'none', borderRadius: '4px',
                            color: 'white', padding: '4px 8px', cursor: 'pointer', textDecoration: 'none', fontSize: '12px', fontWeight: '600'
                        }}
                    >
                        <Cog6ToothIcon style={{ width: 14 }} /> Ayarlar
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
                style={isDragOver ? { border: '2px dashed #43b581', backgroundColor: 'rgba(67, 181, 129, 0.1)' } : {}}
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

                      const isMuted = member?.isMuted || false;
                      const isDeafened = member?.isDeafened || false;
                      const isSpeaking = speakingUsers && speakingUsers[voiceUser.userId];

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

      {showInviteModal && <ServerInviteModal serverId={serverId} onClose={() => setShowInviteModal(false)} />}

      {contextMenu && (
        <MemberContextMenu member={contextMenu.member} x={contextMenu.x} y={contextMenu.y} serverId={serverId} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
};

export default ServerView;