// src/components/modals/MemberContextMenu.jsx
import React, { useContext, useState } from 'react';
import axios from 'axios';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import { checkUserPermission } from '../../utils/permissionChecker';
import { useSocket } from '../../hooks/useSocket';
import UserProfileModal from '../profile/UserProfileModal';
import "../../styles/MemberContextMenu.css"
import { AudioSettingsContext } from '../../context/AudioSettingsContext'; // YENİ IMPORT

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

// 💡 URL'Yİ MUTLAK YOLA ZORLAYAN HELPER
const getDisplayAvatarUrl = (rawUrl) => {
    if (rawUrl.startsWith('/uploads')) {
        return `${API_URL_BASE}${rawUrl}`;
    }
    return rawUrl;
};
// ----------------------------------------


const MemberContextMenu = ({ member, x, y, serverId, onClose }) => {
  const { activeServer, fetchServerDetails } = useContext(ServerContext);
  const { user } = useContext(AuthContext);
  const { socket } = useSocket();

  const [showProfile, setShowProfile] = useState(false);
const { userVolumes, setUserVolume } = useContext(AudioSettingsContext);

  if (!member || !member.user) {
    return null;
  }

  const currentVolume = userVolumes[member.user._id] !== undefined ? userVolumes[member.user._id] : 100;
const isSelf = user?.id === member.user._id;

  // 💡 AVATAR URL'SİNİ HAZIRLA
  const rawAvatarSrc = getAvatarUrl(member);
  const displayAvatarSrc = getDisplayAvatarUrl(rawAvatarSrc);
  // -------------------------

  // --- İZİN KONTROLLERİ ---
  const userId = user?.id || user?._id;
  const canKick = checkUserPermission(activeServer, userId, 'KICK_MEMBERS');
  const canMute = checkUserPermission(activeServer, userId, 'MUTE_MEMBERS');
  const canDeafen = checkUserPermission(activeServer, userId, 'DEAFEN_MEMBERS');
  const canBan = checkUserPermission(activeServer, userId, 'BAN_MEMBERS');
  // ------------------------

  const MEMBER_API_URL = `${API_URL_BASE}/api/v1/servers/${serverId}/members/${member._id}`;

  const handleKick = async () => {
    if (!window.confirm(`${member.user.username} adlı üyeyi atmak istediğinizden emin misiniz?`)) return;
    try {
      await axios.delete(MEMBER_API_URL); // Kick için DELETE
      alert('Üye atıldı.');
      fetchServerDetails(serverId);
      onClose();
    } catch (error) {
      alert(`Hata: ${error.response?.data?.message || error.message}`);
    }
  };

  // --- BAN FONKSİYONU ---
  const handleBan = async () => {
    const reason = prompt(`${member.user.username} adlı üyeyi yasaklama nedeniniz:`);
    if (reason === null) return; // İptale basıldı

    try {
      await axios.post(`${MEMBER_API_URL}/ban`, { reason }); // Ban için POST
      alert('Üye kalıcı olarak yasaklandı.');

      // Socket ile anlık güncelleme (isteğe bağlı)
      socket.emit('memberBanned', { serverId, memberId: member._id });

      fetchServerDetails(serverId); // Listeyi yenile
      onClose();
    } catch (error) {
      alert(`Hata: ${error.response?.data?.message || error.message}`);
    }
  };
  // -----------------------

  // --- Mute ve Deafen ---
  const handleStatusUpdate = async (type) => {
    let newState;
    let payload;

    if (type === 'mute') {
      newState = !member.isMuted;
      payload = { isMuted: newState };
    } else if (type === 'deafen') {
      newState = !member.isDeafened;
      payload = { isDeafened: newState };
    } else {
      return;
    }

    try {
      const res = await axios.put(`${MEMBER_API_URL}/status`, payload);

      // Socket ile güncelleme
      socket.emit('memberUpdated', {
        serverId,
        memberId: member._id,
        ...payload,
      });

      alert(res.data.message);
      fetchServerDetails(serverId);
      onClose();
    } catch (error) {
      alert(`Hata: ${error.response?.data?.message || error.message}`);
    }
  };
  // -----------------------

  return (
    <>
      <div className="member-menu-overlay" onClick={onClose}>
        <div
          className="member-menu-panel"
          style={{ top: y, left: x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 💡 HEADER DÜZENLEMESİ: Avatarı göster */}
          <div className="member-menu-header">
            <div className="member-menu-avatar">
              <img
                src={displayAvatarSrc} // 💡 Mutlak URL kullanıldı
                alt={`${member.user?.username || 'Üye'} avatarı`}
                onError={handleAvatarError}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              />
            </div>
            <div className="member-menu-info">
              <div
                className="member-menu-name clickable"
                onClick={() => {
                  setShowProfile(true); // Profil modali aç
                }}
              >
                {member.user?.username}
              </div>
              <div className="member-menu-sub">
                {member.isMuted && 'Susturulmuş · '}
                {member.isDeafened && 'Sağırlaştırılmış · '}
                {activeServer?.owner?._id === member.user._id && 'Sunucu Sahibi'}
              </div>
            </div>
          </div>
          {/* ------------------------------------- */}

          <div className="member-menu-actions">
            {/* 📢 YENİ: KULLANICI SES AYARI SLIDER'I */}
            {!isSelf && (
                <div className="volume-control-group">
                    <label className="volume-label">
                        Kullanıcı Sesi: %{currentVolume}
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="200" // %200'e kadar artırma imkanı
                        value={currentVolume}
                        onChange={(e) => setUserVolume(member.user._id, parseInt(e.target.value))}
                        className="volume-slider"
                    />
                </div>
            )}

            {/* Ayraç */}
            {!isSelf && <hr className="menu-divider" />}

            {canMute && (
              <button
                className="member-menu-btn"
                onClick={() => handleStatusUpdate('mute')}
              >
                {member.isMuted ? 'Susturmayı Kaldır' : 'Sustur'}
              </button>
            )}

            {canDeafen && (
              <button
                className="member-menu-btn"
                onClick={() => handleStatusUpdate('deafen')}
              >
                {member.isDeafened ? 'Sağırlaştırmayı Kaldır' : 'Sağırlaştır'}
              </button>
            )}

            {canKick && (
              <button
                className="member-menu-btn danger"
                onClick={handleKick}
              >
                Kullanıcıyı At
              </button>
            )}

            {canBan && (
              <button
                className="member-menu-btn danger"
                onClick={handleBan}
              >
                Kullanıcıyı Yasakla
              </button>
            )}

            {!canKick && !canMute && !canDeafen && !canBan && (
              <p className="member-menu-empty">Yetkiniz yok</p>
            )}
          </div>
        </div>
      </div>

      {showProfile && (
        <UserProfileModal
          userId={member.user._id}
          initialName={member.user.username}
          onClose={() => {
             // Modalı kapatmadan önce menüyü de kapat
             onClose();
             setShowProfile(false);
          }}
        />
      )}
    </>
  );
};

export default MemberContextMenu;