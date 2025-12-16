// src/components/integrations/YouTubeWatchParty.jsx
import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
import { useSocket } from '../../hooks/useSocket';
import { useParams } from 'react-router-dom';
import { LinkIcon } from '@heroicons/react/24/solid';

const YouTubeWatchParty = () => {
  const { socket } = useSocket();
  const { serverId } = useParams();

  // Varsayılan video
  const [url, setUrl] = useState('https://www.youtube.com/watch?v=LXb3EKWsInQ');
  const [inputUrl, setInputUrl] = useState('');
  const [playing, setPlaying] = useState(false);

  // 1. SOCKET DİNLEYİCİLERİ
  useEffect(() => {
    if (!socket) return;

   const handleUrl = (newUrl) => {
  console.log('[Socket] Yeni URL:', newUrl);

  const fixedUrl = normalizeYouTubeUrl(newUrl);
  if (!fixedUrl) return;

  setPlaying(false);     // 🔥 önce durdur
  setUrl(fixedUrl);      // 🔥 sonra URL değiştir
};

    const handleState = (isPlaying) => {
        console.log("[Socket] Oynatma Durumu:", isPlaying);
        setPlaying(isPlaying);
    };

    socket.on('watch-party-url', handleUrl);
    socket.on('watch-party-state', handleState);

    return () => {
        socket.off('watch-party-url', handleUrl);
        socket.off('watch-party-state', handleState);
    };
  }, [socket]);

  const normalizeYouTubeUrl = (url) => {
  try {
    let videoId = null;

    if (url.includes('youtu.be')) {
      videoId = url.split('youtu.be/')[1]?.split('?')[0];
    }

    if (url.includes('youtube.com')) {
      const u = new URL(url);
      videoId = u.searchParams.get('v');
    }

    if (!videoId) return null;

    // 🔥 SADECE video ID, playlist YOK
    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch {
    return null;
  }
};


  // 2. KULLANICI LİNK DEĞİŞTİRİRSE
  const handleUrlSubmit = (e) => {
      e.preventDefault();
      if(inputUrl.trim() !== '') {
          // Önce kendim açayım (Hız hissi için)
          setUrl(inputUrl);
          setPlaying(true);

          // Sonra sunucuya bildireyim
          if (socket) {
              socket.emit('watch-party-action', {
                  type: 'url',
                  payload: inputUrl,
                  serverId
              });
          }
          setInputUrl('');
      }
  };

  // 3. OYNAT/DURDUR (Döngü Korumalı)
  // Bu fonksiyon sadece durum gerçekten farklıysa çalışır
  const handlePlayerState = (shouldPlay) => {
      if (playing !== shouldPlay) {
          setPlaying(shouldPlay);
          if (socket) {
              socket.emit('watch-party-action', {
                  type: 'state',
                  payload: shouldPlay,
                  serverId
              });
          }
      }
  };

  return (
      <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#000', /* Arka plan siyah */
          overflow: 'hidden'
      }}>

          {/* Üst Bar */}
          <div style={{
              height: '60px', padding: '0 20px', borderBottom: '1px solid #333',
              display: 'flex', alignItems: 'center', gap: '15px',
              background: '#202225', flexShrink: 0
          }}>
              <form onSubmit={handleUrlSubmit} style={{flex: 1, display: 'flex', gap: '10px'}}>
                  <div style={{position: 'relative', flex: 1}}>
                      <LinkIcon style={{position: 'absolute', left: 10, top: 10, width: 20, color: '#b9bbbe'}}/>
                      <input
                          type="text"
                          placeholder="YouTube linki yapıştır..."
                          value={inputUrl}
                          onChange={(e) => setInputUrl(e.target.value)}
                          style={{
                              width: '100%', padding: '10px 10px 10px 35px', borderRadius: '4px',
                              border: 'none', background: '#40444b', color: '#fff', outline: 'none'
                          }}
                      />
                  </div>
                  <button type="submit" style={{
                      background: '#5865F2', color: 'white', border: 'none', padding: '0 20px',
                      borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                  }}>
                      AÇ
                  </button>
              </form>
          </div>

          {/* Video Alanı */}
          <div style={{
              flex: 1,
              position: 'relative',
              width: '100%',
              height: '100%',
              minHeight: '400px', /* 🟢 EKLE: En az 400px yer kaplasın */
              background: '#000',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
          }}>
              <ReactPlayer
  url={url}
  playing={playing}
  controls
  width="100%"
  height="100%"
  onReady={() => setPlaying(true)}
  onPlay={() => handlePlayerState(true)}
  onPause={() => handlePlayerState(false)}
  onError={(e) => console.warn("Video yüklenemedi:", e)}
/>
          </div>
      </div>
  );
};

export default YouTubeWatchParty;