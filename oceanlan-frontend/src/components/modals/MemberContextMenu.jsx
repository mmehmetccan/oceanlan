// src/components/modals/MemberContextMenu.jsx
import React, { useContext, useState, useRef, useLayoutEffect } from 'react';
import axios from 'axios';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import { checkUserPermission } from '../../utils/permissionChecker';
import { useSocket } from '../../hooks/useSocket';
import UserProfileModal from '../profile/UserProfileModal';
import { AudioSettingsContext } from '../../context/AudioSettingsContext';
import { getImageUrl } from '../../utils/urlHelper';

import "../../styles/MemberContextMenu.css";

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const MemberContextMenu = ({ member, x, y, serverId, onClose }) => {
  const { activeServer, fetchServerDetails } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const { socket } = useSocket();
  const [showProfile, setShowProfile] = useState(false);

  // 🟢 Ses ayarlarını çekiyoruz
  const { userVolumes, setUserVolume } = useContext(AudioSettingsContext);

  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({ top: y, left: x, opacity: 0 });

  useLayoutEffect(() => {
    if (menuRef.current) {
        const { offsetWidth: width, offsetHeight: height } = menuRef.current;
        let newTop = y;
        let newLeft = x;

        if (x + width > window.innerWidth) newLeft = x - width;
        if (y + height > window.innerHeight) newTop = y - height;

        if (newLeft < 0) newLeft = 10;
        if (newTop < 0) newTop = 10;

        setMenuStyle({ top: newTop, left: newLeft, opacity: 1 });
    }
  }, [x, y]);

  if (!member) return null;

  const targetUser = member.user || {};
  const targetUserId = targetUser._id || (typeof member.user === 'string' ? member.user : null);

  if (!targetUserId) return null;

  const displayAvatarSrc = getImageUrl(targetUser.avatarUrl || targetUser.avatar);

  const handleAvatarError = (e) => {
    if (e.target.dataset.fallbackApplied) return;
    e.target.dataset.fallbackApplied = 'true';
    e.target.src = getImageUrl(null);
  };

  // 🟢 YEREL SES KONTROLÜ
  const currentVolume = userVolumes[targetUserId] !== undefined ? userVolumes[targetUserId] : 100;
  const isLocalMuted = currentVolume === 0;

  const isSelf = user?.id === targetUserId;
  const currentUserId = user?.id || user?._id;

  // Yetkiler
  const canKick = checkUserPermission(activeServer, currentUserId, 'KICK_MEMBERS');
  const canBan = checkUserPermission(activeServer, currentUserId, 'BAN_MEMBERS');
  const canDeafen = checkUserPermission(activeServer, currentUserId, 'DEAFEN_MEMBERS'); // Sunucu Sağırlaştırması
  const canDisconnect = checkUserPermission(activeServer, currentUserId, 'MOVE_MEMBERS') || checkUserPermission(activeServer, currentUserId, 'ADMINISTRATOR');

  const MEMBER_API_URL = `${API_URL_BASE}/api/v1/servers/${serverId}/members/${member._id}`;

  const handleKick = async () => {
    if (!window.confirm(`${targetUser.username} atılsın mı?`)) return;
    try {
      await axios.delete(MEMBER_URL);
      fetchServerDetails(serverId);
      onClose();
    } catch (e) { alert("Hata: " + e.response?.data?.message); }
  };

  const handleBan = async () => {
    const reason = prompt(`${targetUser.username} için yasaklama nedeni:`);
    if (reason === null) return;
    try {
      await axios.post(`${MEMBER_URL}/ban`, { reason });
      // Kullanıcı online ise socket üzerinden de düşür
      if (isOnline) socket.emit('force_disconnect', { targetUserId: targetUser._id });
      fetchServerDetails(serverId);
      onClose();
    } catch (e) { alert("Hata: " + e.response?.data?.message); }
  };

  // 🟢 Sunucu Genelinde Sustur (Server Mute)
  const handleServerMute = async () => {
    try {
      const newStatus = !member.isMuted;
      await axios.put(`${MEMBER_URL}/status`, { isMuted: newStatus });
      socket.emit('memberUpdated', { serverId, memberId: member._id, isMuted: newStatus });
      fetchServerDetails(serverId);
      onClose();
    } catch (e) { alert("Hata: " + e.response?.data?.message); }
  };

  // 🟢 SUNUCU SAĞIRLAŞTIRMA (O kişi kimseyi duyamaz - Yetki gerekir)
  const handleServerDeafen = async () => {
    let payload = { isDeafened: !member.isDeafened };
    try {
      await axios.put(`${MEMBER_API_URL}/status`, payload);
      socket.emit('memberUpdated', { serverId, memberId: member._id, ...payload });
      fetchServerDetails(serverId);
      onClose();
    } catch (e) { alert('Hata: ' + e.message); }
  };

  const handleDisconnect = () => {
      if (!window.confirm('Bağlantıyı kesmek istiyor musun?')) return;
      socket.emit('disconnect-voice-user', { serverId, targetUserId: targetUserId });
      onClose();
  };

  const displayRoles = member.roles?.filter(r => r.name !== '@everyone') || [];

  return (
    <>
      <div className="member-menu-overlay" onClick={onClose}>
        <div ref={menuRef} className="member-menu-panel" style={{ top: menuStyle.top, left: menuStyle.left, opacity: menuStyle.opacity }} onClick={(e) => e.stopPropagation()}>
          <div className="member-menu-header">
            <div className="member-menu-avatar">
              <img src={displayAvatarSrc} alt={targetUser.username} onError={handleAvatarError} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            </div>
            <div className="member-menu-info">
              <div className="member-menu-name clickable" onClick={() => setShowProfile(true)}>{targetUser.username || 'Kullanıcı'}</div>
              <div className="member-menu-sub">{activeServer?.owner?._id === targetUserId && <span style={{color:'#faa61a'}}>👑 Sunucu Sahibi</span>}</div>
              <div className="member-menu-roles">
                  {displayRoles.length > 0 ? displayRoles.map(r => (
                      <span key={r._id} className="menu-role-badge" style={{color:r.color||'#b9bbbe', borderColor:r.color||'#4f545c'}}>{r.name}</span>
                  )) : <span className="menu-role-badge no-role">Rol Yok</span>}
              </div>
            </div>
          </div>

          <div className="member-menu-actions">
            {!isSelf && (
                <div className="volume-control-group">
                    <label className="volume-label" style={{display:'flex', justifyContent:'space-between'}}>
                        <span>Ses Seviyesi</span>
                        <span>%{currentVolume}</span>
                    </label>
                    <input
                        type="range" min="0" max="200"
                        value={currentVolume}
                        onChange={(e) => setUserVolume(targetUserId, parseInt(e.target.value))}
                        className="volume-slider"
                    />
                </div>
            )}

            {!isSelf && <hr className="menu-divider" />}

            {/* 🟢 YEREL SUSTURMA BUTONU (Herkes kullanabilir) */}
            {!isSelf && (
              <button className="member-menu-btn" onClick={handleLocalMute}>
                {isLocalMuted ? 'Susturmayı Kaldır (Yerel)' : 'Sustur (Yerel)'}
              </button>
            )}

            {/* 🟢 SUNUCU SAĞIRLAŞTIRMA (Sadece yetkililer) */}
            {canDeafen && (
              <button className="member-menu-btn" onClick={handleServerDeafen}>
                {member.isDeafened ? 'Sağırlaştırmayı Kaldır (Sunucu)' : 'Sağırlaştır (Sunucu)'}
              </button>
            )}

            {canDisconnect && (
                <button className="member-menu-btn danger" onClick={handleDisconnect}>Bağlantıyı Kes</button>
            )}

            {(canKick || canBan) && <hr className="menu-divider" />}
            {canKick && <button className="member-menu-btn danger" onClick={handleKick}>Sunucudan At</button>}
            {canBan && <button className="member-menu-btn danger" onClick={handleBan}>Sunucudan Yasakla</button>}
          </div>
        </div>
      </div>
      {showProfile && <UserProfileModal userId={targetUserId} initialName={targetUser.username} onClose={() => { onClose(); setShowProfile(false); }} />}
    </>
  );
};

export default MemberContextMenu;