// src/components/modals/MemberContextMenu.jsx
import React, { useContext, useState, useRef, useLayoutEffect } from 'react';
import axios from 'axios';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import { ToastContext } from '../../context/ToastContext';
import { checkUserPermission } from '../../utils/permissionChecker';
import { useSocket } from '../../hooks/useSocket';
import UserProfileModal from '../profile/UserProfileModal';
import "../../styles/MemberContextMenu.css"
import { AudioSettingsContext } from '../../context/AudioSettingsContext';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const DEFAULT_AVATAR = '/default-avatar.png';

const getAvatarUrl = (entity) =>
  entity?.user?.avatarUrl || entity?.user?.avatar || entity?.avatarUrl || entity?.avatar || DEFAULT_AVATAR;

const handleAvatarError = (e) => {
  if (e?.target?.dataset?.fallbackApplied === 'true') return;
  if (e?.target) {
    e.target.dataset.fallbackApplied = 'true';
    e.target.src = DEFAULT_AVATAR;
  }
};

const getDisplayAvatarUrl = (rawUrl) => {
    if (rawUrl.startsWith('/uploads')) {
        return `${API_URL_BASE}${rawUrl}`;
    }
    return rawUrl;
};

const MemberContextMenu = ({ member, x, y, serverId, onClose }) => {
  const { activeServer, fetchServerDetails } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const { socket } = useSocket();
  const [showProfile, setShowProfile] = useState(false);
  const { userVolumes, setUserVolume } = useContext(AudioSettingsContext);

  // 📢 YENİ: Konumlandırma için Ref ve State
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({ top: y, left: x, opacity: 0 }); // İlk başta görünmez yap

  // 📢 YENİ: Ekran taşmasını önleyen mantık
  useLayoutEffect(() => {
    if (menuRef.current) {
        const { offsetWidth: width, offsetHeight: height } = menuRef.current;
        let newTop = y;
        let newLeft = x;

        // Sağa taşıyor mu? (Menü genişliği ekranı geçiyor mu?)
        if (x + width > window.innerWidth) {
            newLeft = x - width; // Sola kaydır
        }

        // Aşağı taşıyor mu? (Menü yüksekliği ekranı geçiyor mu?)
        if (y + height > window.innerHeight) {
            newTop = y - height; // Yukarı kaydır
        }

        // Sola veya yukarı çok gittiyse sıfırla (Negatif olmasın)
        if (newLeft < 0) newLeft = 10;
        if (newTop < 0) newTop = 10;

        setMenuStyle({ top: newTop, left: newLeft, opacity: 1 }); // Artık göster
    }
  }, [x, y]);

  if (!member || !member.user) return null;

  const currentVolume = userVolumes[member.user._id] !== undefined ? userVolumes[member.user._id] : 100;
  const isSelf = user?.id === member.user._id;
const rawAvatarSrc = getAvatarUrl(member);
const displayAvatarSrc = getDisplayAvatarUrl(rawAvatarSrc);

  // İzinler
  const userId = user?.id || user?._id;
  const canKick = checkUserPermission(activeServer, userId, 'KICK_MEMBERS');
  const canMute = checkUserPermission(activeServer, userId, 'MUTE_MEMBERS');
  const canDeafen = checkUserPermission(activeServer, userId, 'DEAFEN_MEMBERS');
  const canBan = checkUserPermission(activeServer, userId, 'BAN_MEMBERS');
  const canDisconnect = checkUserPermission(activeServer, userId, 'MOVE_MEMBERS') || checkUserPermission(activeServer, userId, 'ADMINISTRATOR');

  const MEMBER_API_URL = `${API_URL_BASE}/api/v1/servers/${serverId}/members/${member._id}`;

  const handleKick = async () => {
    if (!window.confirm(`${member.user.username} adlı üyeyi atmak istediğinizden emin misiniz?`)) return;
    try {
      await axios.delete(MEMBER_API_URL);
      addToast('Üye atıldı.', 'success');
      fetchServerDetails(serverId);
      onClose();
    } catch (error) {
      addToast(`Hata: ${error.response?.data?.message || error.message}`, 'error');
    }
  };

  const handleBan = async () => {
    const reason = prompt(`${member.user.username} adlı üyeyi yasaklama nedeniniz:`);
    if (reason === null) return;
    try {
      await axios.post(`${MEMBER_API_URL}/ban`, { reason });
      addToast('Üye kalıcı olarak yasaklandı.', 'success');
      socket.emit('memberBanned', { serverId, memberId: member._id });
      fetchServerDetails(serverId);
      onClose();
    } catch (error) {
      addToast(`Hata: ${error.response?.data?.message || error.message}`, 'error');
    }
  };

  const handleStatusUpdate = async (type) => {
    let newState;
    let payload;
    if (type === 'mute') {
      newState = !member.isMuted;
      payload = { isMuted: newState };
    } else if (type === 'deafen') {
      newState = !member.isDeafened;
      payload = { isDeafened: newState };
    } else { return; }

    try {
      const res = await axios.put(`${MEMBER_API_URL}/status`, payload);
      socket.emit('memberUpdated', { serverId, memberId: member._id, ...payload });
      addToast(res.data.message, 'success');
      fetchServerDetails(serverId);
      onClose();
    } catch (error) {
      addToast(`Hata: ${error.response?.data?.message || error.message}`, 'error');
    }
  };

  const handleDisconnect = () => {
      if (!window.confirm(`${member.user.username} adlı üyeyi sesli kanaldan atmak istediğinizden emin misiniz?`)) return;

      socket.emit('disconnect-voice-user', {
          serverId,
          targetUserId: member.user._id
      });
      addToast('Kullanıcı kanaldan atıldı.', 'info');
      onClose();
  };

  const displayRoles = member.roles?.filter(r => r.name !== '@everyone') || [];

  return (
    <>
      <div className="member-menu-overlay" onClick={onClose}>
        <div
          ref={menuRef} // 📢 REF EKLENDİ
          className="member-menu-panel"
          style={{ top: menuStyle.top, left: menuStyle.left, opacity: menuStyle.opacity }} // 📢 DİNAMİK STİL
          onClick={(e) => e.stopPropagation()}
        >
          <div className="member-menu-header">
            <div className="member-menu-avatar">
              <img
                src={displayAvatarSrc}
                alt={`${member.user?.username || 'Üye'} avatarı`}
                onError={handleAvatarError}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              />
            </div>
            <div className="member-menu-info">
              <div
                className="member-menu-name clickable"
                onClick={() => setShowProfile(true)}
              >
                {member.user?.username}
              </div>
              <div className="member-menu-sub">
                {activeServer?.owner?._id === member.user._id && <span style={{color:'#faa61a'}}>👑 Sunucu Sahibi</span>}
              </div>

              {displayRoles.length > 0 ? (
                  <div className="member-menu-roles">
                      {displayRoles.map(role => (
                          <span
                            key={role._id}
                            className="menu-role-badge"
                            style={{
                                color: role.color || '#b9bbbe',
                                borderColor: role.color || '#4f545c'
                            }}
                          >
                              {role.name}
                          </span>
                      ))}
                  </div>
              ) : (
                  <div className="member-menu-roles">
                      <span className="menu-role-badge no-role">Rol Yok</span>
                  </div>
              )}
            </div>
          </div>

          <div className="member-menu-actions">
            {!isSelf && (
                <div className="volume-control-group">
                    <label className="volume-label">Ses Seviyesi: %{currentVolume}</label>
                    <input
                        type="range"
                        min="0"
                        max="200"
                        value={currentVolume}
                        onChange={(e) => setUserVolume(member.user._id, parseInt(e.target.value))}
                        className="volume-slider"
                    />
                </div>
            )}

            {!isSelf && <hr className="menu-divider" />}

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
                <button className="member-menu-btn danger" onClick={handleDisconnect}>
                    Bağlantıyı Kes
                </button>
            )}
            {/* Ayraç */}
            {(canKick || canBan) && <hr className="menu-divider" />}

            {canKick && (
              <button className="member-menu-btn danger" onClick={handleKick}>Sunucudan At</button>
            )}

            {canBan && (
              <button className="member-menu-btn danger" onClick={handleBan}>Sunucudan Yasakla</button>
            )}
          </div>
        </div>
      </div>

      {showProfile && (
        <UserProfileModal
          userId={member.user._id}
          initialName={member.user.username}
          onClose={() => { onClose(); setShowProfile(false); }}
        />
      )}
    </>
  );
};

export default MemberContextMenu;