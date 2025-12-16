// src/components/integrations/YouTubeWatchParty.jsx
import React, { useState, useEffect, useRef, useContext } from 'react';
import ReactPlayer from 'react-player';
import { useSocket } from '../../hooks/useSocket'; // Senin socket hook'un
import { useParams } from 'react-router-dom';
import { PlayIcon, PauseIcon, LinkIcon } from '@heroicons/react/24/solid';

const YouTubeWatchParty = () => {
  const { socket } = useSocket();
  const { serverId } = useParams(); // Hangi sunucuda olduğumuzu bilelim

  // State'ler
  const [url, setUrl] = useState('https://www.youtube.com/watch?v=LXb3EKWsInQ'); // Varsayılan video
  const [inputUrl, setInputUrl] = useState('');
  const [playing, setPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const playerRef = useRef(null);

  // 1. SOCKET DİNLEYİCİLERİ (Başkası değiştirdiğinde bana da gelsin)
  useEffect(() => {
    if (!socket) return;

    // Biri linki değiştirirse
    socket.on('watch-party-url', (newUrl) => {
        setUrl(newUrl);
        setPlaying(true); // Yeni video gelince otomatik başlat
    });

    // Biri durdur/başlat yaparsa
    socket.on('watch-party-state', (isPlaying) => {
        setPlaying(isPlaying);
    });

    return () => {
        socket.off('watch-party-url');
        socket.off('watch-party-state');
    };
  }, [socket]);

  // 2. KONTROL FONKSİYONLARI (Ben yapınca herkese gitsin)
  const handleUrlChange = (e) => {
      e.preventDefault();
      if(inputUrl.trim() !== '') {
          setUrl(inputUrl);
          setPlaying(true);
          // Sunucuya bildir
          socket.emit('watch-party-action', {
              type: 'url',
              payload: inputUrl,
              serverId
          });
          setInputUrl('');
      }
  };

  const handlePlayPause = () => {
      const newState = !playing;
      setPlaying(newState);
      // Sunucuya bildir
      socket.emit('watch-party-action', {
          type: 'state',
          payload: newState,
          serverId
      });
  };

  return (
    <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: '#202225', overflow: 'hidden'
    }}>

      {/* Üst Kontrol Barı */}
      <div style={{
          height: '60px', padding: '0 20px', borderBottom: '1px solid #2f3136',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#2f3136', flexShrink: 0, gap: '15px'
      }}>
        {/* Link Giriş Alanı */}
        <form onSubmit={handleUrlChange} style={{ flex: 1, display: 'flex', gap: '10px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
                <LinkIcon style={{ position: 'absolute', left: 10, top: 10, width: 20, color: '#b9bbbe' }} />
                <input
                    type="text"
                    placeholder="YouTube veya SoundCloud linki yapıştır..."
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
                Aç
            </button>
        </form>
      </div>

      {/* Video Alanı */}
      <div style={{ flex: 1, position: 'relative', background: '#000' }}>
          <ReactPlayer
            ref={playerRef}
            url={url}
            playing={playing}
            controls={true} // YouTube'un kendi kontrollerini de açalım
            width="100%"
            height="100%"
            onPlay={() => {
                if(!playing) handlePlayPause(); // Kullanıcı YouTube barından basarsa da senkron et
            }}
            onPause={() => {
                if(playing) handlePlayPause();
            }}
            config={{
                youtube: {
                    playerVars: { showinfo: 1 }
                }
            }}
          />
      </div>

      {/* Alt Bilgi */}
      <div style={{ padding: '10px', color: '#b9bbbe', fontSize: '12px', textAlign: 'center' }}>
          Not: Videoyu durdurursanız veya değiştirirseniz odadaki herkes için değişir.
      </div>
    </div>
  );
};

export default YouTubeWatchParty;