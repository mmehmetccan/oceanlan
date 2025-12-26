// src/pages/UserProfileViewPage.jsx
import React, { useEffect, useState, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';
import { getImageUrl } from '../utils/urlHelper';
import UserLevelTag from '../components/gamification/UserLevelTag';
import UserBadgeList from '../components/gamification/UserBadgeList';

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
  const navigate = useNavigate();
  const { user: currentUser } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);
  const [error, setError] = useState(null);

  const [contextMenu, setContextMenu] = useState(null);

  const isSelf = currentUser && currentUser.id === userId;

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        setContextMenu(null);

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

  const handleContextMenu = (e, friendId) => {
      e.preventDefault();
      setContextMenu({
          x: e.pageX,
          y: e.pageY,
          targetUserId: friendId
      });
  };

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

  // 🟢 XP VE LEVEL HESAPLAMASI
  const currentLevel = user.level || 1;
  const currentXP = user.xp || 0;



  // Formül: Level = 0.1 * sqrt(XP) + 1  =>  XP = ((Level - 1) / 0.1)^2
  const xpForCurrentLevel = Math.pow((currentLevel - 1) / 0.1, 2);
  const xpForNextLevel = Math.pow((currentLevel) / 0.1, 2);

  const progressRaw = ((currentXP - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100;
  const progress = Math.min(Math.max(progressRaw, 0), 100);

  return (
    <div className="user-profile-page" onClick={() => setContextMenu(null)}>
      <div className="user-profile-card">

        {/* HEADER */}
        <div className="user-profile-header">
          <div className="user-profile-avatar">
            <img src={profileAvatarUrl} alt={user.username} onError={handleAvatarError} />
          </div>
          <div className="user-profile-main">
            <div className="user-profile-name-row">
              <h2>{user.username}</h2>
              {/* 1. SEVİYE ETİKETİ */}
              <UserLevelTag level={user.level}/>
            </div>

            {/* 2. XP BARI (YENİ EKLENDİ) */}
            <div className="user-profile-xp-container" style={{ width: '100%', maxWidth: '300px', marginTop: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#b9bbbe', marginBottom: '2px' }}>
                    <span>XP: {Math.floor(currentXP)}</span>
                    <span>Sonraki: {Math.floor(xpForNextLevel)}</span>
                </div>
                <div style={{ height: '8px', background: '#202225', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                        width: `${progress}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #5865F2, #00b0f4)',
                        transition: 'width 0.5s ease'
                    }}></div>
                </div>
            </div>

            <div className="user-profile-sub">
              Katılma: {user.createdAt ? new Date(user.createdAt).toLocaleDateString('tr-TR') : '-'}
            </div>

            {/* 3. ROZETLER */}
            {user.badges && user.badges.length > 0 && (
                <div className="user-profile-badges-section">
                  <UserBadgeList badges={user.badges}/>
                </div>
            )}
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
                        onContextMenu={(e) => handleContextMenu(e, friendId)}
                    >
                      <div className="friend-avatar">
                        <img src={friendAvatar} alt={friendName} onError={handleAvatarError} />
                      </div>
                      <span className="friend-name">{friendName}</span>
                      {/* Arkadaş listesinde de level görünsün istersen: */}
                      <UserLevelTag level={friendUser.level} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ÖZEL SAĞ TIK MENÜSÜ */}
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