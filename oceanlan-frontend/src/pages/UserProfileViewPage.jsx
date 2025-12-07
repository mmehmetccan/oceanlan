// src/pages/UserProfileViewPage.jsx
import React, { useEffect, useState, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom'; // navigate eklendi
import axiosInstance from '../utils/axiosInstance';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';
import { getImageUrl } from '../utils/urlHelper';

import '../styles/UserProfileView.css';

const handleAvatarError = (e) => {
  if (e?.target?.dataset?.fallbackApplied === 'true') return;
  if (e?.target) {
    e.target.dataset.fallbackApplied = 'true';
    e.target.src = getImageUrl(null);
  }
};

const UserProfileViewPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate(); // Yönlendirme için
  const { user: currentUser } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);
  const [error, setError] = useState(null);

  // 🟢 SAĞ TIK MENÜSÜ STATE'İ
  const [contextMenu, setContextMenu] = useState(null); // { x, y, targetUserId }

  const isSelf = currentUser && currentUser.id === userId;

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        setContextMenu(null); // Sayfa değişince menüyü kapat

        const res = await axiosInstance.get(`/users/${userId}/profile`);
        setProfile(res.data);
      } catch (err) {
        console.error('[UserProfileView] fetch error', err);
        setError(err.response?.data?.message || 'Profil bilgileri alınırken hata.');
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
      setProfile((prev) => ({ ...prev, isFriend: false }));
    } catch (err) {
      addToast('Hata oluştu.', 'error');
    } finally {
      setFriendRequestLoading(false);
    }
  };

  // 🟢 SAĞ TIK OLAĞI (Context Menu Handler)
  const handleContextMenu = (e, friendId) => {
      e.preventDefault(); // Tarayıcı menüsünü engelle
      // Menüyü farenin olduğu yerde aç
      setContextMenu({
          x: e.pageX,
          y: e.pageY,
          targetUserId: friendId
      });
  };

  // 🟢 PROFİLE GİT
  const goToProfile = () => {
      if (contextMenu && contextMenu.targetUserId) {
          navigate(`/dashboard/user/${contextMenu.targetUserId}`);
          setContextMenu(null);
      }
  };

  if (loading) return <div className="user-profile-page"><div className="user-profile-card"><p>Yükleniyor...</p></div></div>;
  if (error || !profile || !profile.user) return <div className="user-profile-page"><div className="user-profile-card"><p>{error || 'Bulunamadı.'}</p></div></div>;

  const user = profile.user || {};
  const servers = profile.servers || [];
  const friends = profile.friends || [];
  const isFriend = !!profile.isFriend;
  const isRequestSent = !!profile.isRequestSent;
  const profileAvatarUrl = getImageUrl(user.avatarUrl || user.avatar);

  return (
    <div className="user-profile-page" onClick={() => setContextMenu(null)}>
      <div className="user-profile-card">

        {/* HEADER */}
        <div className="user-profile-header">
          <div className="user-profile-avatar">
            <img src={profileAvatarUrl} alt={user.username} onError={handleAvatarError} />
          </div>
          <div className="user-profile-main">
            <div className="user-profile-name-row"><h2>{user.username}</h2></div>
            <div className="user-profile-sub">Katılma: {user.createdAt ? new Date(user.createdAt).toLocaleDateString('tr-TR') : '-'}</div>
          </div>
          {!isSelf && (
            <div className="user-profile-actions">
              {isFriend ? (
                <button className="btn-secondary" onClick={handleRemoveFriend} disabled={friendRequestLoading}>Arkadaşlıktan Çıkar</button>
              ) : isRequestSent ? (
                <button className="btn-secondary" disabled>İstek Gönderildi</button>
              ) : (
                <button className="btn-primary" onClick={handleSendFriendRequest} disabled={friendRequestLoading}>Arkadaş Ekle</button>
              )}
            </div>
          )}
        </div>

        {/* BODY */}
        <div className="user-profile-body">
          <div className="user-profile-section">
            <h3>Ortak Sunucular</h3>
            {servers.length === 0 ? <p className="empty-text">Yok.</p> : (
              <ul className="pill-list">
                {servers.map((s, i) => <li key={s._id || i} className="pill-item">{s.name}</li>)}
              </ul>
            )}
          </div>

          <div className="user-profile-section">
            <h3>Arkadaşları</h3>
            {friends.length === 0 ? <p className="empty-text">Yok.</p> : (
              <ul className="friend-list">
                {friends.map((f, index) => {
                  const friendUser = f.user || f;
                  const friendName = friendUser.username || f.username || 'Bilinmeyen';
                  const friendId = friendUser._id || f._id || index;
                  const friendAvatar = getImageUrl(friendUser.avatarUrl || friendUser.avatar);

                  return (
                    <li
                        key={friendId}
                        className="friend-item"
                        // 🟢 SAĞ TIK TETİKLEYİCİSİ
                        onContextMenu={(e) => handleContextMenu(e, friendId)}
                    >
                      <div className="friend-avatar">
                        <img src={friendAvatar} alt={friendName} onError={handleAvatarError} />
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

      {/* 🟢 ÖZEL SAĞ TIK MENÜSÜ */}
      {contextMenu && (
          <div
            className="custom-context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
              <div className="context-menu-item" onClick={goToProfile}>
                  Profili Görüntüle
              </div>
          </div>
      )}

    </div>
  );
};

export default UserProfileViewPage;