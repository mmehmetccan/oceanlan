import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
import { useSocket } from '../../hooks/useSocket';
import { useParams } from 'react-router-dom';
import { PlayIcon, PauseIcon, LinkIcon } from '@heroicons/react/24/solid';

const YouTubeWatchParty = () => {
  const { socket } = useSocket();
  const { serverId } = useParams();

  // Varsayılan video (Test için)
  const [url, setUrl] = useState('https://www.youtube.com/watch?v=LXb3EKWsInQ');
  const [inputUrl, setInputUrl] = useState('');
  const [playing, setPlaying] = useState(false);

  const playerRef = useRef(null);

  // 1. SOCKET DİNLEYİCİLERİ
  useEffect(() => {
    if (!socket) return;

    socket.on('watch-party-url', (newUrl) => {
        console.log("Socket'ten yeni URL geldi:", newUrl);
        setUrl(newUrl);
        setPlaying(true);
    });

    socket.on('watch-party-state', (isPlaying) => {
        console.log("Socket'ten oynatma durumu geldi:", isPlaying);
        setPlaying(isPlaying);
    });

    return () => {
        socket.off('watch-party-url');
        socket.off('watch-party-state');
    };
  }, [socket]);

  // 2. LİNK GÖNDERME FONKSİYONU
  const handleUrlChange = (e) => {
      e.preventDefault();
      console.log("Link değiştirme isteği:", inputUrl);

      if(inputUrl.trim() !== '') {
          // 1. Önce kendi ekranımda aç (Hemen tepki versin)
          setUrl(inputUrl);
          setPlaying(true);

          // 2. Socket varsa diğerlerine gönder, yoksa sadece bende açılır
          if (socket && socket.connected) {
              socket.emit('watch-party-action', {
                  type: 'url',
                  payload: inputUrl,
                  serverId
              });
          } else {
              console.warn("Socket bağlı değil, sadece sizde değişti.");
          }
          setInputUrl('');
      }
  };

  // 3. OYNAT/DURDUR FONKSİYONU
  const handlePlayPause = () => {
      const newState = !playing;
      setPlaying(newState);

      if (socket && socket.connected) {
          socket.emit('watch-party-action', {
              type: 'state',
              payload: newState,
              serverId
          });
      }
  };

  return (
    <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: '#202225', overflow: 'hidden'
    }}>

      {/* Üst Bar */}
      <div style={{
          height: '60px', padding: '0 20px', borderBottom: '1px solid #2f3136',
          display: 'flex', alignItems: 'center', gap: '15px',
          background: '#2f3136', flexShrink: 0
      }}>
        <form onSubmit={handleUrlChange} style={{ flex: 1, display: 'flex', gap: '10px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
                <LinkIcon style={{ position: 'absolute', left: 10, top: 10, width: 20, color: '#b9bbbe' }} />
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
      <div style={{ flex: 1, background: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <ReactPlayer
            ref={playerRef}
            url={url}
            playing={playing}
            controls={true}
            width="100%"
            height="100%"
            onPlay={() => !playing && handlePlayPause()}
            onPause={() => playing && handlePlayPause()}
            onError={(e) => console.error("Video hatası:", e)} // Hata varsa konsola yaz
          />
      </div>
    </div>
  );
};

export default YouTubeWatchParty;