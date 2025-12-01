// src/pages/FeedPage.jsx

import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
import CreatePost from '../components/feed/CreatePost';
import PostCard from '../components/feed/PostCard';
import FeedContextMenu from '../components/modals/FeedContextMenu';
import UserProfileModal from '../components/profile/UserProfileModal';
import ConfirmationModal from '../components/modals/ConfirmationModal'; // 🔔 Eklendi
import { useSocket } from '../hooks/useSocket';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext'; // 🔔 Eklendi
import '../styles/FeedPage.css';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const DEFAULT_AVATAR = '/default-avatar.png';

export const getAvatarUrl = (entity) =>
  entity?.avatarUrl || entity?.avatar || DEFAULT_AVATAR;

export const handleAvatarError = (e) => {
  if (e?.target?.dataset?.fallbackApplied === 'true') return;
  if (e?.target) {
    e.target.dataset.fallbackApplied = 'true';
    e.target.src = DEFAULT_AVATAR;
  }
};

const toAbsolute = (src) => {
  if (!src) return DEFAULT_AVATAR;
  if (src.startsWith('/uploads')) return `${API_URL_BASE}${src}`;
  return src;
};

const FeedPage = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Arkadaşlık state'leri
  const [pendingRequests, setPendingRequests] = useState([]);
  const [friends, setFriends] = useState([]);

  // İstek gönderme formu
  const [recipientUsername, setRecipientUsername] = useState('');
  const [requestMessage, setRequestMessage] = useState('');

  // Context Menu & Profile State
  const [contextMenu, setContextMenu] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(null);
const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDanger: false });

  const { socket } = useSocket();
  const { user } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext); // 🔔
  const navigate = useNavigate();

  // ============================================================
  // API VERİ ÇEKME
  // ============================================================
  const fetchFeed = async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get('/posts/feed');
      setPosts(res.data.data);
    } catch (error) {
      console.error('Akış hatası:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPending = async () => {
    try {
      const res = await axiosInstance.get('/friends/requests/pending');
      setPendingRequests(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFriends = async () => {
    try {
      const res = await axiosInstance.get('/friends');
      setFriends(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchFeed();
    fetchPending();
    fetchFriends();
  }, []);

  // ============================================================
  // SOCKET DİNLEYİCİLERİ (ANLIK GÜNCELLEME)
  // ============================================================
  useEffect(() => {
    if (!socket || !user) return;

    // Post Olayları
    const handleNewPost = (newPost) => {
      if (newPost.user._id !== user.id) {
        setPosts((p) => [newPost, ...p]);
      }
    };

    const handlePostUpdated = (updated) => {
      setPosts((p) => p.map((post) => (post._id === updated._id ? updated : post)));
    };

    const handleNewComment = ({ postId, comment }) => {
      if (comment.user._id !== user.id) {
        setPosts((p) =>
          p.map((post) =>
            post._id === postId
              ? { ...post, comments: [...post.comments, comment] }
              : post
          )
        );
      }
    };

    // Arkadaşlık Olayları
    const handleNewFriendRequest = (newRequest) => {
      setPendingRequests((prev) => {
        if (prev.some((req) => req._id === newRequest._id)) return prev;
        return [...prev, newRequest];
      });
    };

    const handleFriendRequestAccepted = (newFriend) => {
      setFriends((prev) => {
        if (prev.find((f) => String(f._id) === String(newFriend._id))) return prev;
        return [...prev, newFriend];
      });

      setPendingRequests((prev) =>
        prev.filter(
          (req) =>
            String(req.recipient?._id) !== String(newFriend._id) &&
            String(req.requester?._id) !== String(newFriend._id)
        )
      );
    };

    const handleFriendRemoved = ({ removedUserId }) => {
      setFriends((prev) => prev.filter((f) => String(f._id) !== String(removedUserId)));
    };

    const handleRequestCancelled = ({ cancelledUserId }) => {
      setPendingRequests((prev) =>
        prev.filter(
          (req) =>
            String(req.requester?._id) !== String(cancelledUserId) &&
            String(req.recipient?._id) !== String(cancelledUserId)
        )
      );
    };

    socket.on('newFeedPost', handleNewPost);
    socket.on('postUpdated', handlePostUpdated);
    socket.on('newComment', handleNewComment);

    socket.on('newFriendRequest', handleNewFriendRequest);
    socket.on('friendRequestAccepted', handleFriendRequestAccepted);
    socket.on('friendRemoved', handleFriendRemoved);
    socket.on('friendRequestCancelled', handleRequestCancelled);

    return () => {
      socket.off('newFeedPost', handleNewPost);
      socket.off('postUpdated', handlePostUpdated);
      socket.off('newComment', handleNewComment);

      socket.off('newFriendRequest', handleNewFriendRequest);
      socket.off('friendRequestAccepted', handleFriendRequestAccepted);
      socket.off('friendRemoved', handleFriendRemoved);
      socket.off('friendRequestCancelled', handleRequestCancelled);
    };
  }, [socket, user]);

  // ============================================================
  // ACTIONS
  // ============================================================
  const goProfile = () => navigate('/dashboard/settings/profile');
  const goToFriendsPage = () => navigate('/dashboard/friends');
const goToAllDmsPage = () => navigate('/dashboard/all-dms');   // Artık AllDmsPage'e gider
  const handleSendFriendRequest = async (e) => {
    e.preventDefault();
    setRequestMessage('');

    if (!recipientUsername.trim()) return;

    try {
      const res = await axiosInstance.post('/friends/request', {
        recipientUsername: recipientUsername.trim(),
      });
      setRequestMessage(res.data.message || 'İstek gönderildi');
      setRecipientUsername('');

      if (res.data.data) {
        setPendingRequests((prev) => [...prev, res.data.data]);
        addToast('İstek gönderildi', 'success'); // 🔔
      }
    } catch (err) {
      setRequestMessage(err.response?.data?.message || 'Hata');
      addToast('Hata oluştu', 'error'); // 🔔
    }
  };

  const handleFriendResponse = async (requestId, response) => {
    try {
      const res = await axiosInstance.post(`/friends/requests/${requestId}`, {
        response,
      });

      setPendingRequests((prev) => prev.filter((r) => r._id !== requestId));

      if (response === 'accepted' && res.data.data) {
        setFriends((prev) => [...prev, res.data.data]);
        addToast('Arkadaş eklendi', 'success'); // 🔔
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveFriend = async (targetUserId) => {
    try {
      await axiosInstance.post('/friends/remove', { targetUserId });

      setFriends(prev => prev.filter(f => f._id !== targetUserId));
          setPendingRequests(prev => prev.filter(req => req.recipient?._id !== targetUserId));
          addToast('Kişi silindi', 'success' // 🔔
      );
    } catch (err) {
      alert('Hata oluştu');
    }
  };

  const startDmFromRail = async (friendId) => {
    try {
      const res = await axiosInstance.post(`/friends/dm/${friendId}`);
      const conversation = res.data.data;
      navigate(`/dashboard/dm/${friendId}/${conversation._id}`);
    } catch (err) {
      console.error('DM açılamadı', err);
    }
  };

  const handleContextMenu = (e, userObj, type) => {
    e.preventDefault();
    const correctedUser = {
      ...userObj,
      avatarUrl: toAbsolute(getAvatarUrl(userObj)),
    };
    setContextMenu({
      x: e.pageX,
      y: e.pageY,
      user: correctedUser,
      type,
    });
  };

  const handleMenuAction = (action, targetUser) => {
    setContextMenu(null);

    if (action === 'profile') {
      setShowProfileModal(targetUser._id);
      return;
    }

    if (action === 'message') {
      axiosInstance.post(`/friends/dm/${targetUser._id}`).then((res) => {
        navigate(`/dashboard/dm/${targetUser._id}/${res.data.data._id}`);
      });
      return;
    }

    if (action === 'remove' || action === 'cancel') {
      setConfirmModal({
              isOpen: true,
              title: action === 'remove' ? 'Arkadaşı Çıkar' : 'İsteği İptal Et',
              message: `Bu işlemi yapmak istediğine emin misin?`,
              isDanger: true,
              confirmText: 'Evet',
              onConfirm: () => handleRemoveFriend(targetUser._id)
          });
      return;
    }

    if (action === 'accept' || action === 'reject') {
      const req = pendingRequests.find(
        (r) => r.requester?._id === targetUser._id
      );
      if (req) {
        handleFriendResponse(
          req._id,
          action === 'accept' ? 'accepted' : 'rejected'
        );
      }
    }
  };

  const onPostCreated = (newPost) =>
    setPosts((prev) => [newPost, ...prev]);

  const onPostUpdated = (upd) =>
    setPosts((prev) => prev.map((p) => (p._id === upd._id ? upd : p)));

  // ============================================================
  // Memoized veriler
  // ============================================================
  const friendSuggestions = useMemo(() => {
    return friends
      .filter((f) => f?._id && f._id !== user?.id)
      .map((f) => ({
        ...f,
        avatar: toAbsolute(getAvatarUrl(f)),
      }))
      .slice(0, 6);
  }, [friends, user]);

  const dmShortlist = useMemo(
    () => friendSuggestions.slice(0, 4),
    [friendSuggestions]
  );

  const onlineCount = useMemo(
    () => friendSuggestions.filter((f) => f.onlineStatus === 'online').length,
    [friendSuggestions]
  );

  const getStatusText = (friend) => {
    if (friend.onlineStatus === 'online') return 'Çevrimiçi';
    if (friend.lastSeenAt) {
      const dt = new Date(friend.lastSeenAt);
      return `Son: ${dt.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
      })} ${dt.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }
    return 'Çevrimdışı';
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="feed-shell" onClick={() => setContextMenu(null)}>
      {/* POST ALANI */}
      <div className="feed-main">
        <CreatePost onPostCreated={onPostCreated} />
        <div className="feed-list">
          {loading ? (
            <p className="feed-status">Yükleniyor...</p>
          ) : (
            posts.map((post) => (
              <PostCard
                key={post._id}
                post={post}
                onPostUpdated={onPostUpdated}
                getAvatarUrl={getAvatarUrl}
                handleAvatarError={handleAvatarError}
              />
            ))
          )}
        </div>
      </div>

      {/* SAĞ PANEL */}
      <aside className="feed-rail">
        {/* Profil Kartı */}
        <div className="rail-card rail-profile">
          <div className="rail-profile-avatar">
            <img
              src={toAbsolute(getAvatarUrl(user))}
              onError={handleAvatarError}
              alt="Avatar"
            />
          </div>
          <div className="rail-profile-meta">
            <p className="rail-profile-name">{user?.username}</p>
            <span className="rail-profile-sub">
              {onlineCount} çevrimiçi arkadaş
            </span>
          </div>
          <button
            className="rail-btn rail-btn-outline"
            onClick={goProfile}
          >
            Profil
          </button>
        </div>

        {/* Arkadaş Ekle Formu */}
        <div className="rail-card">
          <div className="rail-card-header">
            <h4>Arkadaş Ekle</h4>
          </div>
          <form className="rail-form" onSubmit={handleSendFriendRequest}>
            <input
              type="text"
              className="rail-input"
              placeholder="Kullanıcı adı..."
              value={recipientUsername}
              onChange={(e) => setRecipientUsername(e.target.value)}
            />
            <button
              type="submit"
              className="rail-btn rail-btn-primary"
            >
              İstek Gönder
            </button>
            {requestMessage && (
              <p className="rail-feedback">{requestMessage}</p>
            )}
          </form>
        </div>

        {/* Arkadaşlar */}
        <div className="rail-card">
          <div
              className="rail-card-header clickable-header"
              onClick={goToFriendsPage}
              style={{cursor: 'pointer'}}
              title="Tümünü Gör"

          >

            <h4>Arkadaşlar</h4>

            <span className="rail-chip">{onlineCount}</span>
            <button
                className="rail-link"
                type="button"
                onClick={goToFriendsPage}
            >
              Tümünü gör
            </button>
          </div>
          <div className="rail-list">
            {friendSuggestions.map((friend) => (
                <div
                    key={friend._id}
                    className="rail-user"
                onContextMenu={(e) =>
                  handleContextMenu(e, friend, 'friend')
                }
              >
                <div className="rail-user-avatar">
                  <img
                    src={friend.avatar}
                    onError={handleAvatarError}
                    alt={friend.username}
                  />
                </div>
                <div className="rail-user-meta">
                  <span className="rail-user-name">
                    {friend.username}
                  </span>
                  <span className="rail-user-status">
                    <span
                      className={`status-dot ${
                        friend.onlineStatus === 'online'
                          ? 'online'
                          : 'offline'
                      }`}
                    />
                    {getStatusText(friend)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* DM KUTUSU */}
        <div className="rail-card">
          <div className="rail-card-header">
            <h4
              onClick={goToFriendsPage}
              style={{ cursor: 'pointer' }}
            >
              DM Kutusu
            </h4>
            <button
              className="rail-link"
              type="button"
              onClick={goToFriendsPage}
            >
              Tümünü gör
            </button>
          </div>
          <div className="rail-list dm-list">
            {dmShortlist.map((dm) => (
              <div key={dm._id} className="rail-user dm-user">
                <div className="rail-user-avatar">
                  <img
                    src={dm.avatar}
                    onError={handleAvatarError}
                    alt={dm.username}
                  />
                </div>
                <div className="rail-user-meta">
                  <span className="rail-user-name">{dm.username}</span>
                  <span className="rail-user-status">
                    {getStatusText(dm)}
                  </span>
                </div>
                <button
                  className="rail-btn rail-btn-primary"
                  onClick={() => startDmFromRail(dm._id)}
                >
                  Mesaj
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* İSTEKLER */}
        <div className="rail-card">
          <div className="rail-card-header">
            <h4>İstekler</h4>
            <span className="rail-chip">
              {pendingRequests.length}
            </span>
          </div>
          <div className="rail-list">
            {pendingRequests.map((req) => {
              const requesterId = req.requester?._id || req.requester;
              const isOutgoing = requesterId === user?.id;
              const otherUser = isOutgoing
                ? req.recipient
                : req.requester;
              const contextType = isOutgoing
                ? 'pending_outgoing'
                : 'pending_incoming';

              return (
                <div
                  key={req._id}
                  className="rail-user"
                  onContextMenu={(e) =>
                    handleContextMenu(e, otherUser, contextType)
                  }
                >
                  <div className="rail-user-avatar">
                    <img
                      src={toAbsolute(getAvatarUrl(otherUser))}
                      onError={handleAvatarError}
                      alt="Avatar"
                    />
                  </div>
                  <div className="rail-user-meta">
                    <span className="rail-user-name">
                      {otherUser?.username}
                    </span>
                    <span
                      className="rail-user-status"
                      style={{
                        color: isOutgoing ? '#faa61a' : '#3ba55c',
                      }}
                    >
                      {isOutgoing ? 'Bekleniyor...' : 'İstek gönderdi'}
                    </span>
                  </div>
                  <div className="rail-actions">
                      {isOutgoing ? (
                        // GİDEN İSTEK: BUTON YOK, BEKLENİYOR YAZISI
                        <span style={{ fontSize: '11px', color: '#b9bbbe', fontStyle: 'italic' }}>

                        </span>
                      ) : (
                        // GELEN İSTEK: KABUL/RED
                        <>
                          <button
                            className="rail-btn rail-btn-primary"
                            style={{ padding: '6px 10px', fontSize: '12px', background: '#3ba55c' }}
                            type="button"
                            onClick={() => handleFriendResponse(req._id, 'accepted')}
                          >
                            ✓
                          </button>
                          <button
                            className="rail-btn"
                            style={{ padding: '6px 10px', fontSize: '12px', background: '#ed4245' }}
                            type="button"
                            onClick={() => handleFriendResponse(req._id, 'rejected')}
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>

                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* CONTEXT MENU */}
      {contextMenu && (
        <FeedContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          user={contextMenu.user}
          relationshipType={contextMenu.type}
          onClose={() => setContextMenu(null)}
          onAction={handleMenuAction}
        />
      )}

      {showProfileModal && (
        <UserProfileModal
          userId={showProfileModal}
          onClose={() => setShowProfileModal(null)}
        />
      )}
    <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(p => ({...p, isOpen: false}))}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        isDanger={confirmModal.isDanger}
        confirmText={confirmModal.confirmText}
      />
    </div>
  );
};

export default FeedPage;
