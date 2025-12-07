// src/components/profile/UserProfileModal.jsx
import React, { useEffect, useState, useContext } from 'react';
import axiosInstance from '../../utils/axiosInstance'; // Axios instance kullan (Electron için şart)
import { AuthContext } from '../../context/AuthContext';
import { ToastContext } from '../../context/ToastContext';
import { getImageUrl } from '../../utils/urlHelper'; // URL Helper

import '../../styles/UserProfileView.css';

const handleAvatarError = (e) => {
  if (e?.target?.dataset?.fallbackApplied === 'true') return;
  if (e?.target) {
    e.target.dataset.fallbackApplied = 'true';
    e.target.src = getImageUrl(null);
  }
};

const UserProfileModal = ({ userId, initialName, onClose }) => {
  // 🟢 YENİ: Modal içinde gezinmek için state
  const [currentUserId, setCurrentUserId] = useState(userId);

  const { user: currentUser } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);
  const [error, setError] = useState(null);

  const isSelf = currentUser && (currentUser.id === currentUserId || currentUser._id === currentUserId);

  useEffect(() => {
    // Modal ilk açıldığında veya içerde başka profile tıklanınca çalışır
    const fetchProfile = async () => {
      if (!currentUserId) return;
      try {
        setLoading(true);
        setError(null);

        // Önceki profili temizle ki geçişte eski veri görünmesin
        setProfile(null);

        const res = await axiosInstance.get(`/users/${currentUserId}/profile`);
        setProfile(res.data);
      } catch (err) {
        console.error('[UserProfileModal] fetch error', err);
        const msg = err.response?.data?.message || 'Profil bilgileri alınırken bir hata oluştu.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [currentUserId]);

  const handleSendFriendRequest = async () => {
    if (!profile || isSelf) return;
    try {
      setFriendRequestLoading(true);
      await axiosInstance.post('/friends/requests', { targetUserId: profile.user?._id });
      addToast('Arkadaşlık isteği gönderildi.', 'success');
      setProfile((prev) => ({ ...prev, isRequestSent: true }));
    } catch (err) {
      addToast('Hata oluştu.', 'error');
    } finally {
      setFriendRequestLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!profile || isSelf) return;
    try {
      setFriendRequestLoading(true);
      await axiosInstance.delete(`/friends/${profile.user?._id}`);
      addToast('Arkadaşlıktan çıkarıldı.', 'success');
      setProfile((prev) => ({ ...prev, isFriend: false, isRequestSent: false }));
    } catch (err) {
      addToast('Hata oluştu.', 'error');
    } finally {
      setFriendRequestLoading(false);
    }
  };

  // Verileri hazırla
  const user = profile?.user || { _id: currentUserId, username: initialName || 'Bilinmeyen Kullanıcı' };
  const servers = profile?.servers || [];
  const friends = profile?.friends || [];
  const isFriend = profile?.isFriend ?? false;
  const isRequestSent = profile?.isRequestSent ?? false;

  const userAvatarSrc = getImageUrl(user.avatarUrl || user.avatar);

  return (
    <div className="user-profile-modal-overlay" onClick={onClose}>
      <div className="user-profile-modal" onClick={(e) => e.stopPropagation()}>

        <button className="user-profile-modal-close" onClick={onClose}>✕</button>

        {loading ? (
          <div className="user-profile-card">
            <p style={{ padding: '20px', textAlign: 'center', color: '#ccc' }}>Profil yükleniyor...</p>
          </div>
        ) : (
          <div className="user-profile-card">
            {/* HEADER */}
            <div className="user-profile-header">
              <div className="user-profile-avatar">
                <img src={userAvatarSrc} alt={user.username} className="user-profile-avatar-img" onError={handleAvatarError} />
              </div>
              <div className="user-profile-main">
                <div className="user-profile-name-row">
                  <h2>{user.username}</h2>
                </div>
                {user.createdAt && (
                  <div className="user-profile-sub">
                    Katılma: {new Date(user.createdAt).toLocaleDateString('tr-TR')}
                  </div>
                )}
                {error && <div className="user-profile-error">{error}</div>}
              </div>

              {/* BUTONLAR */}
              {!isSelf && (
                <div className="user-profile-actions">
                  {isFriend ? (
                    <button className="btn-secondary" onClick={handleRemoveFriend} disabled={friendRequestLoading}>
                      {friendRequestLoading ? '...' : 'Arkadaşlıktan çıkar'}
                    </button>
                  ) : isRequestSent ? (
                    <button className="btn-secondary" disabled>İstek gönderildi</button>
                  ) : (
                    <button className="btn-primary" onClick={handleSendFriendRequest} disabled={friendRequestLoading}>
                      {friendRequestLoading ? '...' : 'Arkadaş ekle'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* BODY */}
            <div className="user-profile-body">
              {/* Sunucular */}
              <div className="user-profile-section">
                <h3>Ortak Sunucular</h3>
                {servers.length === 0 ? (
                  <p className="empty-text">Sunucu bulunamadı.</p>
                ) : (
                  <ul className="pill-list">
                    {servers.map((server, index) => (
                      <li key={server._id || index} className="pill-item">{server.name}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Arkadaşlar */}
              <div className="user-profile-section">
                <h3>Arkadaşları</h3>
                {friends.length === 0 ? (
                  <p className="empty-text">Arkadaşı yok veya görünmüyor.</p>
                ) : (
                  <ul className="friend-list">
                    {friends.map((f, index) => {
                      const friendUser = f.user || f;
                      const friendName = friendUser.username || f.username || 'Bilinmeyen';
                      const friendId = friendUser._id || f._id || index;
                      const friendAvatarSrc = getImageUrl(friendUser.avatarUrl || friendUser.avatar);

                      return (
                        <li
                            key={friendId}
                            className="friend-item clickable" // Tıklanabilir stil
                            onClick={() => setCurrentUserId(friendId)} // 🟢 TIKLAYINCA O PROFİLE GİT
                            title="Profili Görüntüle"
                        >
                          <div className="friend-avatar">
                            <img src={friendAvatarSrc} alt={friendName} onError={handleAvatarError} />
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
        )}
      </div>
    </div>
  );
};

export default UserProfileModal;