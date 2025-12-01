// src/components/views/FriendsView.jsx
import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import { ToastContext } from '../../context/ToastContext'; // 🔔 Toast eklendi
import axiosInstance from '../../utils/axiosInstance';
import ConfirmationModal from '../modals/ConfirmationModal'; // 🔔 Modal eklendi
import '../../styles/FriendsView.css';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_URL = `/friends`;

const getAvatarSrc = (avatarUrl) => {
  if (!avatarUrl) return '/default-avatar.png';
  if (avatarUrl.startsWith('http')) return avatarUrl;
  return `${API_URL_BASE}${avatarUrl}`;
};

const FriendsView = () => {
  const [activeTab, setActiveTab] = useState('online');
  const [pendingRequests, setPendingRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [recipientUsername, setRecipientUsername] = useState('');
  const [message, setMessage] = useState('');
  const [msgType, setMsgType] = useState('');

  // 🔔 Onay Modalı State'leri
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDanger: false });

  const { user } = useContext(AuthContext);
  const { socket } = useSocket();
  const { addToast } = useContext(ToastContext); // 🔔 Toast Context
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      axiosInstance.get(API_URL).then(res => setFriends(res.data.data || [])).catch(console.error);
      axiosInstance.get(`${API_URL}/requests/pending`).then(res => setPendingRequests(res.data.data || [])).catch(console.error);
    }
  }, [user]);

  // Socket dinleyicileri (Aynı kalacak)
  useEffect(() => {
      if (!socket) return;
      const handleNewRequest = (req) => {
          setPendingRequests(p => [...p, req]);
          addToast('Yeni arkadaşlık isteği geldi', 'info'); // 🔔
      };
      const handleAccepted = (friend) => {
          setFriends(p => [...p, friend]);
          setPendingRequests(p => p.filter(r => String(r.recipient?._id) !== String(friend._id) && String(r.requester?._id) !== String(friend._id)));
          addToast(`${friend.username} isteğini kabul etti!`, 'success'); // 🔔
      };
      const handleRemoved = ({ removedUserId }) => setFriends(p => p.filter(f => String(f._id) !== String(removedUserId)));
      const handleCancelled = ({ cancelledUserId }) => setPendingRequests(p => p.filter(r => String(r.requester?._id) !== String(cancelledUserId) && String(r.recipient?._id) !== String(cancelledUserId)));

      socket.on('newFriendRequest', handleNewRequest);
      socket.on('friendRequestAccepted', handleAccepted);
      socket.on('friendRemoved', handleRemoved);
      socket.on('friendRequestCancelled', handleCancelled);

      return () => {
          socket.off('newFriendRequest'); socket.off('friendRequestAccepted');
          socket.off('friendRemoved'); socket.off('friendRequestCancelled');
      };
  }, [socket, addToast]);

  const onlineFriends = useMemo(() => friends.filter(f => f.onlineStatus === 'online'), [friends]);
  const allFriends = friends;

  // --- İŞLEMLER ---

  // İstek Gönder
  const handleSendRequest = async (e) => {
    e.preventDefault();
    setMessage('');
    if (!recipientUsername.trim()) return;

    try {
      const res = await axiosInstance.post(`${API_URL}/request`, { recipientUsername });
      setMessage(res.data.message);
      setMsgType('success');
      setRecipientUsername('');
      if (res.data.data) setPendingRequests(prev => [...prev, res.data.data]);
      addToast('Arkadaşlık isteği gönderildi', 'success'); // 🔔
    } catch (error) {
      setMessage(error.response?.data?.message || 'Hata');
      setMsgType('error');
      addToast('İstek gönderilemedi', 'error'); // 🔔
    }
  };

  const handleResponse = async (id, status) => {
      try {
          const res = await axiosInstance.post(`${API_URL}/requests/${id}`, { response: status });
          setPendingRequests(p => p.filter(r => r._id !== id));
          if(status === 'accepted' && res.data.data) {
              setFriends(p => [...p, res.data.data]);
              addToast('Arkadaş eklendi!', 'success'); // 🔔
          }
      } catch(e) { console.error(e); }
  };

  // 🔔 SİLME İŞLEMİ (MODAL İLE)
  const handleRemoveClick = (id, isRequest = false) => {
      setConfirmModal({
          isOpen: true,
          title: isRequest ? 'İsteği İptal Et' : 'Arkadaşı Çıkar',
          message: isRequest ? 'Bu arkadaşlık isteğini iptal etmek istediğine emin misin?' : 'Bu kişiyi arkadaş listenden çıkarmak istediğine emin misin?',
          isDanger: true,
          confirmText: isRequest ? 'İptal Et' : 'Çıkar',
          onConfirm: () => performRemove(id, isRequest)
      });
  };

  const performRemove = async (id, isRequest) => {
      try {
          await axiosInstance.post(`${API_URL}/remove`, { targetUserId: id });
          setFriends(p => p.filter(f => f._id !== id));
          setPendingRequests(p => p.filter(r => r.recipient?._id !== id && r.requester?._id !== id));

          addToast(isRequest ? 'İstek iptal edildi' : 'Arkadaşlıktan çıkarıldı', 'success'); // 🔔
      } catch(e) {
          addToast('İşlem başarısız', 'error');
      }
  };

  const startDM = async (id) => {
      try {
          const res = await axiosInstance.post(`${API_URL}/dm/${id}`);
          navigate(`/dashboard/dm/${id}/${res.data.data._id}`);
      } catch(e) { console.error(e); }
  };

  return (
    <div className="friends-view">
      <div className="friends-header">
          <div className="friends-title-row">
              <span className="friends-icon">👥</span>
              <h2>Arkadaşlar</h2>
          </div>
          <div className="friends-tabs">
              <button className={`tab-btn tab-online ${activeTab === 'online' ? 'active' : ''}`} onClick={() => setActiveTab('online')}>Çevrimiçi</button>
              <button className={`tab-btn tab-all ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>Tümü</button>
              <button className={`tab-btn tab-pending ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>Bekleyenler ({pendingRequests.length})</button>
              <button className={`tab-btn tab-add ${activeTab === 'add' ? 'active' : ''}`} onClick={() => setActiveTab('add')}>Arkadaş Ekle</button>
          </div>
      </div>

      <div className="friends-list-container">
          {activeTab === 'add' && (
              <div className="friends-add-section">
                  <h3 className="friends-add-header">ARKADAŞ EKLE</h3>
                  <p className="friends-add-sub">Kullanıcı adını kullanarak arkadaş ekleyebilirsin.</p>
                  <form onSubmit={handleSendRequest} className="friends-add-form">
                      <input className="friends-input" placeholder="Kullanıcı Adı..." value={recipientUsername} onChange={e => setRecipientUsername(e.target.value)} autoFocus />
                      <button type="submit" className="friend-btn friend-btn-primary" disabled={!recipientUsername}>İstek Gönder</button>
                  </form>
                  {message && <p className={`friends-message ${msgType}`}>{message}</p>}
              </div>
          )}

          {activeTab === 'online' && (
              <>
                  <div className="section-label">ÇEVRİMİÇİ — {onlineFriends.length}</div>
                  <ul className="friends-list">
                      {onlineFriends.map(f => <FriendListItem key={f._id} friend={f} onMessage={() => startDM(f._id)} onRemove={() => handleRemoveClick(f._id)} />)}
                  </ul>
              </>
          )}

          {activeTab === 'all' && (
              <>
                  <div className="section-label">TÜM ARKADAŞLAR — {allFriends.length}</div>
                  <ul className="friends-list">
                      {allFriends.map(f => <FriendListItem key={f._id} friend={f} onMessage={() => startDM(f._id)} onRemove={() => handleRemoveClick(f._id)} />)}
                  </ul>
              </>
          )}

          {activeTab === 'pending' && (
              <>
                  <div className="section-label">BEKLEYEN İSTEKLER — {pendingRequests.length}</div>
                  <ul className="friends-list">
                      {pendingRequests.map(req => {
                          const isOutgoing = req.requester?._id === user.id;
                          const otherUser = isOutgoing ? req.recipient : req.requester;
                          return <PendingListItem key={req._id} user={otherUser} isOutgoing={isOutgoing} onAccept={() => handleResponse(req._id, 'accepted')} onReject={() => handleResponse(req._id, 'rejected')} onCancel={() => handleRemoveClick(otherUser._id, true)} />;
                      })}
                  </ul>
              </>
          )}
      </div>

      {/* 🔔 ONAY PENCERESİ */}
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

const FriendListItem = ({ friend, onMessage, onRemove }) => (
    <li className="friend-item">
        <div className="friend-main">
            <div className="friend-avatar-wrapper">
                <img src={getAvatarSrc(friend.avatarUrl)} alt="avatar" className="friend-avatar" />
                <span className={`friend-status-dot ${friend.onlineStatus}`} />
            </div>
            <div className="friend-info">
                <span className="friend-username">{friend.username}</span>
                <span className="friend-status-text">{friend.onlineStatus === 'online' ? 'Çevrimiçi' : 'Çevrimdışı'}</span>
            </div>
        </div>
        <div className="friend-actions">
            <button className="action-icon-btn msg" title="Mesaj" onClick={onMessage}>💬</button>
            <button className="action-icon-btn del" title="Sil" onClick={onRemove}>✕</button>
        </div>
    </li>
);

const PendingListItem = ({ user, isOutgoing, onAccept, onReject, onCancel }) => (
    <li className="friend-item">
        <div className="friend-main">
            <div className="friend-avatar-wrapper">
                <img src={getAvatarSrc(user?.avatarUrl)} alt="avatar" className="friend-avatar" />
            </div>
            <div className="friend-info">
                <span className="friend-username">{user?.username}</span>
                <span className="friend-status-text">{isOutgoing ? 'Giden İstek' : 'Gelen İstek'}</span>
            </div>
        </div>
        <div className="friend-actions">
            {isOutgoing ? (
                <button className="action-icon-btn del" title="İptal Et" onClick={onCancel}>✕</button>
            ) : (
                <>
                    <button className="action-icon-btn acc" title="Kabul Et" onClick={onAccept}>✓</button>
                    <button className="action-icon-btn del" title="Reddet" onClick={onReject}>✕</button>
                </>
            )}
        </div>
    </li>
);

export default FriendsView;