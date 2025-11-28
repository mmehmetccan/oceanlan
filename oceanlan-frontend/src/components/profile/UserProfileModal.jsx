// src/components/profile/UserProfileModal.jsx
import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../../context/AuthContext';
import { ToastContext } from '../../context/ToastContext';

import '../../styles/UserProfileView.css';

const API_URL_BASE = import.meta.env.VITE_API_URL; // Backend adresi
const DEFAULT_AVATAR = '/default-avatar.png';

/**
 * Verilen entity (kullanıcı veya üye objesi) içindeki avatar URL'sini bulur.
 */
const getAvatarUrl = (entity) =>
  entity?.user?.avatarUrl ||
  entity?.user?.avatar ||
  entity?.avatarUrl ||
  entity?.avatar ||
  DEFAULT_AVATAR;

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
// -------------------------------------


const UserProfileModal = ({ userId, initialName, onClose }) => {
  const { user: currentUser } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);
  const [error, setError] = useState(null);

  const isSelf =
    currentUser &&
    (currentUser.id === userId || currentUser._id === userId);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!userId) return;
      try {
        setLoading(true);
        setError(null);

        const res = await axios.get(`/api/v1/users/${userId}/profile`);
        setProfile(res.data);
      } catch (err) {
        console.error('[UserProfileModal] fetch error', err);
        const msg =
          err.response?.data?.message ||
          'Profil bilgileri alınırken bir hata oluştu.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

  const handleSendFriendRequest = async () => {
    if (!profile || isSelf) return;

    try {
      setFriendRequestLoading(true);

      await axios.post('/api/v1/friends/requests', {
        targetUserId: profile.user?._id,
      });

      addToast('Arkadaşlık isteği gönderildi.', 'success');

      setProfile((prev) => ({
        ...(prev || {}),
        isRequestSent: true,
      }));
    } catch (err) {
      console.error('[UserProfileModal] friend request error', err);
      addToast('Arkadaşlık isteği gönderilirken hata oluştu.', 'error');
    } finally {
      setFriendRequestLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!profile || isSelf) return;

    try {
      setFriendRequestLoading(true);

      // Backend tarafında kendine göre bu endpointi yazman lazım:
      // Örnek: POST /api/v1/friends/remove  { targetUserId }
      await axios.post('/api/v1/friends/remove', {
        targetUserId: profile.user?._id,
      });

      addToast('Arkadaşlıktan çıkarıldı.', 'success');

      setProfile((prev) => ({
        ...(prev || {}),
        isFriend: false,
        isRequestSent: false,
      }));
    } catch (err) {
      console.error('[UserProfileModal] remove friend error', err);
      addToast('Arkadaşlıktan çıkarılırken hata oluştu.', 'error');
    } finally {
      setFriendRequestLoading(false);
    }
  };

  // Backend başarısız olsa bile, en azından isim gösterelim
  const user = profile?.user || {
    _id: userId,
    username: initialName || 'Bilinmeyen Kullanıcı',
  };
  const servers = profile?.servers || [];
  const friends = profile?.friends || [];
  const isFriend = profile?.isFriend ?? false;
  const isRequestSent = profile?.isRequestSent ?? false;

  // 💡 KULLANICI AVATAR URL'SİNİ HAZIRLA
  const userAvatarSrc = getDisplayAvatarUrl(getAvatarUrl(user));

  return (
    <div className="user-profile-modal-overlay" onClick={onClose}>
      <div
        className="user-profile-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="user-profile-modal-close"
          onClick={onClose}
        >
          ✕
        </button>

        {loading ? (
          <div className="user-profile-card">
            <p>Profil yükleniyor...</p>
          </div>
        ) : (
          <div className="user-profile-card">
            {/* ÜST KISIM: Avatar + isim + butonlar */}
            <div className="user-profile-header">
              <div className="user-profile-avatar">
                <img
                  src={userAvatarSrc} // 💡 MUTLAK URL KULLANILDI
                  alt={`${user.username || 'Kullanıcı'} avatarı`}
                  className="user-profile-avatar-img"
                  onError={handleAvatarError}
                />
              </div>
              <div className="user-profile-main">
                <div className="user-profile-name-row">
                  <h2>{user.username || 'Bilinmeyen Kullanıcı'}</h2>
                  {/* ID ARTIK GÖRÜNMÜYOR */}
                </div>

                {/* createdAt varsa göster, yoksa hiç yazma */}
                {user.createdAt && (
                  <div className="user-profile-sub">
                    Sunucuya katılma tarihi:{' '}
                    {new Date(user.createdAt).toLocaleDateString('tr-TR')}
                  </div>
                )}

                {error && (
                  <div className="user-profile-error">
                    {error}
                  </div>
                )}
              </div>

              {/* Arkadaş / arkadaşlıktan çıkar butonları */}
              {!isSelf && (
                <div className="user-profile-actions">
                  {isFriend ? (
                    <button
                      className="btn-secondary"
                      onClick={handleRemoveFriend}
                      disabled={friendRequestLoading}
                    >
                      {friendRequestLoading
                        ? 'İşleniyor...'
                        : 'Arkadaşlıktan çıkar'}
                    </button>
                  ) : isRequestSent ? (
                    <button className="btn-secondary" disabled>
                      📩 İstek gönderildi
                    </button>
                  ) : (
                    <button
                      className="btn-primary"
                      onClick={handleSendFriendRequest}
                      disabled={friendRequestLoading}
                    >
                      {friendRequestLoading ? 'Gönderiliyor...' : 'Arkadaş ekle'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ALT KISIM: Sunucular + Arkadaşlar */}
            <div className="user-profile-body">
              <div className="user-profile-section">
                <h3>Üye Olduğu Sunucular</h3>
                {servers.length === 0 ? (
                  <p className="empty-text">Sunucu bulunamadı.</p>
                ) : (
                  <ul className="pill-list">
                    {servers.map((server, index) => (
                      <li
                        key={server._id || index}
                        className="pill-item"
                      >
                        {server.name || 'Sunucu'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="user-profile-section">
                <h3>Arkadaşları</h3>
                {friends.length === 0 ? (
                  <p className="empty-text">
                    Arkadaşı yok veya görünmüyor.
                  </p>
                ) : (
                  <ul className="friend-list">
                    {friends.map((f, index) => {
                      const friendUser = f.user || f;
                      const friendName =
                        friendUser.username ||
                        f.username ||
                        'Bilinmeyen Kullanıcı';
                      const friendId =
                        friendUser._id || f._id || index;

                      // 💡 ARKADAŞ AVATAR URL'SİNİ HAZIRLA
                      const friendAvatarSrc = getDisplayAvatarUrl(getAvatarUrl(friendUser));

                      return (
                        <li key={friendId} className="friend-item">
                          <div className="friend-avatar">
                            <img
                              src={friendAvatarSrc} // 💡 MUTLAK URL KULLANILDI
                              alt={`${friendName} avatarı`}
                              onError={handleAvatarError}
                            />
                          </div>
                          <span className="friend-name">
                            {friendName}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfileModal;