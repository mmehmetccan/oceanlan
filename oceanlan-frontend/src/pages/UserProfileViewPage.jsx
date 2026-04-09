// src/pages/UserProfileViewPage.jsx
import React, { useEffect, useState, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';
import { getImageUrl } from '../utils/urlHelper';
import UserLevelTag from '../components/gamification/UserLevelTag';
import UserBadgeList from '../components/gamification/UserBadgeList';
import SteamActivityDisplay from '../components/gamification/SteamActivityDisplay';
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
  const [steamProfile, setSteamProfile] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  const isSelf = currentUser && currentUser.id === userId;

  // Steam profil bilgilerini çek
  const fetchSteamProfile = async (targetUserId) => {
    try {
      const res = await axiosInstance.get(`/users/${targetUserId}/steam-status`);
      if (res.data.success) {
        setSteamProfile(res.data.data);
      }
    } catch (err) {
      console.error('Steam profil alınamadı:', err);
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        setContextMenu(null);

        const res = await axiosInstance.get(`/users/${userId}/profile`);
        setProfile(res.data);
        
        // Steam profilini de çek
        if (res.data.user?._id) {
          await fetchSteamProfile(res.data.user._id);
        }
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

  // Steam profiline tıklama
  const handleSteamClick = () => {
    if (steamProfile?.steamId) {
      window.open(`https://steamcommunity.com/profiles/${steamProfile.steamId}`, '_blank');
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

  const currentLevel = user.level || 1;
  const currentXP = user.xp || 0;
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
              <UserLevelTag level={user.level}/>
            </div>

            {/* 🟢 STEAM PROFİL BİLGİLERİ - YENİ EKLENDİ */}
            {steamProfile && (
              <div 
                className="steam-profile-info" 
                onClick={handleSteamClick}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginTop: '8px',
                  marginBottom: '8px',
                  padding: '8px 12px',
                  background: 'rgba(23, 26, 33, 0.6)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(23, 26, 33, 0.9)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(23, 26, 33, 0.6)'}
              >
                <img 
                  src={steamProfile.avatar} 
                  alt="Steam Avatar" 
                  style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff' }}>
                    {steamProfile.personaname}
                  </div>
                  {steamProfile.currentGame ? (
                    <div style={{ fontSize: '11px', color: '#3ca4ff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>🎮</span> {steamProfile.currentGame} Oynuyor
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#888' }}>
                      Steam Hesabı Bağlı
                    </div>
                  )}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#888">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm6.657 14.857c-.247 1.054-1.285 1.705-2.317 1.454l-2.614-.645c-.563.486-1.266.837-2.046.963l-.364 2.684c-.144 1.071-1.127 1.821-2.193 1.674s-1.821-1.127-1.674-2.193l.365-2.684c-1.396-.226-2.502-1.283-2.775-2.67l-2.613-.645c-1.032-.251-1.666-1.285-1.414-2.317s1.285-1.666 2.317-1.414l2.614.645c.563-.486 1.266-.837 2.046-.963l.364-2.684c.144-1.071 1.127-1.821 2.193-1.674s1.821 1.127 1.674 2.193l-.365 2.684c1.396.226 2.502 1.283 2.775 2.67l2.613.645c1.032.251 1.666 1.285 1.414 2.317z"/>
                </svg>
              </div>
            )}

            {/* XP Bar */}
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
              Katılmaaa: {user.createdAt ? new Date(user.createdAt).toLocaleDateString('tr-TR') : '-'}
            </div>

            {/* Rozetler */}
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
            <h3>Arkadaşlarıasdasdsa</h3>
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
                      <UserLevelTag level={friendUser.level} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Özel Sağ Tık Menüsü */}
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