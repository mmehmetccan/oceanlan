// src/components/integrations/YouTubeWatchParty.jsx
import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';
import { useSocket } from '../../hooks/useSocket';
import { useParams } from 'react-router-dom';
import { LinkIcon, SpeakerXMarkIcon, SpeakerWaveIcon } from '@heroicons/react/24/solid';

const YouTubeWatchParty = () => {
  const { socket } = useSocket();
  const { serverId } = useParams();

  // Varsayılan video
  const [url, setUrl] = useState('https://www.youtube.com/watch?v=LXb3EKWsInQ');
  const [inputUrl, setInputUrl] = useState('');
  const [playing, setPlaying] = useState(false);

  // 🟢 YENİ: Otomatik oynatma politikasını aşmak için varsayılan olarak sessiz başlat
  const [muted, setMuted] = useState(true);

  // Link Düzeltici
  const normalizeYouTubeUrl = (rawUrl) => {
    try {
      if (!rawUrl) return rawUrl;
      if (rawUrl.includes('youtu.be')) {
        const id = rawUrl.split('youtu.be/')[1]?.split('?')[0];
        if (id) return `https://www.youtube.com/watch?v=${id}`;
      }
      if (rawUrl.includes('youtube.com') && rawUrl.includes('&')) {
         const u = new URL(rawUrl);
         const v = u.searchParams.get('v');
         if (v) return `https://www.youtube.com/watch?v=${v}`;
      }
      return rawUrl;
    } catch {
      return rawUrl;
    }
  };

  // 1. SOCKET DİNLEYİCİLERİ
  useEffect(() => {
    if (!socket) return;

    const handleUrl = (incomingUrl) => {
        const fixedUrl = normalizeYouTubeUrl(incomingUrl);
        // Eğer link zaten aynıysa işlem yapma (Döngüyü kırar)
        setUrl((currentUrl) => {
            if (currentUrl === fixedUrl) return currentUrl;
            console.log("[Socket] Yeni URL yüklendi:", fixedUrl);
            return fixedUrl;
        });
        setPlaying(true);
    };

    const handleState = (isPlaying) => {
        console.log("[Socket] Durum:", isPlaying ? 'Oynatılıyor' : 'Durduruldu');
        setPlaying(isPlaying);
    };

    socket.on('watch-party-url', handleUrl);
    socket.on('watch-party-state', handleState);

    return () => {
        socket.off('watch-party-url', handleUrl);
        socket.off('watch-party-state', handleState);
    };
  }, [socket]);

  // 2. KULLANICI LİNK GÖNDERİRSE
  const handleUrlSubmit = (e) => {
      e.preventDefault();
      if(inputUrl.trim() !== '') {
          const fixedUrl = normalizeYouTubeUrl(inputUrl);

          // Önce kendim açayım
          setUrl(fixedUrl);
          setPlaying(true);

          if (socket) {
              socket.emit('watch-party-action', {
                  type: 'url',
                  payload: fixedUrl,
                  serverId
              });
          }
          setInputUrl('');
      }
  };

  const handlePlay = () => {
      if (!playing) {
          setPlaying(true);
          if(socket) socket.emit('watch-party-action', { type: 'state', payload: true, serverId });
      }
  };

  const handlePause = () => {
      if (playing) {
          setPlaying(false);
          if(socket) socket.emit('watch-party-action', { type: 'state', payload: false, serverId });
      }
  };

  return (
      <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#000',
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

              {/* Ses Aç/Kapat Butonu (Tarayıcı Engeli İçin) */}
              <button
                onClick={() => setMuted(!muted)}
                title={muted ? "Sesi Aç" : "Sessize Al"}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#b9bbbe' }}
              >
                  {muted ? <SpeakerXMarkIcon width={24} /> : <SpeakerWaveIcon width={24} />}
              </button>
          </div>

          {/* Video Alanı */}
          <div style={{
              flex: 1,
              position: 'relative',
              width: '100%',
              height: '100%',
              minHeight: '400px',
              background: '#000',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
          }}>
              {/* 🛑 DÜZELTME: 'key={url}' BURADAN KESİNLİKLE SİLİNDİ.
                  Bu sayede video değişirken player yok edilmiyor, hata vermiyor.
              */}
              <ReactPlayer
                  url={url}
                  playing={playing}
                  muted={muted} /* 🟢 Tarayıcıların videoyu engellememesi için başta sessiz olabilir */
                  controls={true}
                  width="100%"
                  height="100%"
                  onPlay={handlePlay}
                  onPause={handlePause}
                  // Hata olsa bile çökmesini engelle
                  onError={(e) => console.warn("Player Uyarısı (Önemli Değil):", e)}
                  config={{
                      youtube: {
                          playerVars: {
                              showinfo: 1,
                              autoplay: 1,
                              origin: window.location.origin
                          }
                      }
                  }}
              />
          </div>
      </div>
  );
};

export default YouTubeWatchParty;