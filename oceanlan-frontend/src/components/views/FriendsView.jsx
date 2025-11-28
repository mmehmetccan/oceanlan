// src/components/views/FriendsView.jsx
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { useSocket } from '../../hooks/useSocket'; // 👈 Socket Hook'unu Import Et
import '../../styles/FriendsView.css';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_URL = `${API_URL_BASE}/api/v1/friends`;

const getAvatarSrc = (avatarUrl) => {
  if (!avatarUrl) {
    return '/default-avatar.png';
  }
  if (avatarUrl.startsWith('http')) return avatarUrl;
  return `${API_URL_BASE}${avatarUrl}`;
};

const FriendsView = () => {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [recipientUsername, setRecipientUsername] = useState('');
  const [message, setMessage] = useState('');

  const { user } = useContext(AuthContext);
  const { socket } = useSocket(); // 👈 Socket'i al
  const navigate = useNavigate();

  const fetchFriends = async () => {
    try {
      const res = await axios.get(API_URL, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setFriends(res.data.data);
    } catch (error) {
      console.error('Arkadaş listesi çekilemedi:', error);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const res = await axios.get(`${API_URL}/requests/pending`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setPendingRequests(res.data.data);
    } catch (error) {
      console.error('Bekleyen istekler çekilemedi:', error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchFriends();
      fetchPendingRequests();
    }
  }, [user]);

  // 👇 YENİ: SOCKET DİNLEYİCİLERİ (Anlık Güncelleme İçin)
  useEffect(() => {
      if (!socket) return;

      // 1. Yeni Arkadaşlık İsteği Geldiğinde
      const handleNewRequest = (newRequest) => {
          console.log("Yeni arkadaşlık isteği geldi:", newRequest);
          // Listeye ekle (Daha önce yoksa)
          setPendingRequests((prev) => {
              if (prev.some(req => req._id === newRequest._id)) return prev;
              return [...prev, newRequest];
          });
      };

      // 2. Gönderdiğimiz İstek Kabul Edildiğinde
      const handleRequestAccepted = (newFriend) => {
          console.log("Arkadaşlık isteği kabul edildi:", newFriend);
          // Arkadaş listesine ekle
          setFriends((prev) => [...prev, newFriend]);

          // Bekleyenlerden çıkar (Bizim gönderdiğimiz istek artık pending değil)
          setPendingRequests(prev => prev.filter(req => req.recipient?._id !== newFriend._id));
      };

      socket.on('newFriendRequest', handleNewRequest);
      socket.on('friendRequestAccepted', handleRequestAccepted);

      return () => {
          socket.off('newFriendRequest', handleNewRequest);
          socket.off('friendRequestAccepted', handleRequestAccepted);
      };
  }, [socket]);
  // ------------------------------------------------------

  const handleSendRequest = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/request`,
        { recipientUsername },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage(`${recipientUsername} kullanıcısına istek gönderildi!`);
      setRecipientUsername('');

      // Kendi gönderdiğimiz isteği de pending listesine eklemek için tekrar çekebiliriz
      // Veya backend cevabından dönen datayı ekleyebiliriz. Şimdilik fetch çağırıyoruz:
      fetchPendingRequests();

    } catch (error) {
      setMessage(`Hata: ${error.response?.data?.message || 'İstek gönderilemedi'}`);
    }
  };

  const startDM = async (friendId) => {
    try {
        const token = localStorage.getItem('token');
        const res = await axios.post(
            `${API_URL}/dm/${friendId}`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const conversationId = res.data.data._id;
        navigate(`/dashboard/dm/${friendId}/${conversationId}`);
    } catch (error) {
        console.error('DM başlatılamadı:', error);
    }
  };

  const handleResponse = async (requestId, response) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/requests/${requestId}`,
        { response },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Listeden çıkar
      setPendingRequests((prev) => prev.filter((req) => req._id !== requestId));

      // Eğer kabul edildiyse, arkadaş listesini yenile
      if (response === 'accepted') {
        fetchFriends();
      }
    } catch (error) {
      console.error('İsteğe yanıt verilemedi:', error);
    }
  };

  return (
    <div className="friends-view">
      <div className="friends-header">
        <h2>Arkadaşlar</h2>
        <p className="friends-subtitle">Buradan arkadaş ekleyebilir ve sohbet başlatabilirsin.</p>
      </div>

      {/* Arkadaş Ekleme Formu */}
      <form onSubmit={handleSendRequest} className="friends-add-form">
        <div className="friends-input-group">
          <input
            type="text"
            className="friends-input"
            placeholder="Kullanıcı Adı ile Ekle"
            value={recipientUsername}
            onChange={(e) => setRecipientUsername(e.target.value)}
          />
          <button type="submit" className="friend-btn friend-btn-primary">
            İstek Gönder
          </button>
        </div>
        {message && <p className="friends-message">{message}</p>}
      </form>

      {/* Arkadaş Listesi */}
      <section className="friends-section">
        <h3 className="friends-section-title">Arkadaşlarım - {friends.length}</h3>
        {friends.length === 0 ? (
          <p className="friends-empty">Henüz arkadaşın yok.</p>
        ) : (
          <ul className="friends-list">
            {friends.map((friend) => (
              <li key={friend._id} className="friend-item">
                <div className="friend-main">
                  <div className="friend-avatar-wrapper">
                    <img
                        src={getAvatarSrc(friend.avatarUrl)}
                        alt={`${friend.username} avatar`}
                        className="friend-avatar"
                        onError={(e) => { e.currentTarget.src = '/default-avatar.png'; }}
                    />
                    <span className={`friend-status-dot ${friend.onlineStatus === 'online' ? 'online' : 'offline'}`}></span>
                  </div>
                  <div className="friend-info">
                    <span className="friend-username">{friend.username}</span>
                    <span className="friend-status-text">
                        {friend.onlineStatus === 'online' ? 'Çevrimiçi' : 'Çevrimdışı'}
                    </span>
                  </div>
                </div>
                <div className="friend-actions">
                  <button
                    className="friend-btn"
                    onClick={() => startDM(friend._id)}
                  >
                    💬 Mesaj
                  </button>
                  {/* Silme butonu eklenebilir */}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Bekleyen İstekler */}
      <section className="friends-section">
        <h3 className="friends-section-title">Bekleyen İstekler - {pendingRequests.length}</h3>
        {pendingRequests.length === 0 ? (
          <p className="friends-empty">Bekleyen istek yok.</p>
        ) : (
          <ul className="friends-list">
            {pendingRequests.map((req) => {
               // Gelen istek mi, Giden istek mi?
               const isIncoming = req.recipient?._id === user.id || req.recipient === user.id;

               // Eğer gelen istekse, göndereni (requester) göster. Gidense alıcıyı (recipient).
               // Ancak 'fetchPendingRequests' backend'de $or ile çekiyor.
               // Burada basitlik için sadece gelenleri (onaylayabileceklerimizi) butonlu,
               // gidenleri ise sadece bilgi olarak gösterebiliriz.

               // Şu anki backend yapısında genellikle gelen istekleri "kabul et/reddet" yapmak için listeliyoruz.
               if (!isIncoming) return null; // Sadece gelenleri gösterelim (veya tasarımı ona göre ayırmak lazım)

               return (
                <li key={req._id} className="friend-item">
                    <div className="friend-main">
                    <img
                        src={getAvatarSrc(req.requester?.avatarUrl)}
                        alt={`${req.requester?.username} avatar`}
                        className="friend-avatar"
                        onError={(e) => {
                        e.currentTarget.src = '/default-avatar.png';
                        }}
                    />
                    <div className="friend-info">
                        <span className="friend-username">
                        {req.requester?.username}
                        </span>
                        <span className="friend-meta">
                        Sana arkadaşlık isteği gönderdi
                        </span>
                    </div>
                    </div>

                    <div className="friend-actions">
                    <button
                        type="button"
                        className="friend-btn friend-btn-accept"
                        onClick={() => handleResponse(req._id, 'accepted')}
                    >
                        Kabul Et
                    </button>
                    <button
                        type="button"
                        className="friend-btn friend-btn-reject"
                        onClick={() => handleResponse(req._id, 'rejected')}
                    >
                        Reddet
                    </button>
                    </div>
                </li>
               );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default FriendsView;