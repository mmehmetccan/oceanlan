// src/pages/UserProfileViewPage.jsx
import React, { useEffect, useState, useContext } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';

import '../styles/UserProfileView.css';

const DEFAULT_AVATAR = '/default-avatar.png';
const getAvatarUrl = (entity) =>
  entity?.avatarUrl || entity?.avatar || DEFAULT_AVATAR;
const handleAvatarError = (e) => {
  if (e?.target?.dataset?.fallbackApplied === 'true') return;
  if (e?.target) {
    e.target.dataset.fallbackApplied = 'true';
    e.target.src = DEFAULT_AVATAR;
  }
};

const UserProfileViewPage = () => {
  const { userId } = useParams();
  const { user: currentUser } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);
  const [error, setError] = useState(null);

  const isSelf = currentUser && currentUser.id === userId;

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        // GET /api/v1/users/:userId/profile
        const res = await axios.get(`/api/v1/users/${userId}/profile`);
        setProfile(res.data);
      } catch (err) {
        console.error('[UserProfileView] fetch error', err);
        const msg =
          err.response?.data?.message ||
          'Profil bilgileri alınırken bir hata oluştu.';
        setError(msg);
        addToast(msg, 'error'); // 🔔 Toast eklendi
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchProfile();
    }
  }, [userId]);

  const handleSendFriendRequest = async () => {
    if (!profile || isSelf) return;

    try {
      setFriendRequestLoading(true);

      // ÖRNEK: POST /api/v1/friends/requests { targetUserId }
      await axios.post('/api/v1/friends/requests', {
        targetUserId: profile.user?._id,
      });

      addToast('Arkadaşlık isteği gönderildi.', 'success');

      setProfile((prev) => ({
        ...prev,
        isRequestSent: true,
      }));
    } catch (err) {
      console.error('[UserProfileView] friend request error', err);
      addToast('Arkadaşlık isteği gönderilirken hata oluştu.', 'error');
    } finally {
      setFriendRequestLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!profile || isSelf) return;

    try {
      setFriendRequestLoading(true);

      // ÖRNEK URL: DELETE /api/v1/friends/:friendId
      // Kendi friendRoutes yapına göre burayı uyarlayabilirsin.
      await axios.delete(`/api/v1/friends/${profile.user?._id}`);

      addToast('Arkadaşlıktan çıkarıldı.', 'success');

      setProfile((prev) => ({
        ...prev,
        isFriend: false,
      }));
    } catch (err) {
      console.error('[UserProfileView] remove friend error', err);
      addToast('Arkadaşlıktan çıkarılırken hata oluştu.', 'error');
    } finally {
      setFriendRequestLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="user-profile-page">
        <div className="user-profile-card">
          <p>Profil yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (error || !profile || !profile.user) {
    return (
      <div className="user-profile-page">
        <div className="user-profile-card">
          <p>{error || 'Profil bulunamadı.'}</p>
        </div>
      </div>
    );
  }

  // Güvenli ayıklama
  const user = profile.user || {};
  const servers = profile.servers || [];
  const friends = profile.friends || [];
  const isFriend = !!profile.isFriend;
  const isRequestSent = !!profile.isRequestSent;

  return (
    <div className="user-profile-page">
      <div className="user-profile-card">
        {/* ÜST KISIM: Avatar + isim + butonlar */}
        <div className="user-profile-header">
          <div className="user-profile-avatar">
            <img
              src={getAvatarUrl(user)}
              alt={`${user.username || 'Kullanıcı'} avatarı`}
              onError={handleAvatarError}
            />
          </div>

          <div className="user-profile-main">
            <div className="user-profile-name-row">
              <h2>{user.username || 'Bilinmeyen Kullanıcı'}</h2>
              {/* ID etiketini istemediğin için BURAYI SİLDİM */}
            </div>
            <div className="user-profile-sub">
              Sunucuya katılma tarihi:{' '}
              {user.createdAt
                ? new Date(user.createdAt).toLocaleDateString('tr-TR')
                : 'Bilinmiyor'}
            </div>
          </div>

          {/* Arkadaş ekleme / çıkarma butonu */}
          {!isSelf && (
            <div className="user-profile-actions">
              {isFriend ? (
                <button
                  className="btn-secondary"
                  onClick={handleRemoveFriend}
                  disabled={friendRequestLoading}
                >
                  {friendRequestLoading ? 'İşleniyor...' : 'Arkadaşlıktan çıkar'}
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
                  <li key={server._id || index} className="pill-item">
                    {server.name || 'Sunucu'}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="user-profile-section">
            <h3>Arkadaşları</h3>
            {friends.length === 0 ? (
              <p className="empty-text">Arkadaşı yok veya görünmüyor.</p>
            ) : (
              <ul className="friend-list">
                {friends.map((f, index) => {
                  // Hem { username } hem { user: { username } } formatlarını destekler
                  const friendUser = f.user || f;
                  const friendName =
                    friendUser.username || f.username || 'Bilinmeyen Kullanıcı';
                  const friendId = friendUser._id || f._id || index;

                  return (
                    <li key={friendId} className="friend-item">
                      <div className="friend-avatar">
                        <img
                          src={getAvatarUrl(friendUser)}
                          alt={`${friendName} avatarı`}
                          onError={handleAvatarError}
                        />
                      </div>
                      <span className="friend-name">{friendName}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfileViewPage;
