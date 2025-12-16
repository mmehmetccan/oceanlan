import React, { useState, useEffect, useRef } from 'react';
import ReactPlayer from "react-player";
import { useSocket } from '../../hooks/useSocket';
import { useParams } from 'react-router-dom';

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
    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch {
    return null;
  }
};

const YouTubeWatchParty = () => {
  const { socket } = useSocket();
  const { serverId } = useParams();

  const playerRef = useRef(null);

  const [url, setUrl] = useState(null);
  const [inputUrl, setInputUrl] = useState('');
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  // 🔌 SOCKET EVENTS
  useEffect(() => {
    if (!socket) return;

    const onUrl = (newUrl) => {
      const fixed = normalizeYouTubeUrl(newUrl);
      if (!fixed) return;

      setPlaying(false);
      setReady(false);
      setUrl(fixed);
    };

    const onState = (state) => {
      setPlaying(state);
    };

    socket.on('watch-party-url', onUrl);
    socket.on('watch-party-state', onState);

    return () => {
      socket.off('watch-party-url', onUrl);
      socket.off('watch-party-state', onState);
    };
  }, [socket]);

  // 🔗 LINK GÖNDER
  const submitUrl = (e) => {
    e.preventDefault();

    const fixed = normalizeYouTubeUrl(inputUrl);
    if (!fixed) {
      alert('Geçerli bir YouTube linki gir');
      return;
    }

    setPlaying(false);
    setReady(false);
    setUrl(fixed);

    socket.emit('watch-party-action', {
      type: 'url',
      payload: fixed,
      serverId
    });

    setInputUrl('');
  };

  // ▶️ PLAY (kullanıcı etkileşimi şart)
  const handlePlayClick = () => {
    setPlaying(true);

    socket.emit('watch-party-action', {
      type: 'state',
      payload: true,
      serverId
    });
  };

  // ⏸️ PAUSE
  const handlePause = () => {
    setPlaying(false);

    socket.emit('watch-party-action', {
      type: 'state',
      payload: false,
      serverId
    });
  };

  return (
    <div style={{ height: '100%', width: '100%', background: '#000', display: 'flex', flexDirection: 'column' }}>
      
      {/* ÜST BAR */}
      <form
        onSubmit={submitUrl}
        style={{ display: 'flex', gap: 8, padding: 10, background: '#202225' }}
      >
        <input
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="YouTube linki yapıştır"
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 4,
            border: 'none',
            outline: 'none'
          }}
        />
        <button type="submit" style={{ padding: '0 20px' }}>
          Aç
        </button>
      </form>

      {/* PLAYER */}
      <div style={{ flex: 1, position: 'relative' }}>
        {url ? (
          <>
            <ReactPlayer
              ref={playerRef}
              url={url}
              playing={playing}
              controls
              width="100%"
              height="100%"
              onReady={() => setReady(true)}
              onPause={handlePause}
              config={{
                youtube: {
                  playerVars: {
                    autoplay: 0,
                    modestbranding: 1,
                    rel: 0,
                    playsinline: 1,
                    origin: window.location.origin
                  }
                }
              }}
            />

            {/* ▶️ PLAY OVERLAY (AUTOPLAY FIX) */}
            {!playing && ready && (
              <button
                onClick={handlePlayClick}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: 32,
                  padding: '20px 30px',
                  borderRadius: '50%',
                  cursor: 'pointer'
                }}
              >
                ▶
              </button>
            )}
          </>
        ) : (
          <div style={{ color: '#aaa', textAlign: 'center', marginTop: 50 }}>
            YouTube linki gir
          </div>
        )}
      </div>
    </div>
  );
};

export default YouTubeWatchParty;
