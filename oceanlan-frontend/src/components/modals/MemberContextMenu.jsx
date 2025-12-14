// src/components/modals/MemberContextMenu.jsx
import React, { useContext, useState, useRef, useLayoutEffect } from 'react';
import axios from 'axios';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import { checkUserPermission } from '../../utils/permissionChecker';
import { useSocket } from '../../hooks/useSocket';
import UserProfileModal from '../profile/UserProfileModal';
import { AudioSettingsContext } from '../../context/AudioSettingsContext';
// 👇 YENİ HELPER EKLENDİ
import { getImageUrl } from '../../utils/urlHelper';

import "../../styles/MemberContextMenu.css";

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const MemberContextMenu = ({ member, x, y, serverId, onClose }) => {
  const { activeServer, fetchServerDetails } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const { socket } = useSocket();
  const [showProfile, setShowProfile] = useState(false);
  const { userVolumes, setUserVolume } = useContext(AudioSettingsContext);

  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({ top: y, left: x, opacity: 0 });

  // Konumlandırma mantığı
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

  if (!member || !member.user) return null;

  // 👇 AVATAR URL DÜZELTME (Helper Kullanıldı)
  // Bu sayede default avatar hem Web'de hem Electron'da görünür
  const displayAvatarSrc = getImageUrl(member.user.avatarUrl || member.user.avatar);

  // Avatar yüklenemezse helper'daki default'u kullan
  const handleAvatarError = (e) => {
    if (e.target.dataset.fallbackApplied) return;
    e.target.dataset.fallbackApplied = 'true';
    e.target.src = getImageUrl(null);
  };

  const currentVolume = userVolumes[member.user._id] !== undefined ? userVolumes[member.user._id] : 100;
  const isSelf = user?.id === member.user._id;

  // 🛡️ YETKİ KONTROLLERİ
  const userId = user?.id || user?._id;
  const canKick = checkUserPermission(activeServer, userId, 'KICK_MEMBERS');
  const canBan = checkUserPermission(activeServer, userId, 'BAN_MEMBERS');

  // 📢 İSTEDİĞİN ÖZELLİK: Mute/Deafen sadece yetkisi varsa görünür
  const canMute = checkUserPermission(activeServer, userId, 'MUTE_MEMBERS');
  const canDeafen = checkUserPermission(activeServer, userId, 'DEAFEN_MEMBERS');

  const canDisconnect = checkUserPermission(activeServer, userId, 'MOVE_MEMBERS') || checkUserPermission(activeServer, userId, 'ADMINISTRATOR');

  const MEMBER_API_URL = `${API_URL_BASE}/api/v1/servers/${serverId}/members/${member._id}`;

  const handleKick = async () => {
    if (!window.confirm(`${member.user.username} üyesini atmak istiyor musun?`)) return;
    try { await axios.delete(MEMBER_API_URL); fetchServerDetails(serverId); onClose(); }
    catch (e) { alert('Hata: ' + e.message); }
  };

  const handleBan = async () => {
    const reason = prompt('Yasaklama nedeni:');
    if (reason === null) return;
    try { await axios.post(`${MEMBER_API_URL}/ban`, { reason }); socket.emit('memberBanned', { serverId, memberId: member._id }); fetchServerDetails(serverId); onClose(); }
    catch (e) { alert('Hata: ' + e.message); }
  };

  const handleStatusUpdate = async (type) => {
    let payload = type === 'mute' ? { isMuted: !member.isMuted } : { isDeafened: !member.isDeafened };
    try {
      await axios.put(`${MEMBER_API_URL}/status`, payload);
      socket.emit('memberUpdated', { serverId, memberId: member._id, ...payload });
      fetchServerDetails(serverId);
      onClose();
    } catch (e) { alert('Hata: ' + e.message); }
  };

  const handleDisconnect = () => {
      if (!window.confirm('Bağlantıyı kesmek istiyor musun?')) return;
      socket.emit('disconnect-voice-user', { serverId, targetUserId: member.user._id });
      onClose();
  };

  const displayRoles = member.roles?.filter(r => r.name !== '@everyone') || [];

  return (
    <>
      <div className="member-menu-overlay" onClick={onClose}>
        <div ref={menuRef} className="member-menu-panel" style={{ top: menuStyle.top, left: menuStyle.left, opacity: menuStyle.opacity }} onClick={(e) => e.stopPropagation()}>
          <div className="member-menu-header">
            <div className="member-menu-avatar">
              <img
                src={displayAvatarSrc} // ✅ Düzeltilmiş URL
                alt={member.user.username}
                onError={handleAvatarError} // ✅ Düzeltilmiş Hata Yönetimi
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              />
            </div>
            <div className="member-menu-info">
              <div className="member-menu-name clickable" onClick={() => setShowProfile(true)}>{member.user.username}</div>
              <div className="member-menu-sub">{activeServer?.owner?._id === member.user._id && <span style={{color:'#faa61a'}}>👑 Sunucu Sahibi</span>}</div>
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
                    <label className="volume-label">Ses Seviyesi: %{currentVolume}</label>
                    <input type="range"
  min="0"
  max="200"
  value={currentVolume}
  onChange={(e) =>
    setUserVolume(member.user._id, parseInt(e.target.value))
  }
                           className="volume-slider" />
                </div>
            )}

            {!isSelf && <hr className="menu-divider" />}

            {/* 🛡️ SADECE YETKİSİ OLAN GÖRÜR */}
            {canMute && (
              <button className="member-menu-btn" onClick={() => handleStatusUpdate('mute')}>
                {member.isMuted ? 'Susturmayı Kaldır' : 'Sustur'}
              </button>
            )}

            {canDeafen && (
              <button className="member-menu-btn" onClick={() => handleStatusUpdate('deafen')}>
                {member.isDeafened ? 'Sağırlaştırmayı Kaldır' : 'Sağırlaştır'}
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
      {showProfile && <UserProfileModal userId={member.user._id} initialName={member.user.username} onClose={() => { onClose(); setShowProfile(false); }} />}
    </>
  );
};

export default MemberContextMenu;