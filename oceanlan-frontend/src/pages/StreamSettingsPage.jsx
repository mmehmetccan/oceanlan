// src/pages/StreamSettingsPage.jsx
import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';


const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_URL = `${API_URL_BASE}/api/v1/auth`;

const StreamSettingsPage = () => {
  const { user } = useContext(AuthContext);
  const [streamKey, setStreamKey] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStreamKey = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API_URL}/stream-key`);

        setStreamKey(res.data.streamKey);
        setStreamUrl(res.data.streamUrl);
        setError('');

      } catch (err) {
        setError(err.response?.data?.message || 'Yayın anahtarı çekilemedi.');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchStreamKey();
    }
  }, [user]);

  if (loading) {
    return <div className="stream-settings-container">Anahtar Yükleniyor...</div>;
  }
  if (error) {
    return <div className="stream-settings-container error-message">Hata: {error}</div>;
  }

  const rtmpUrl = 'rtmp://localhost:1936/live';

  return (
    <div className="stream-settings-container">
      <h2>Canlı Yayın Ayarları</h2>

      <div className="settings-card">
        <h3>OBS/Yayın Yazılımı Ayarları</h3>

        <label>Yayın Sunucusu (RTMP URL)</label>
        <input type="text" value={rtmpUrl} readOnly />
        <p className="hint">OBS/Streamlabs ayarlarınızda "Sunucu" alanına bu adresi girin.</p>

        <label>Yayın Anahtarı (Stream Key)</label>
        <input type="text" value={streamKey} readOnly />
        <p className="hint">Anahtarınızı kimseyle paylaşmayın! Bu anahtarı "Anahtar" alanına girin.</p>
      </div>

      <hr/>

      <div className="settings-card">
        <h3>Yayını İzleme Bağlantınız</h3>
        <label>HLS İzleme URL'si (M3U8)</label>
        <input type="text" value={streamUrl || 'Yayın başlatılmadı.'} readOnly />
        <p className="hint">Bu bağlantıyı bir video oynatıcıda (örn. Video.js, HLS.js) kullanarak yayınınızı izleyebilirsiniz.</p>
        <a href={streamUrl} target="_blank" rel="noopener noreferrer">Test Et (8001 Portu)</a>
      </div>
    </div>
  );
};

export default StreamSettingsPage;