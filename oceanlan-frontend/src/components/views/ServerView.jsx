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
import ScreenShareDisplay from '../chat/ScreenShareDisplay'; // YENİ IMPORT
import '../../styles/ServerView.css';

const DEFAULT_AVATAR = '/default-avatar.png';
const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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

  const {
    activeServer,
    loading,
    fetchServerDetails,
    setActiveChannel,
  } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const { socket } = useSocket();
  const { addToast } = useContext(ToastContext);
  const { joinVoiceChannel, currentVoiceChannelId } = useContext(VoiceContext);

  // Socket ile server odasına katıl
  useServerSocket(serverId);

  const [voiceState, setVoiceState] = useState({});
  const [contextMenu, setContextMenu] = useState(null);
  const [draggedUser, setDraggedUser] = useState(null); // { fromChannelId, userId }

  const canMoveMembers =
    activeServer &&
    (checkUserPermission(activeServer, user?.id, 'MUTE_MEMBERS') ||
      checkUserPermission(activeServer, user?.id, 'ADMINISTRATOR'));

  const handleJoinVoiceChannel = (channelId) => {
    if (!serverId || !channelId) return;
    joinVoiceChannel(serverId, channelId);
  };

  // Sunucu yüklendiğinde varsayılan metin kanala yönlendirme
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
        navigate(`/dashboard/server/${serverId}/channel/${defaultChannel._id}`, {
          replace: true,
        });
        setActiveChannel(defaultChannel);
      }
    }
  }, [
    serverId,
    activeServer,
    navigate,
    location.pathname,
    fetchServerDetails,
    currentVoiceChannelId,
    setActiveChannel,
  ]);

  // Socket dinleyicileri (voice state + server refresh)
  useEffect(() => {
    if (!socket || !serverId) return;

    const handleVoiceStateUpdate = (newServerVoiceState) => {
      setVoiceState(newServerVoiceState || {});
    };

    const handleMemberUpdate = () => {
      fetchServerDetails(serverId);
    };

    const refetchServer = () => {
      fetchServerDetails(serverId);
    };

    const handleJoinVoiceError = (error) => {
      addToast(error.message || 'Ses kanalına bağlanırken hata oluştu.', 'error');
    };

    socket.on('voiceStateUpdate', handleVoiceStateUpdate);
    socket.on('memberUpdated', handleMemberUpdate);
    socket.on('channelCreated', refetchServer);
    socket.on('channelUpdated', refetchServer);
    socket.on('channelDeleted', refetchServer);
    socket.on('roleUpdated', refetchServer);
    socket.on('roleDeleted', refetchServer);
    socket.on('join-voice-error', handleJoinVoiceError);

    // 🔹 EN ÖNEMLİ KISIM: listener'lar kurulduktan SONRA anlık voice state'i iste
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

  // Sağ tık → context menu (mute/kick/ban)
  const handleContextMenu = (e, member) => {
    e.preventDefault();
    if (!member || !member.user || member.user._id === user.id) return;
    setContextMenu({ x: e.pageX, y: e.pageY, member });
  };

  // Drag & Drop: kullanıcıyı ses kanalından kanala taşıma
  const handleVoiceUserDragStart = (e, fromChannelId, userId) => {
    if (!canMoveMembers) return;
    setDraggedUser({ fromChannelId, userId });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleVoiceUserDragEnd = () => {
    setDraggedUser(null);
  };

  const handleVoiceChannelDragOver = (e, channel) => {
    if (!draggedUser || !canMoveMembers) return;
    if (channel.type !== 'voice') return;
    if (draggedUser.fromChannelId === channel._id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleVoiceChannelDrop = (e, channel) => {
    e.preventDefault();
    if (!draggedUser || !canMoveMembers) return;
    if (channel.type !== 'voice') return;
    if (draggedUser.fromChannelId === channel._id) return;

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

  const serverInitial =
    activeServer?.name?.charAt(0)?.toUpperCase() || activeServer?.name || '#';
  const serverMemberCount = activeServer?.members?.length ?? activeServer?.memberCount;

  // Kanalları tipe göre ayırıyoruz
  const textChannels = activeServer.channels.filter(c => c.type === 'text');
  const voiceChannels = activeServer.channels.filter(c => c.type === 'voice');

  return (
      <div className="server-view" onClick={() => setContextMenu(null)}>

        <header className="server-view-header">
          <div className="server-title-block">
            <div className="server-avatar-chip" aria-hidden="true">
              {serverInitial}
            </div>
            <div className="server-title-text">
              <h2 className="server-name">{activeServer.name}</h2>
              <span className="server-subtitle">
                {serverMemberCount ? `${serverMemberCount} Üye` : 'Sunucu Paneli'}
              </span>
            </div>
          </div>
        </header>

        {checkUserPermission(activeServer, user?.id, 'ADMINISTRATOR') && (
          <div className="server-view-toolbar">
            <Link
              to={`/dashboard/server/${serverId}/settings`}
              className="server-settings-button"
              aria-label="Sunucu ayarlarını aç"
            >
              <span className="settings-icon" aria-hidden="true">
                ⚙
              </span>
              <span>Sunucu Ayarları</span>
            </Link>
          </div>
        )}

        {/* KANALLAR */}
        <div className="channels-list">

          {/* --- METİN KANALLARI GRUBU --- */}
          <div className="channel-group text-channels-group">
            <h3># Metin Kanalları</h3>
            {textChannels.length === 0 ? (
                <p className="channel-group-empty">Metin kanalı bulunamadı.</p>
            ) : (
                textChannels.map((channel) => {
                  const isActive = location.pathname.includes(`/channel/${channel._id}`);

                  return (
                      <Link
                          key={channel._id}
                          to={`/dashboard/server/${serverId}/channel/${channel._id}`}
                          className={`channel-item text-channel ${isActive ? 'active' : ''}`}
                          onClick={() => setActiveChannel(channel)}
                      >
                        <div className="channel-main">
                          <span className="channel-icon">#</span>
                          <span className="channel-name">{channel.name}</span>
                        </div>
                      </Link>
                  );
                })
            )}
          </div>

          {/* --- SES KANALLARI GRUBU --- */}
          <div className="channel-group voice-channels-group">
            <h3>🎤 Ses Kanalları</h3>
            {voiceChannels.length === 0 ? (
                <p className="channel-group-empty">Ses kanalı bulunamadı.</p>
            ) : (
                voiceChannels.map((channel) => {
                  const isActiveVoice = currentVoiceChannelId === channel._id;
                  const isDropTarget =
                      draggedUser &&
                      canMoveMembers &&
                      draggedUser.fromChannelId !== channel._id;

                  return (
                      <div key={channel._id} className="channel-group-item">
                        <button
                            className={`channel-item voice-channel ${
                                isActiveVoice ? 'active' : ''
                            } ${isDropTarget ? 'drop-target' : ''}`}
                            onClick={() => handleJoinVoiceChannel(channel._id)}
                            onDragOver={(e) => handleVoiceChannelDragOver(e, channel)}
                            onDrop={(e) => handleVoiceChannelDrop(e, channel)}
                        >
                          <div className="channel-main">
                            <span className="channel-icon">🎤</span>
                            <span className="channel-name">{channel.name}</span>
                          </div>
                          <div className="channel-meta">
                      <span className="channel-occupancy">
                        {voiceState[channel._id]?.length || 0} /{' '}
                        {channel.maxUsers || '∞'}
                      </span>
                          </div>
                        </button>

                        {/* SES KANALINDAKİ KULLANICILAR */}
                        {/* ... (Bu kısım önceki yanıttaki avatar zorlaması dahil olmak üzere aynı kalmalıdır) */}
                        {voiceState[channel._id] &&
                            voiceState[channel._id].length > 0 && (
                                <div className="voice-channel-users">
                                  {voiceState[channel._id].map((voiceUser) => {
                                    // ... Avatar çekme ve zorlama mantığı buraya gelir
                                    const member = activeServer.members.find(
                                        (m) => m.user && m.user._id === voiceUser.userId
                                    );
                                    const avatarSrc =
                                        member?.user?.avatarUrl ||
                                        member?.user?.avatar ||
                                        DEFAULT_AVATAR;
                                    const absoluteAvatarSrc = avatarSrc.startsWith('/uploads')
                                        ? `${API_URL_BASE}${avatarSrc}`
                                        : avatarSrc;
                                    const voiceUserStatusClass = member?.isDeafened
                                      ? 'status-deafened'
                                      : member?.isMuted
                                      ? 'status-muted'
                                      : 'status-live';
                                    const isCurrentUser = voiceUser.userId === user?.id;
                                    const voiceUserItemClassNames = [
                                      'voice-user-item',
                                      canMoveMembers ? 'draggable' : '',
                                      isCurrentUser ? 'voice-user-item-self' : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ');

                                    return (
                                        <div
                                            key={voiceUser.userId}
                                            className={voiceUserItemClassNames}
                                            draggable={canMoveMembers}
                                            onDragStart={(e) =>
                                                handleVoiceUserDragStart(
                                                    e,
                                                    channel._id,
                                                    voiceUser.userId
                                                )
                                            }
                                            onDragEnd={handleVoiceUserDragEnd}
                                            onContextMenu={(e) =>
                                                member && handleContextMenu(e, member)
                                            }
                                        >
                                          <div className={`voice-user-avatar ${voiceUserStatusClass}`}>
                                            <img
                                                src={absoluteAvatarSrc}
                                                alt={`${voiceUser.username} avatar`}
                                                onError={handleAvatarError}
                                            />
                                          </div>
                                          <div className="voice-user-details">
                                            <span
                                                className={`voice-user-name ${
                                                    member?.isMuted ? 'text-muted' : ''
                                                }`}
                                            >
                                              {voiceUser.username}
                                            </span>
                                            <div className="voice-user-tags">
                                              {isCurrentUser && (
                                                <span className="voice-user-tag">Sen</span>
                                              )}
                                              {member?.isMuted && (
                                                <span className="voice-user-tag voice-user-tag-muted">
                                                  Mute
                                                </span>
                                              )}
                                              {member?.isDeafened && (
                                                <span className="voice-user-tag voice-user-tag-deafened">
                                                  Deaf
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                    );
                                  })}
                                </div>
                            )}
                      </div>
                  );
                })
            )}
          </div>

        </div>

        {/* Sağ tık menüsü (Mute / Deafen / Kick / Ban) */}
        {contextMenu && (
            <MemberContextMenu
                member={contextMenu.member}
                x={contextMenu.x}
                y={contextMenu.y}
                serverId={serverId}
                onClose={() => setContextMenu(null)}
            />
        )}
      </div>
  );
};

export default ServerView;
