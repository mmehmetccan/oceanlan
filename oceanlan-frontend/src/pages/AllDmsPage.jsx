// src/pages/AllDmsPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
// 👇 1. IMPORT EKLE
import UserLevelTag from '../components/gamification/UserLevelTag';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const DEFAULT_AVATAR = '/default-avatar.png';
const toAbsolute = (src) => !src ? DEFAULT_AVATAR : src.startsWith('/uploads') ? `${API_URL_BASE}${src}` : src;

const AllDmsPage = () => {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchFriends = async () => {
      try {
        const res = await axiosInstance.get('/friends');
        setFriends(res.data.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchFriends();
  }, []);

  const startDm = async (friendId) => {
    try {
      const res = await axiosInstance.post(`/friends/dm/${friendId}`);
      navigate(`/dashboard/dm/${friendId}/${res.data.data._id}`);
    } catch (err) {
      console.error('DM açılamadı', err);
    }
  };

  return (
    <div className="friends-view">
      <div className="friends-header">
        <h2>Mesaj Kutusu</h2>
        <p className="friends-subtitle">Sohbet edebileceğin kişiler ({friends.length})</p>
      </div>

      <div className="friends-list" style={{ marginTop: '20px' }}>
        {loading ? (
          <p>Yükleniyor...</p>
        ) : friends.length === 0 ? (
          <p className="friends-empty">Henüz mesajlaşacak kimse yok.</p>
        ) : (
          friends.map((friend) => (
            <div key={friend._id} className="friend-item" style={{ padding: '15px' }}>
              <div className="friend-main">
                <img
                  src={toAbsolute(friend.avatarUrl || friend.avatar)}
                  alt={friend.username}
                  className="friend-avatar"
                  style={{ width: '48px', height: '48px' }}
                  onError={(e) => { e.target.src = DEFAULT_AVATAR; }}
                />
                <div className="friend-info">
                  {/* 👇 2. BURAYI DÜZENLE: İsim ve Level/Rozet yan yana gelsin diye flex ekledik */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="friend-username" style={{ fontSize: '16px' }}>{friend.username}</span>

                    {/* 👇 3. BİLEŞENİ EKLE */}
                    <UserLevelTag
                      level={friend.level}
                      activeBadge={friend.activeBadge}
                    />
                  </div>

                  <span className="friend-status-text">
                    {friend.onlineStatus === 'online' ? 'Çevrimiçi' : 'Çevrimdışı'}
                  </span>
                </div>
              </div>
              <button
                className="friend-btn friend-btn-primary"
                onClick={() => startDm(friend._id)}
                style={{ padding: '10px 20px' }}
              >
                Mesaj Gönder
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AllDmsPage;