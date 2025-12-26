// src/pages/FeedPage.jsx
import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
import CreatePost from '../components/feed/CreatePost';
import PostCard from '../components/feed/PostCard';
import FeedContextMenu from '../components/modals/FeedContextMenu';
import UserProfileModal from '../components/profile/UserProfileModal';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import { useSocket } from '../hooks/useSocket';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';
import { getImageUrl } from '../utils/urlHelper';
import UserLevelTag from '../components/gamification/UserLevelTag';
import LevelUpModal from '../components/gamification/LevelUpModal';
import '../styles/FeedPage.css';

const getAvatarUrlWrapper = (entity) => getImageUrl(entity?.avatarUrl || entity?.avatar);
const handleAvatarErrorWrapper = (e) => {
  if (e?.target?.dataset?.fallbackApplied === 'true') return;
  if (e?.target) { e.target.dataset.fallbackApplied = 'true'; e.target.src = getImageUrl(null); }
};

const FeedPage = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [recipientUsername, setRecipientUsername] = useState('');
  const [requestMessage, setRequestMessage] = useState('');

  const [contextMenu, setContextMenu] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDanger: false });

  const { socket } = useSocket();
  const { user, unreadDmConversations } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const navigate = useNavigate();

  // 🛠️ ID GÜVENLİĞİ: Profil güncellemelerinden etkilenmemesi için
  const currentUserId = user?._id || user?.id;

  // ✅ EKLENDİ: Profil modal açma helper (useEffect içine girmesin)
  const openProfile = (u) => {
    const id = u?._id || u?.id;
    if (!id) return;
    setShowProfileModal(id);
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [feedRes, reqRes, friendRes] = await Promise.all([
          axiosInstance.get('/posts/feed').catch(() => ({ data: { data: [] } })),
          axiosInstance.get('/friends/requests/pending').catch(() => ({ data: { data: [] } })),
          axiosInstance.get('/friends').catch(() => ({ data: { data: [] } }))
        ]);
        setPosts(feedRes.data.data);
        setPendingRequests(reqRes.data.data);
        setFriends(friendRes.data.data);
      } catch (error) { console.error("Veri yükleme hatası:", error); } finally { setLoading(false); }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!socket || !currentUserId) return;

    // 🟢 ID'leri String'e çevirerek karşılaştırıyoruz
    const handlePostDeleted = ({ postId }) => { setPosts(prev => prev.filter(p => String(p._id) !== String(postId))); };
    const handleNewPost = (newPost) => {
      if (String(newPost.user._id) !== String(currentUserId)) setPosts(p => [newPost, ...p]);
    };
    const handlePostUpdated = (updated) => { setPosts(p => p.map(post => String(post._id) === String(updated._id) ? updated : post)); };
    const handleNewComment = ({ postId, comment }) => {
      if (String(comment.user._id) !== String(currentUserId)) {
        setPosts(p => p.map(post => String(post._id) === String(postId) ? { ...post, comments: [...post.comments, comment] } : post));
      }
    };

    // Diğer socket eventleri...
    const handleNewFriendRequest = (newRequest) => {
      setPendingRequests(prev => {
        if (prev.some(req => req._id === newRequest._id)) return prev;
        return [...prev, newRequest];
      });
    };
    const handleFriendRequestAccepted = (newFriend) => {
      setFriends(prev => {
        if (prev.find(f => String(f._id) === String(newFriend._id))) return prev;
        return [...prev, newFriend];
      });
      setPendingRequests(prev => prev.filter(req =>
        String(req.recipient?._id) !== String(newFriend._id) &&
        String(req.requester?._id) !== String(newFriend._id)
      ));
    };
    const handleFriendRemoved = ({ removedUserId }) => { setFriends(prev => prev.filter(f => String(f._id) !== String(removedUserId))); };
    const handleRequestCancelled = ({ cancelledUserId }) => {
      setPendingRequests(prev => prev.filter(req =>
        String(req.requester?._id) !== String(cancelledUserId) &&
        String(req.recipient?._id) !== String(cancelledUserId)
      ));
    };

    const handleUnreadDm = ({ conversationId, senderId }) => {
      setFriends(prevFriends => {
        const friendIndex = prevFriends.findIndex(f => f._id === senderId || f.conversationId === conversationId);
        if (friendIndex > -1) {
          const updated = [...prevFriends];
          const [friend] = updated.splice(friendIndex, 1);
          friend.lastMessageAt = new Date().toISOString();
          return [friend, ...updated];
        }
        return prevFriends;
      });
    };

    socket.on('newFeedPost', handleNewPost);
    socket.on('postUpdated', handlePostUpdated);
    socket.on('newComment', handleNewComment);
    socket.on('newFriendRequest', handleNewFriendRequest);
    socket.on('friendRequestAccepted', handleFriendRequestAccepted);
    socket.on('friendRemoved', handleFriendRemoved);
    socket.on('friendRequestCancelled', handleRequestCancelled);
    socket.on('unreadDm', handleUnreadDm);
    socket.on('postDeleted', handlePostDeleted);

    return () => {
      socket.off('newFeedPost', handleNewPost);
      socket.off('postUpdated', handlePostUpdated);
      socket.off('newComment', handleNewComment);
      socket.off('newFriendRequest', handleNewFriendRequest);
      socket.off('friendRequestAccepted', handleFriendRequestAccepted);
      socket.off('friendRemoved', handleFriendRemoved);
      socket.off('friendRequestCancelled', handleRequestCancelled);
      socket.off('unreadDm', handleUnreadDm);
      socket.off('postDeleted', handlePostDeleted);
    };
  }, [socket, currentUserId]);

  const handlePostDeletedLocal = (postId) => {
    setPosts(prev => prev.filter(p => String(p._id) !== String(postId)));
  };

  const handleDeletePostProcess = (postId) => {
    setConfirmModal({
      isOpen: true,
      title: 'Gönderiyi Sil',
      message: 'Bu gönderiyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      isDanger: true,
      confirmText: 'Sil',
      onConfirm: async () => {
        try {
          await axiosInstance.delete(`/posts/${postId}`);
          handlePostDeletedLocal(postId);
          addToast('Gönderi başarıyla silindi.', 'success');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          console.error(error);
          addToast('Gönderi silinirken bir hata oluştu.', 'error');
        }
      }
    });
  };

  const goProfile = () => navigate('/dashboard/settings/profile');
  const goToFriendsPage = () => navigate('/dashboard/friends');
  const goToAllDmsPage = () => navigate('/dashboard/all-dms');

  const startDmFromRail = async (friendId) => {
    try {
      const res = await axiosInstance.post(`/friends/dm/${friendId}`);
      navigate(`/dashboard/dm/${friendId}/${res.data.data._id}`);
    } catch (err) { console.error('DM açılamadı', err); }
  };

  const handleSendFriendRequest = async (e) => {
    e.preventDefault(); setRequestMessage(''); if (!recipientUsername.trim()) return;
    try {
      const res = await axiosInstance.post('/friends/request', { recipientUsername: recipientUsername.trim() });
      setRequestMessage(res.data.message || 'İstek gönderildi'); setRecipientUsername('');
      if (res.data.data) setPendingRequests(prev => [...prev, res.data.data]);
      addToast('İstek gönderildi', 'success');
    } catch (err) { setRequestMessage(err.response?.data?.message || 'Hata'); addToast('Hata oluştu', 'error'); }
  };

  const handleFriendResponse = async (requestId, response) => {
    try {
      const res = await axiosInstance.post(`/friends/requests/${requestId}`, { response });
      setPendingRequests(prev => prev.filter(r => r._id !== requestId));
      if (response === 'accepted' && res.data.data) { setFriends(prev => [...prev, res.data.data]); addToast('Arkadaş eklendi', 'success'); }
    } catch (err) { console.error(err); }
  };

  const handleRemoveFriend = async (targetUserId) => {
    try {
      await axiosInstance.post('/friends/remove', { targetUserId });
      setFriends(prev => prev.filter(f => f._id !== targetUserId));
      setPendingRequests(prev => prev.filter(req => req.recipient?._id !== targetUserId));
      addToast('Kişi silindi', 'success');
    } catch (err) { addToast('Hata oluştu', 'error'); }
  };

  const handleContextMenu = (e, userObj, type) => {
    e.preventDefault();
    const avatarUrl = getImageUrl(userObj.avatarUrl || userObj.avatar);
    const correctedUser = { ...userObj, avatarUrl, _id: userObj._id || userObj.id };
    setContextMenu({ x: e.pageX, y: e.pageY, user: correctedUser, type });
  };

  const handleMenuAction = (action, targetUser) => {
    setContextMenu(null);
    if (action === 'profile') setShowProfileModal(targetUser._id);
    if (action === 'message') { axiosInstance.post(`/friends/dm/${targetUser._id}`).then(res => navigate(`/dashboard/dm/${targetUser._id}/${res.data.data._id}`)); }
    if (action === 'remove' || action === 'cancel') {
      setConfirmModal({
        isOpen: true,
        title: action === 'remove' ? 'Arkadaşı Çıkar' : 'İsteği İptal Et',
        message: 'Emin misin?',
        isDanger: true,
        confirmText: 'Evet',
        onConfirm: () => handleRemoveFriend(targetUser._id)
      });
    }
    if (action === 'accept' || action === 'reject') {
      const req = pendingRequests.find(r => r.requester?._id === targetUser._id);
      if (req) handleFriendResponse(req._id, action === 'accept' ? 'accepted' : 'rejected');
    }
  };

  const onPostCreated = (newPost) => setPosts(prev => [newPost, ...prev]);
  const onPostUpdated = (upd) => setPosts(prev => prev.map(p => String(p._id) === String(upd._id) ? upd : p));

  const friendSuggestions = useMemo(() => {
    return friends
      .filter(f => f?._id && String(f._id) !== String(currentUserId))
      .map(f => ({ ...f, avatar: getImageUrl(f.avatarUrl || f.avatar) }))
      .sort((a, b) => (b.level || 0) - (a.level || 0))
      .slice(0, 7);
  }, [friends, currentUserId]);

  const dmShortlist = useMemo(() => friends.slice(0, 7), [friends]);
  const onlineCount = useMemo(() => friendSuggestions.filter(f => f.onlineStatus === 'online').length, [friendSuggestions]);

  const getStatusText = (friend) => {
    if (friend.onlineStatus === 'online') return 'Çevrimiçi';
    if (friend.lastSeenAt) {
      const dt = new Date(friend.lastSeenAt);
      return `Son: ${dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    return 'Çevrimdışı';
  };

  return (
    <div className="feed-shell" onClick={() => setContextMenu(null)}>
      <div className="feed-main">
        <CreatePost onPostCreated={onPostCreated} />
        <div className="feed-list">
          {loading ? <p className="feed-status">Yükleniyor...</p> : posts.map(post =>
            <PostCard
              key={post._id}
              post={post}
              onPostUpdated={onPostUpdated}
              onDeleteClick={() => handleDeletePostProcess(post._id)}
              getAvatarUrl={getAvatarUrlWrapper}
              handleAvatarError={handleAvatarErrorWrapper}

              onOpenProfile={openProfile} // ✅ EKLE

            />
          )}
        </div>
      </div>

      <aside className="feed-rail">
        {/* PROFİL KARTI */}
        <div className="rail-card rail-profile">
          <div className="rail-profile-avatar">
            <img src={getImageUrl(user?.avatarUrl || user?.avatar)} onError={handleAvatarErrorWrapper} alt="Avatar" />
          </div>
          <div className="rail-profile-meta">
            <p className="rail-profile-name">{user?.username}</p>
            <span className="rail-profile-sub">{onlineCount} çevrimiçi arkadaş</span>
          </div>
          <button className="rail-btn rail-btn-outline" onClick={goProfile}>Profil</button>
        </div>

        {/* ARKADAŞ EKLE */}
        <div className="rail-card">
          <div className="rail-card-header"><h4>Arkadaş Ekle</h4></div>
          <form className="rail-form" onSubmit={handleSendFriendRequest}>
            <input
              type="text"
              className="rail-input"
              placeholder="Kullanıcı adı..."
              value={recipientUsername}
              onChange={e => setRecipientUsername(e.target.value)}
            />
            <button type="submit" className="rail-btn rail-btn-primary">İstek Gönder</button>
            {requestMessage && <p className="rail-feedback">{requestMessage}</p>}
          </form>
        </div>

        {/* ARKADAŞLAR */}
        <div className="rail-card">
          <div className="rail-card-header clickable-header" onClick={goToFriendsPage} title="Tümünü Gör">
            <h4>Arkadaşlar</h4>
            <span className="rail-chip">{onlineCount}</span>
          </div>

          <div className="rail-list">
            {friendSuggestions.map(friend => (
              <div
                key={friend._id}
                className="rail-user"
                onContextMenu={(e) => handleContextMenu(e, friend, 'friend')}
              >
                {/* ✅ Avatar tıklanınca profil */}
                <div
                  className="rail-user-avatar"
                  onClick={() => openProfile(friend)}
                  style={{ cursor: 'pointer' }}
                  title="Profili Görüntüle"
                >
                  <img src={friend.avatar} onError={handleAvatarErrorWrapper} alt={friend.username} />
                </div>

                <div className="rail-user-meta">
                  {/* ✅ İsim tıklanınca profil */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span
                      className="rail-user-name"
                      onClick={() => openProfile(friend)}
                      style={{ cursor: 'pointer' }}
                      title="Profili Görüntüle"
                    >
                      {friend.username}
                    </span>
                    {/* 👇 LEVEL EKLENDİ */}
                    <UserLevelTag level={friend.level}
                      activeBadge={friend?.activeBadge}
                    />
                  </div>

                  <span className="rail-user-status">
                    <span className={`status-dot ${friend.onlineStatus === 'online' ? 'online' : 'offline'}`} />
                    {getStatusText(friend)}
                  </span>
                </div>

                {/* ✅ Mesaj butonu: tıklama modal açmasın */}
                <button
                  className="rail-btn rail-btn-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    startDmFromRail(friend._id);
                  }}
                >
                  Mesaj
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* DM KUTUSU */}
        <div className="rail-card">
          <div className="rail-card-header">
            <h4 onClick={goToAllDmsPage} style={{ cursor: 'pointer' }}>DM Kutusu</h4>
            <button className="rail-link" type="button" onClick={goToAllDmsPage}>Tümünü gör</button>
          </div>

          <div className="rail-list dm-list">
            {dmShortlist.length === 0 ? (
              <p className="rail-empty">DM geçmişi yok.</p>
            ) : dmShortlist.map((dmUser) => {
              const hasUnread = unreadDmConversations.some(id => String(id) === String(dmUser.conversationId));
              const isOnline = dmUser.onlineStatus === 'online';

              return (
                <div key={dmUser._id} className="rail-user dm-user">
                  <div
                    className="rail-user-avatar"
                    style={{ position: 'relative', cursor: 'pointer' }}
                    onClick={() => openProfile(dmUser)}
                    title="Profili Görüntüle"
                  >
                    <img
                      src={getImageUrl(dmUser.avatarUrl || dmUser.avatar)}
                      onError={handleAvatarErrorWrapper}
                      alt={dmUser.username}
                    />
                    {hasUnread && (
                      <span
                        className="unread-badge"
                        title="Yeni Mesaj"
                        style={{
                          position: 'absolute',
                          bottom: -2,
                          right: -2,
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          backgroundColor: '#6ded42',
                          border: '3px solid #2f3136'
                        }}
                      />
                    )}
                  </div>

                  <div className="rail-user-meta">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span
                        className="rail-user-name"
                        onClick={() => openProfile(dmUser)}
                        style={{ cursor: 'pointer', fontWeight: hasUnread ? 'bold' : 'normal', color: hasUnread ? '#fff' : '' }}
                        title="Profili Görüntüle"
                      >
                        {dmUser.username}
                      </span>
                      {/* 👇 LEVEL EKLENDİ */}
                      <UserLevelTag level={dmUser.level}
                        activeBadge={dmUser?.activeBadge}
                      />
                    </div>

                    <span className="rail-user-status">
                      {hasUnread ? (
                        <span style={{ color: '#6ded42', fontWeight: 'bold', fontSize: '11px' }}>YENİ MESAJ</span>
                      ) : (
                        <>
                          <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                          {getStatusText(dmUser)}
                        </>
                      )}
                    </span>
                  </div>

                  <button
                    className="rail-btn rail-btn-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      startDmFromRail(dmUser._id);
                    }}
                  >
                    Mesaj
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* İSTEKLER */}
        <div className="rail-card">
          <div className="rail-card-header">
            <h4>İstekler</h4>
            <span className="rail-chip">{pendingRequests.length}</span>
          </div>

          <div className="rail-list">
            {pendingRequests.map(req => {
              const requesterId = req.requester?._id || req.requester;
              // 🟢 ID Kontrolü
              const isOutgoing = String(requesterId) === String(currentUserId);
              const otherUser = isOutgoing ? req.recipient : req.requester;

              return (
                <div
                  key={req._id}
                  className="rail-user"
                  onContextMenu={(e) => handleContextMenu(e, otherUser, isOutgoing ? 'pending_outgoing' : 'pending_incoming')}
                >
                  {/* ✅ EKLENDİ: Avatar tıklanınca profil */}
                  <div
                    className="rail-user-avatar"
                    onClick={() => openProfile(otherUser)}
                    style={{ cursor: 'pointer' }}
                    title="Profili Görüntüle"
                  >
                    <img
                      src={getImageUrl(otherUser.avatarUrl || otherUser.avatar)}
                      onError={handleAvatarErrorWrapper}
                      alt="Avatar"
                    />
                  </div>

                  <div className="rail-user-meta">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span
                        className="rail-user-name"
                        onClick={() => openProfile(otherUser)}
                        style={{ cursor: 'pointer' }}
                        title="Profili Görüntüle"
                      >
                        {otherUser?.username}
                      </span>
                      {/* 👇 LEVEL EKLENDİ */}
                      <UserLevelTag level={otherUser?.level}
                        activeBadge={otherUser?.activeBadge} />
                    </div>

                    {isOutgoing ? (
                      <span className="rail-user-status"
                        style={{ color: '#faa61a', fontWeight: '600', fontSize: '12px' }}>
                        ⏳ İstek Gönderildi
                      </span>
                    ) : (
                      <span className="rail-user-status"
                        style={{ color: '#3ba55c', fontWeight: '600', fontSize: '12px' }}>
                        Sana istek gönderdi
                      </span>
                    )}
                  </div>

                  <div className="rail-actions">
                    {isOutgoing ? (
                      <span style={{ fontSize: '11px', color: '#72767d', fontStyle: 'italic' }}>
                        Bekleniyor
                      </span>
                    ) : (
                      <>
                        <button
                          className="rail-btn rail-btn-primary"
                          style={{ padding: '4px 8px', background: '#3ba55c' }}
                          onClick={(e) => { e.stopPropagation(); handleFriendResponse(req._id, 'accepted'); }}
                        >
                          ✓
                        </button>

                        <button
                          className="rail-btn"
                          style={{ padding: '4px 8px', background: '#ed4245' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmModal({
                              isOpen: true,
                              title: 'İsteği Reddet',
                              message: 'Emin misin?',
                              isDanger: true,
                              confirmText: 'Reddet',
                              onConfirm: () => handleFriendResponse(req._id, 'rejected')
                            });
                          }}
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


      {contextMenu && <FeedContextMenu {...contextMenu} onClose={() => setContextMenu(null)} onAction={handleMenuAction} />}
      {showProfileModal && <UserProfileModal userId={showProfileModal} onClose={() => setShowProfileModal(null)} />}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(p => ({ ...p, isOpen: false }))}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        isDanger={confirmModal.isDanger}
        confirmText={confirmModal.confirmText}
      />
      <LevelUpModal />
    </div>
  );
};

export default FeedPage;
