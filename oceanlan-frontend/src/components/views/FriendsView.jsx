// src/components/views/FriendsView.jsx
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import '../../styles/FriendsView.css';
const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_URL = `${API_URL_BASE}/api/v1/friends`;

// NOT: Backend kullanıcı modelinde avatarUrl alanı var:
// avatarUrl: "/uploads/avatars/..."
// Aşağıdaki fonksiyon bunu tam URL'ye çeviriyor.
const getAvatarSrc = (avatarUrl) => {
  if (!avatarUrl) {
    // public klasörüne "default-avatar.png" koyarsan buradan gelir
    return '/default-avatar.png';
  }
  if (avatarUrl.startsWith('http')) return avatarUrl;
  // Backend'in kök URL'si
  return `${API_URL_BASE}${avatarUrl}`;
};

const FriendsView = () => {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [recipientUsername, setRecipientUsername] = useState('');
  const [message, setMessage] = useState('');
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const fetchFriends = async () => {
    try {
      const res = await axios.get(API_URL);
      setFriends(res.data.data);
    } catch (error) {
      console.error('Arkadaş listesi çekilemedi:', error);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const res = await axios.get(`${API_URL}/requests/pending`);
      setPendingRequests(res.data.data);
    } catch (error) {
      console.error('Bekleyen istekler çekilemedi:', error);
    }
  };

  // Sadece bir kez: user geldiğinde hem arkadaşlar hem bekleyen istekler
  useEffect(() => {
    if (user) {
      fetchFriends();
      fetchPendingRequests();
    }
  }, [user]);

  const handleSendRequest = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      await axios.post(`${API_URL}/request`, { recipientUsername });
      setMessage(`${recipientUsername}'e istek gönderildi!`);
      setRecipientUsername('');
      fetchPendingRequests();
    } catch (error) {
      setMessage(
        `Hata: ${error.response?.data?.message || 'İstek gönderilemedi'}`
      );
    }
  };

  const startDM = async (friendId) => {
        try {
            const res = await axios.post(`${API_URL}/dm/${friendId}`);
            const conversation = res.data.data;

            // DMView rotası: /dashboard/dm/:friendId/:conversationId
            navigate(`/dashboard/dm/${friendId}/${conversation._id}`);

        } catch (error) {
            // 💡 DÜZELTME: Hata mesajını daha güvenli çek
            const errorMessage =
                error.response?.data?.message ||
                'Önce arkadaş olmanız gerekebilir.' ||
                'Bilinmeyen DM başlatma hatası.';

            console.error('DM başlatılamadı:', errorMessage);

            // 💡 Kullanıcıya gösterilen alert mesajını düzenle
            alert(`DM başlatılamadı: ${errorMessage}`);
        }
    };

  const handleResponse = async (requestId, response) => {
    try {
      const res = await axios.post(`${API_URL}/requests/${requestId}`, {
        response,
      });

      setMessage(
        `İstek başarıyla ${
          response === 'accepted' ? 'kabul edildi' : 'reddedildi'
        }.`
      );
      fetchPendingRequests();
      fetchFriends();
    } catch (error) {
      console.error('İstek yanıtlanamadı:', error.response?.data?.message);
      setMessage(
        `Hata: ${error.response?.data?.message || 'İstek yanıtlanamadı'}`
      );
    }
  };

  return (
    <div className="friends-view">
      <div className="friends-header">
        <h2>Arkadaşlar</h2>
        <p className="friends-subtitle">
          Arkadaşlarını görüntüle, DM başlat ve yeni arkadaş ekle.
        </p>
      </div>

      {/* Arkadaş Listesi */}
      <section className="friends-section">
        <h3 className="friends-section-title">
          Arkadaş Listesi ({friends.length})
        </h3>

        {friends.length === 0 ? (
          <p className="friends-empty">Henüz arkadaşınız yok.</p>
        ) : (
          <ul className="friends-list">
            {friends.map((friend) => (
              <li key={friend._id} className="friend-item">
                <div className="friend-main">
                  <img
                    src={getAvatarSrc(friend.avatarUrl)}
                    alt={`${friend.username} avatar`}
                    className="friend-avatar"
                    onError={(e) => {
                      e.currentTarget.src = '/default-avatar.png';
                    }}
                  />
                  <div className="friend-info">
                    <span className="friend-username">
                      {friend.username}
                    </span>
                    {/* İstersen burada ek info gösterebilirsin (ör: durum, son aktif vs.) */}
                  </div>
                </div>

                <button
                  type="button"
                  className="friend-btn friend-btn-primary"
                  onClick={() => startDM(friend._id)}
                >
                  DM Başlat
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Arkadaş Ekle */}
      <section className="friends-section">
        <h3 className="friends-section-title">Arkadaş Ekle</h3>
        <form onSubmit={handleSendRequest} className="friends-add-form">
          <div className="friends-input-group">
            <input
              type="text"
              className="friends-input"
              placeholder="Kullanıcı adı ile ara..."
              value={recipientUsername}
              onChange={(e) => setRecipientUsername(e.target.value)}
            />
            <button type="submit" className="friend-btn friend-btn-primary">
              İstek Gönder
            </button>
          </div>
          {message && <p className="friends-message">{message}</p>}
        </form>
      </section>

      {/* Bekleyen İstekler */}
      <section className="friends-section">
        <h3 className="friends-section-title">
          Bekleyen İstekler ({pendingRequests.length})
        </h3>

        {pendingRequests.length === 0 ? (
          <p className="friends-empty">Bekleyen arkadaşlık isteğiniz yok.</p>
        ) : (
          <ul className="friends-list">
            {pendingRequests.map((req) => (
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
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default FriendsView;
