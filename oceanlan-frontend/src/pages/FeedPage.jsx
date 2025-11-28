// src/pages/FeedPage.jsx
import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
import CreatePost from '../components/feed/CreatePost';
import PostCard from '../components/feed/PostCard';
import { useSocket } from '../hooks/useSocket';
import { AuthContext } from '../context/AuthContext';

import '../styles/FeedPage.css';
const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const DEFAULT_AVATAR = '/default-avatar.png';

export const getAvatarUrl = (entity) => {
  return entity?.avatarUrl || entity?.avatar || DEFAULT_AVATAR;
};

export const handleAvatarError = (e) => {
  if (e?.target?.dataset?.fallbackApplied === 'true') return;
  if (e?.target) {
    e.target.dataset.fallbackApplied = 'true';
    e.target.src = DEFAULT_AVATAR;
  }
};

const toAbsolute = (src) => {
  if (!src) return DEFAULT_AVATAR;
  return src.startsWith('/uploads') ? `${API_URL_BASE}${src}` : src;
};

const FeedPage = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [recipientUsername, setRecipientUsername] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const { socket } = useSocket();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const fetchFeed = async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get('/posts/feed');
      setPosts(res.data.data);
    } catch (error) {
      console.error('Akış yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, []);

  useEffect(() => {
    if (socket && user) {
      const handleNewPost = (newPost) => {
        if (newPost.user._id !== user.id) {
          setPosts((prevPosts) => [newPost, ...prevPosts]);
        }
      };

      const handlePostUpdated = (updatedPost) => {
        setPosts((prevPosts) =>
          prevPosts.map((p) => (p._id === updatedPost._id ? updatedPost : p))
        );
      };

      const handleNewComment = (data) => {
        const { postId, comment } = data;

        if (comment.user._id !== user.id) {
          setPosts((prevPosts) =>
            prevPosts.map((p) => {
              if (p._id === postId) {
                return {
                  ...p,
                  comments: [...p.comments, comment],
                };
              }
              return p;
            })
          );
        }
      };

      socket.on('newFeedPost', handleNewPost);
      socket.on('postUpdated', handlePostUpdated);
      socket.on('newComment', handleNewComment);

      return () => {
        socket.off('newFeedPost', handleNewPost);
        socket.off('postUpdated', handlePostUpdated);
        socket.off('newComment', handleNewComment);
      };
    }
  }, [socket, user]);

  useEffect(() => {
    const fetchPending = async () => {
      try {
        const res = await axiosInstance.get('/friends/requests/pending');
        setPendingRequests(res.data.data || []);
      } catch (err) {
        console.error('Bekleyen istekler alınamadı', err);
      }
    };
    fetchPending();
  }, []);

  useEffect(() => {
    const fetchFriends = async () => {
      try {
        const res = await axiosInstance.get('/friends');
        setFriends(res.data.data || []);
      } catch (err) {
        console.error('Arkadaş listesi alınamadı', err);
      }
    };
    fetchFriends();
  }, []);

  const handleFriendResponse = async (requestId, response) => {
    try {
      await axiosInstance.post(`/friends/requests/${requestId}`, { response });
      setPendingRequests((prev) => prev.filter((r) => r._id !== requestId));
    } catch (err) {
      console.error('İstek yanıtlanamadı', err);
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
    } catch (err) {
      setRequestMessage(err.response?.data?.message || 'İstek gönderilemedi');
    }
  };

  const goProfile = () => navigate('/dashboard/settings/profile');
  
  // 📢 YENİ: Arkadaşlar sayfasına gitme fonksiyonu
  const goToFriendsPage = () => navigate('/dashboard/friends');

  const onPostCreated = (newPost) => {
    setPosts((prevPosts) => [newPost, ...prevPosts]);
  };

  const onPostUpdated = (updatedPost) => {
    setPosts((prevPosts) => prevPosts.map((p) => (p._id === updatedPost._id ? updatedPost : p)));
  };

  const friendSuggestions = useMemo(() => {
    return (friends || [])
      .filter((f) => f?._id && f._id !== user?.id)
      .map((f) => ({
        id: f._id,
        username: f.username,
        avatar: toAbsolute(getAvatarUrl(f)),
        onlineStatus: f.onlineStatus,
        lastSeenAt: f.lastSeenAt,
      }))
      .slice(0, 6);
  }, [friends, user]);

  const dmShortlist = useMemo(() => friendSuggestions.slice(0, 4), [friendSuggestions]);

  // 📢 YENİ: Tarih formatını biraz daha kısa tutmak için düzenlendi
  const getStatusText = (friend) => {
    if (friend.onlineStatus === 'online') return 'Çevrimiçi';
    if (friend.lastSeenAt) {
      const dt = new Date(friend.lastSeenAt);
      // Örn: 24 Kas 14:30
      return `Son: ${dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return 'Çevrimdışı';
  };

  const onlineCount = useMemo(
    () => friendSuggestions.filter((f) => f.onlineStatus === 'online').length,
    [friendSuggestions]
  );

  return (
    <div className="feed-shell">
      <div className="feed-main">
        <CreatePost onPostCreated={onPostCreated} />

        <div className="feed-list">
          {loading ? (
            <p className="feed-status">Yükleniyor...</p>
          ) : posts.length === 0 ? (
            <p className="feed-status">Takip ettiğiniz kişilerden veya sizden henüz gönderi yok.</p>
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

      <aside className="feed-rail">
        <div className="rail-card rail-profile">
          <div className="rail-profile-avatar">
            <img src={toAbsolute(getAvatarUrl(user))} alt="Profil avatarı" onError={handleAvatarError} />
          </div>
          <div className="rail-profile-meta">
            <p className="rail-profile-name">{user?.username || 'Misafir'}</p>
            <span className="rail-profile-sub">{onlineCount} çevrimiçi arkadaş</span>
          </div>
          <button className="rail-btn rail-btn-outline" type="button" onClick={goProfile}>
            Profil
          </button>
        </div>

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
            <button type="submit" className="rail-btn rail-btn-primary">İstek Gönder</button>
            {requestMessage && <p className="rail-feedback">{requestMessage}</p>}
          </form>
        </div>

        {/* 📢 GÜNCELLENDİ: Arkadaşlar Kartı - Tıklayınca Tümünü Gör */}
        <div className="rail-card">
          <div 
            className="rail-card-header clickable-header" 
            onClick={goToFriendsPage} 
            style={{ cursor: 'pointer' }}
            title="Tüm arkadaşları gör"
          >
            <h4>Arkadaşlar</h4>
            <span className="rail-chip">{onlineCount} çevrimiçi</span>
          </div>
          <div className="rail-list">
            {friendSuggestions.length === 0 ? (
              <p className="rail-empty">Henüz arkadaş etkinliği yok.</p>
            ) : (
              friendSuggestions.map((friend) => (
                <div key={friend.id} className="rail-user">
                  <div className="rail-user-avatar">
                    <img src={friend.avatar} alt={`${friend.username} avatarı`} onError={handleAvatarError} />
                  </div>
                  <div className="rail-user-meta">
                    <span className="rail-user-name">{friend.username}</span>
                    <span className="rail-user-status">
                      <span
                        className={`status-dot ${friend.onlineStatus === 'online' ? 'online' : 'offline'}`}
                        aria-hidden="true"
                      />
                      {getStatusText(friend)}
                    </span>
                  </div>
                  <button
                    className="rail-btn rail-btn-primary"
                    type="button"
                    onClick={() => startDmFromRail(friend.id)}
                  >
                    Mesaj
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 📢 GÜNCELLENDİ: DM Kutusu Kartı */}
        <div className="rail-card">
          <div className="rail-card-header">
            <h4 
              onClick={goToFriendsPage} 
              style={{ cursor: 'pointer' }}
            >
              DM Kutusu
            </h4>
            <button className="rail-link" type="button" onClick={goToFriendsPage}>
              Tümünü gör
            </button>
          </div>
          <div className="rail-list dm-list">
            {dmShortlist.length === 0 ? (
              <p className="rail-empty">DM listesi boş.</p>
            ) : (
              dmShortlist.map((dm) => (
                <div key={dm.id} className="rail-user dm-user">
                  <div className="rail-user-avatar">
                    <img src={dm.avatar} alt={`${dm.username} avatarı`} onError={handleAvatarError} />
                  </div>
                  <div className="rail-user-meta">
                    <span className="rail-user-name">{dm.username}</span>
                    
                    {/* 📢 DÜZELTİLDİ: Artık statik "Şimdi" yerine gerçek veri yazıyor */}
                    <span className="rail-user-status">
                        {getStatusText(dm)}
                    </span>

                  </div>
                  <button
                    className="rail-btn rail-btn-primary"
                    type="button"
                    onClick={() => startDmFromRail(dm.id)}
                  >
                    Mesaj
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rail-card">
          <div className="rail-card-header">
            <h4>Arkadaşlık İstekleri</h4>
            <span className="rail-chip">{pendingRequests.length}</span>
          </div>
          <div className="rail-list">
            {pendingRequests.length === 0 ? (
              <p className="rail-empty">Bekleyen isteğin yok.</p>
            ) : (
              pendingRequests.map((req) => (
                <div key={req._id} className="rail-user">
                  <div className="rail-user-avatar">
                    <img
                      src={toAbsolute(getAvatarUrl(req.requester))}
                      alt={`${req.requester?.username || 'Kullanıcı'} avatarı`}
                      onError={handleAvatarError}
                    />
                  </div>
                  <div className="rail-user-meta">
                    <span className="rail-user-name">{req.requester?.username}</span>
                    <span className="rail-user-status">Sana istek gönderdi</span>
                  </div>
                  <div className="rail-actions">
                    <button
                      className="rail-btn rail-btn-primary"
                      type="button"
                      onClick={() => handleFriendResponse(req._id, 'accepted')}
                    >
                      Kabul
                    </button>
                    <button
                      className="rail-btn"
                      type="button"
                      onClick={() => handleFriendResponse(req._id, 'rejected')}
                    >
                      Reddet
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};

export default FeedPage;