import React, { useEffect, useRef, useState } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { useParams } from 'react-router-dom';

const extractVideoId = (url) => {
  try {
    if (url.includes('youtu.be')) {
      return url.split('youtu.be/')[1].split('?')[0];
    }
    if (url.includes('youtube.com')) {
      return new URL(url).searchParams.get('v');
    }
    return null;
  } catch {
    return null;
  }
};

const YouTubeWatchParty = () => {
  const { socket } = useSocket();
  const { serverId } = useParams();

  const playerRef = useRef(null);
  const iframeRef = useRef(null);

  const [videoId, setVideoId] = useState(null);
  const [inputUrl, setInputUrl] = useState('');
  const [ready, setReady] = useState(false);

  // YouTube API yükle
  useEffect(() => {
    if (window.YT) return;

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      setReady(true);
    };
  }, []);

  // Player oluştur
  useEffect(() => {
    if (!ready || !videoId) return;

    if (playerRef.current) {
      playerRef.current.loadVideoById(videoId);
      return;
    }

    playerRef.current = new window.YT.Player(iframeRef.current, {
      height: '100%',
      width: '100%',
      videoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        origin: window.location.origin
      }
    });
  }, [ready, videoId]);

  // Socket
  useEffect(() => {
    if (!socket) return;

    const onUrl = (url) => {
      const id = extractVideoId(url);
      if (!id) return;
      setVideoId(id);
    };

    socket.on('watch-party-url', onUrl);
    return () => socket.off('watch-party-url', onUrl);
  }, [socket]);

  const submitUrl = (e) => {
    e.preventDefault();
    const id = extractVideoId(inputUrl);
    if (!id) return alert('Geçerli YouTube linki gir');

    setVideoId(id);

    socket.emit('watch-party-action', {
      type: 'url',
      payload: inputUrl,
      serverId
    });

    setInputUrl('');
  };

  return (
    <div style={{ height: '100%', background: '#000', display: 'flex', flexDirection: 'column' }}>
      <form onSubmit={submitUrl} style={{ display: 'flex', padding: 10, background: '#202225' }}>
        <input
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          placeholder="YouTube linki yapıştır"
          style={{ flex: 1, padding: 10 }}
        />
        <button type="submit">Aç</button>
      </form>

      <div style={{ flex: 1 }}>
        {videoId ? (
          <div ref={iframeRef} style={{ width: '100%', height: '100%' }} />
        ) : (
          <div style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>
            YouTube linki gir
          </div>
        )}
      </div>
    </div>
  );
};

export default YouTubeWatchParty;
