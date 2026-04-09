// src/components/profile/UserProfileModal.jsx
import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../utils/axiosInstance';
import { AuthContext } from '../../context/AuthContext';
import { ToastContext } from '../../context/ToastContext';
import { getImageUrl } from '../../utils/urlHelper';
import UserLevelTag from '../gamification/UserLevelTag';
import UserBadgeList, { getBadgeImg } from '../gamification/UserBadgeList';
import '../../styles/UserProfileView.css';

const handleAvatarError = (e) => {
  if (e?.target?.dataset?.fallbackApplied === 'true') return;
  if (e?.target) {
    e.target.dataset.fallbackApplied = 'true';
    e.target.src = getImageUrl(null);
  }
};

const UserProfileModal = ({ userId, initialName, onClose }) => {
  const navigate = useNavigate();
  const [currentUserId, setCurrentUserId] = useState(userId);

  const { user: currentUser } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);
  const [error, setError] = useState(null);
  const [equippedBadge, setEquippedBadge] = useState(null);
  const [steamProfile, setSteamProfile] = useState(null); // 🟢 YENİ

  const isSelf = currentUser && (currentUser.id === currentUserId || currentUser._id === currentUserId);

  // 🟢 Steam profil bilgilerini çek
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
      if (!currentUserId) return;
      try {
        setLoading(true);
        setError(null);
        setProfile(null);
        setSteamProfile(null); // 🟢 Reset steam profile

        const res = await axiosInstance.get(`/users/${currentUserId}/profile`);
        setProfile(res.data);

        if (res.data.user?.activeBadge) {
          setEquippedBadge(res.data.user.activeBadge);
        }

        // 🟢 Steam profilini çek
        if (res.data.user?._id) {
          await fetchSteamProfile(res.data.user._id);
        }

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

  // 🟢 Steam profiline tıklama
  const handleSteamClick = () => {
    if (steamProfile?.steamId) {
      window.open(`https://steamcommunity.com/profiles/${steamProfile.steamId}`, '_blank');
    }
  };

  const user = profile?.user || { _id: currentUserId, username: initialName || 'Bilinmeyen Kullanıcı' };

  const rawServers = profile?.servers || [];
  const myServerIds = currentUser?.servers?.map(s => String(s._id || s || '')) || [];
  const visibleServers = isSelf
    ? rawServers
    : rawServers.filter(server => {
      const targetServerId = String(server._id || server.id);
      return myServerIds.includes(targetServerId);
    });

  const friends = profile?.friends || [];
  const isFriend = profile?.isFriend ?? false;
  const isRequestSent = profile?.isRequestSent ?? false;
  const userAvatarSrc = getImageUrl(user.avatarUrl || user.avatar);

  const handleEquipBadge = async (badge) => {
    try {
      setEquippedBadge(badge);
      await axiosInstance.put('/users/equip-badge', { badgeId: badge.id });
      addToast(`${badge.name} rozeti profile takıldı!`, 'success');
    } catch (error) {
      console.error(error);
      addToast('Rozet takılırken hata oluştu.', 'error');
    }
  };

  const currentLevel = user.level || 1;
  const currentXP = user.xp || 0;
  const xpForCurrentLevel = Math.pow((currentLevel - 1) / 0.1, 2);
  const xpForNextLevel = Math.pow((currentLevel) / 0.1, 2);
  const progressRaw = ((currentXP - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100;
  const progress = Math.min(Math.max(progressRaw, 0), 100);

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
                <div className="user-profile-name-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <h2>{user.username}</h2>
                  <UserLevelTag level={user.level} />
                  {equippedBadge && (
                    <div
                      title={`${equippedBadge.name} rozeti kuşanıldı`}
                      className="animate-bounce-in"
                      style={{
                        width: '28px', height: '28px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.3)', borderRadius: '50%',
                        border: '1px solid gold', padding: '2px',
                        cursor: 'help'
                      }}
                    >
                      <img
                        src={getBadgeImg(equippedBadge.icon)}
                        alt="Badge"
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    </div>
                  )}
                </div>

                {/* 🟢 STEAM PROFİL BİLGİLERİ - YENİ EKLENDİ */}
                {steamProfile && (
                  <div 
                    className="steam-profile-info-modal"
                    onClick={handleSteamClick}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginTop: '8px',
                      marginBottom: '8px',
                      padding: '6px 10px',
                      background: 'rgba(23, 26, 33, 0.6)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                      maxWidth: '280px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(23, 26, 33, 0.9)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(23, 26, 33, 0.6)'}
                  >
                    <img 
                      src={steamProfile.avatar} 
                      alt="Steam Avatar" 
                      style={{ width: '28px', height: '28px', borderRadius: '50%' }}
                    />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {steamProfile.personaname}
                      </div>
                      {steamProfile.currentGame ? (
                        <div style={{ fontSize: '10px', color: '#3ca4ff', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span>🎮</span> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{steamProfile.currentGame}</span>
                        </div>
                      ) : (
                        <div style={{ fontSize: '10px', color: '#888' }}>
                          Steam Bağlı
                        </div>
                      )}
                    </div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#888">
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm6.657 14.857c-.247 1.054-1.285 1.705-2.317 1.454l-2.614-.645c-.563.486-1.266.837-2.046.963l-.364 2.684c-.144 1.071-1.127 1.821-2.193 1.674s-1.821-1.127-1.674-2.193l.365-2.684c-1.396-.226-2.502-1.283-2.775-2.67l-2.613-.645c-1.032-.251-1.666-1.285-1.414-2.317s1.285-1.666 2.317-1.414l2.614.645c.563-.486 1.266-.837 2.046-.963l.364-2.684c.144-1.071 1.127-1.821 2.193-1.674s1.821 1.127 1.674 2.193l-.365 2.684c1.396.226 2.502 1.283 2.775 2.67l2.613.645c1.032.251 1.666 1.285 1.414 2.317z"/>
                    </svg>
                  </div>
                )}

                <div className="user-profile-xp-container" style={{ width: '100%', maxWidth: '280px', marginTop: '6px', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#b9bbbe', marginBottom: '2px' }}>
                    <span>XP: {Math.floor(currentXP)}</span>
                    <span>Sonraki: {Math.floor(xpForNextLevel)}</span>
                  </div>
                  <div style={{ height: '6px', background: '#202225', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #5865F2, #00b0f4)',
                      transition: 'width 0.5s ease'
                    }}></div>
                  </div>
                </div>

                {user.createdAt && (
                  <div className="user-profile-sub">
                    Katılma: {new Date(user.createdAt).toLocaleDateString('tr-TR')}
                  </div>
                )}

                {user.badges && user.badges.length > 0 && (
                  <div className="user-profile-badges-section">
                    <UserBadgeList badges={user.badges} onEquip={handleEquipBadge} />
                  </div>
                )}
                {error && <div className="user-profile-error">{error}</div>}
              </div>

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

            <div className="user-profile-body">
              {/* Sunucular */}
              <div className="user-profile-section">
                <h3>{isSelf ? 'Sunucularım' : 'Ortak Sunucular'}</h3>
                {visibleServers.length === 0 ? (
                  <p className="empty-text">
                    {isSelf ? 'Henüz bir sunucuya katılmadınız.' : 'Ortak sunucu bulunamadı.'}
                  </p>
                ) : (
                  <ul className="pill-list">
                    {visibleServers.map((server, index) => {
                      const serverImgSrc = server.iconUrl ? getImageUrl(server.iconUrl) : null;

                      return (
                        <li
                          key={server._id || index}
                          className="pill-item"
                          onClick={() => {
                            if (!isSelf && !myServerIds.includes(String(server._id))) {
                              addToast("Bu sunucuya erişiminiz yok.", "error");
                              return;
                            }
                            onClose();
                            navigate(`/dashboard/server/${server._id}`);
                          }}
                          style={{
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '6px 12px 6px 8px',
                            backgroundColor: 'rgba(0,0,0,0.2)',
                            borderRadius: '20px',
                            marginBottom: '5px',
                            marginRight: '5px'
                          }}
                          title={`${server.name} sunucusuna git`}
                        >
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            overflow: 'hidden',
                            backgroundColor: '#36393f',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: '#dcddde',
                            flexShrink: 0,
                            border: '1px solid rgba(255,255,255,0.1)'
                          }}>
                            {serverImgSrc ? (
                              <img
                                src={serverImgSrc}
                                alt={server.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.parentNode.innerText = server.name.charAt(0).toUpperCase();
                                }}
                              />
                            ) : (
                              <span>{server.name?.charAt(0).toUpperCase()}</span>
                            )}
                          </div>
                          <span style={{ fontWeight: '500', color: '#fff' }}>
                            {server.name}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Arkadaşlar Kısmı */}
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
                          className="friend-item clickable"
                          onClick={() => setCurrentUserId(friendId)}
                          title="Profili Görüntüle"
                        >
                          <div className="friend-avatar">
                            <img src={friendAvatarSrc} alt={friendName} onError={handleAvatarError} />
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
        )}
      </div>
    </div>
  );
};

export default UserProfileModal;