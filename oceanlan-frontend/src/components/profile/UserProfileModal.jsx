// src/components/profile/UserProfileModal.jsx
import React, { useEffect, useState, useContext } from 'react';
// 🟢 EKLENDİ: Yönlendirme için gerekli
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
  // 🟢 EKLENDİ: Navigate hook'u
  const navigate = useNavigate();

  // Modal içinde gezinmek için state
  const [currentUserId, setCurrentUserId] = useState(userId);

  const { user: currentUser } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);
  const [error, setError] = useState(null);

  // Kuşanılan rozet state'i
  const [equippedBadge, setEquippedBadge] = useState(null);

  const isSelf = currentUser && (currentUser.id === currentUserId || currentUser._id === currentUserId);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!currentUserId) return;
      try {
        setLoading(true);
        setError(null);
        setProfile(null); // Geçişte temizle

        const res = await axiosInstance.get(`/users/${currentUserId}/profile`);
        setProfile(res.data);

        // Eğer veritabanında kayıtlı bir aktif rozet varsa state'e yükle
        if (res.data.user?.activeBadge) {
          setEquippedBadge(res.data.user.activeBadge);
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

  // Verileri hazırla
  const user = profile?.user || { _id: currentUserId, username: initialName || 'Bilinmeyen Kullanıcı' };
  const servers = profile?.servers || [];
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

  // XP VE LEVEL HESAPLAMASI
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
                <div className="user-profile-name-row" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2>{user.username}</h2>

                  {/* Level Etiketi */}
                  <UserLevelTag level={user.level} />

                  {/* Kuşanılan Rozet */}
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

                {/* XP Barı */}
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

                {/* Rozetler Listesi */}
                {user.badges && user.badges.length > 0 && (
                  <div className="user-profile-badges-section">
                    <UserBadgeList badges={user.badges} onEquip={handleEquipBadge} />
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
                      <li
                        key={server._id || index}
                        className="pill-item"
                        // 🟢 GÜNCELLEME: Tıklanınca git
                        onClick={() => {
                          onClose(); // Modalı kapat
                          navigate(`/dashboard/server/${server._id}`); // Sunucuya git
                        }}
                        style={{
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          paddingLeft: '6px', // Resim olduğu için sol boşluğu azalttık
                          paddingRight: '12px',
                          paddingTop: '4px',
                          paddingBottom: '4px'
                        }}
                        title={`${server.name} sunucusuna git`}
                      >
                        {/* 🟢 GÜNCELLEME: Sunucu İkonu */}
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          overflow: 'hidden',
                          backgroundColor: '#2f3136',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          color: '#fff',
                          flexShrink: 0
                        }}>
                          {server.iconUrl ? (
                            <img src={getImageUrl(server.iconUrl)} alt={server.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span>{server.name?.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <span>{server.name}</span>
                      </li>
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