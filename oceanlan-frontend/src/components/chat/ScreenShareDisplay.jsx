// src/components/chat/ScreenShareDisplay.jsx
import React, { useContext, useEffect, useRef, useState, useMemo } from 'react';
import { VoiceContext } from '../../context/VoiceContext';
import { AuthContext } from '../../context/AuthContext';
import { ServerContext } from '../../context/ServerContext';
import {
  XMarkIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon
} from '@heroicons/react/24/solid';
import '../../styles/ScreenShareDisplay.css';

const VideoPlayer = ({ stream, isLocal, username, onStop }) => {
  const videoRef = useRef(null);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
      videoRef.current.volume = volume;
    }
  }, [isMuted, volume]);

  const toggleExpand = () => setIsExpanded(!isExpanded);

  const toggleAudio = () => {
    if (isMuted) {
      setIsMuted(false);
      if (volume === 0) setVolume(0.5);
    } else {
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (newVol > 0 && isMuted) setIsMuted(false);
    if (newVol === 0) setIsMuted(true);
  };

  return (
    <>
      {/* Expanded (Tam Ekran) Arka Plan */}
      {isExpanded && (
        <div className="expanded-backdrop" onClick={toggleExpand} />
      )}

      {/* 🟢 ANA KAPSAYICI (Bu yapı CSS grid'in düzgün çalışmasını sağlar) */}
      <div className={`video-player-card ${isExpanded ? 'expanded' : ''}`} onDoubleClick={toggleExpand}>

        {/* 1. Video Elementi */}
        <video ref={videoRef} autoPlay playsInline className="main-video" />

        {/* 2. İsim Etiketi (Sol Üst) */}
        <div className="video-overlay-name">
          {username} {isLocal ? '(Sen)' : ''}
        </div>

        {/* 3. Kontrol Barı (Hover ile görünür) */}
        <div className="video-controls-overlay">
          {/* Sol: Ses Kontrolleri (Yerel değilse) */}
          <div className="controls-left">
            {!isLocal && (
              <div className="volume-group">
                <button onClick={toggleAudio} className="icon-btn">
                  {isMuted || volume === 0 ? <SpeakerXMarkIcon width={18}/> : <SpeakerWaveIcon width={18}/>}
                </button>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="volume-slider"
                />
              </div>
            )}
          </div>

          {/* Sağ: Genişletme ve Kapatma */}
          <div className="controls-right">
            <button onClick={toggleExpand} className="icon-btn" title="Genişlet">
              {isExpanded ? <ArrowsPointingInIcon width={18}/> : <ArrowsPointingOutIcon width={18}/>}
            </button>

            {isLocal && onStop && (
              <button onClick={onStop} className="icon-btn close-btn" title="Yayını Kapat">
                <XMarkIcon width={18} />
              </button>
            )}
          </div>
        </div>

        {/* 4. Alt Bilgi Şeridi (Sabit) */}
        <div className="video-status-bar">
          <span className="status-indicator"></span>
          <span className="status-text">Canlı: {username}</span>
        </div>
      </div>
    </>
  );
};

const ScreenShareDisplay = () => {
  const {
    myScreenStream,
    myCameraStream,   // ✅ EKLENDİ
    peersWithVideo,
    stopScreenShare,
    stopCamera,       // ✅ EKLENDİ
    socket,
    userIdBySocketId
  } = useContext(VoiceContext);

  const { activeServer } = useContext(ServerContext);
  const { user } = useContext(AuthContext);

  const [hiddenSocketIds, setHiddenSocketIds] = useState(() => new Set());

  // ✅ EKLENDİ: lokal video stream (ekran veya kamera)
  const myLocalVideoStream = myScreenStream || myCameraStream;

  const myVideoTrackId = myLocalVideoStream?.getVideoTracks?.()[0]?.id;

  const resolveUsername = (socketId) => {
    const userId = userIdBySocketId?.[socketId];
    if (!userId || !activeServer?.members) return 'Kullanıcı';
    const member = activeServer.members.find(m => m.user?._id === userId);
    return member?.user?.username || 'Kullanıcı';
  };

  // ✅ EKLENDİ: Lokal video track kapanınca ilgili stop fonksiyonu
  useEffect(() => {
    const track = myLocalVideoStream?.getVideoTracks?.()[0];
    if (!track) return;

    const prev = track.onended;
    track.onended = () => {
      try {
        if (myScreenStream) stopScreenShare?.();
        else if (myCameraStream) stopCamera?.();
      } catch (e) {}
      if (typeof prev === 'function') prev();
    };

    return () => { if (track) track.onended = prev || null; };
  }, [myLocalVideoStream, myScreenStream, myCameraStream, stopScreenShare, stopCamera]);

  useEffect(() => {
    const entries = Object.entries(peersWithVideo || {});
    const cleanups = [];

    entries.forEach(([socketId, stream]) => {
      if (!stream) return;
      const vtrack = stream.getVideoTracks?.()[0];
      if (!vtrack) return;

      const hide = () => setHiddenSocketIds(prev => { const n = new Set(prev); n.add(socketId); return n; });
      const onEnded = () => hide();
      const onMute = () => { setTimeout(() => { if (vtrack.readyState !== 'live' || vtrack.muted) hide(); }, 400); };

      vtrack.addEventListener?.('ended', onEnded);
      vtrack.addEventListener?.('mute', onMute);
      stream.addEventListener?.('inactive', onEnded);

      if (vtrack.readyState !== 'live') hide();

      cleanups.push(() => {
        try { vtrack.removeEventListener?.('ended', onEnded); } catch (e) {}
        try { vtrack.removeEventListener?.('mute', onMute); } catch (e) {}
        try { stream.removeEventListener?.('inactive', onEnded); } catch (e) {}
      });
    });

    setHiddenSocketIds(prev => {
      const current = new Set(Object.keys(peersWithVideo || {}));
      const next = new Set();
      prev.forEach(id => { if (current.has(id)) next.add(id); });
      return next;
    });

    return () => cleanups.forEach(fn => fn());
  }, [peersWithVideo]);

  const remoteStreams = useMemo(() => {
    const entries = Object.entries(peersWithVideo || {});
    return entries.filter(([socketId, stream]) => {
      if (!stream) return false;
      if (socket && socketId === socket.id) return false;
      if (myLocalVideoStream && stream.id === myLocalVideoStream.id) return false;

      const remoteTrack = stream.getVideoTracks?.()[0];
      if (!remoteTrack) return false;

      const remoteTrackId = remoteTrack.id;
      if (myVideoTrackId && remoteTrackId === myVideoTrackId) return false;
      if (hiddenSocketIds.has(socketId)) return false;
      if (remoteTrack.readyState !== 'live') return false;

      return true;
    });
  }, [peersWithVideo, socket, myLocalVideoStream, myVideoTrackId, hiddenSocketIds]);

  if (!myLocalVideoStream && remoteStreams.length === 0) return null;

  // ✅ EKLENDİ: stop fonksiyonu seçimi + label
  const localLabel = myScreenStream ? 'Ekran' : (myCameraStream ? 'Kamera' : '');
  const onStopLocal = myScreenStream ? stopScreenShare : (myCameraStream ? stopCamera : null);

  return (
    <div className="screen-share-grid-container">
      {myLocalVideoStream && (
        <VideoPlayer
          stream={myLocalVideoStream}
          isLocal={true}
          username={`${user?.username || 'Sen'}${localLabel ? ` • ${localLabel}` : ''}`}
          onStop={onStopLocal}
        />
      )}

      {remoteStreams.map(([socketId, stream]) => (
        <VideoPlayer
          key={socketId}
          stream={stream}
          isLocal={false}
          username={resolveUsername(socketId)}
        />
      ))}
    </div>
  );
};

export default ScreenShareDisplay;
