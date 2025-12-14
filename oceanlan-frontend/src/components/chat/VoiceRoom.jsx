import React, { useContext, useEffect, useRef } from 'react';
import { useVoiceChannel } from '../../hooks/useVoiceChannel';
import { VoiceContext } from '../../context/VoiceContext';
import { AudioSettingsContext } from '../../context/AudioSettingsContext';
import { AuthContext } from '../../context/AuthContext';
import ScreenSharePickerModal from '../modals/ScreenSharePickerModal';
import { getImageUrl, DEFAULT_AVATAR_URL } from '../../utils/urlHelper';
import '../../styles/VoiceRoom.css'; // CSS dosyanı güncellemen gerekebilir

import {
    MicrophoneIcon,
    SpeakerWaveIcon,
    ComputerDesktopIcon,
    PhoneXMarkIcon,
    SignalIcon,
    SparklesIcon
} from '@heroicons/react/24/solid';

// 📹 VİDEO OYNATICI BİLEŞENİ (YENİ)
const VideoPlayer = ({ stream, isLocal = false }) => {
    const videoRef = useRef(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div className="video-container">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isLocal} // Kendi sesini duyma (yankı yapar)
                className="screen-share-video"
            />
            {isLocal && <span className="video-badge">Senin Ekranın</span>}
        </div>
    );
};

const VoiceRoom = () => {
  const { startScreenShare, stopScreenShare } = useVoiceChannel();

  const {
      currentVoiceChannelId,
      leaveVoiceChannel,
      myScreenStream, // Kendi yayınımız
      peersWithVideo, // Başkalarının yayını (YENİ)
      currentVoiceChannelName,
      currentServerName,
      micError,
      speakingUsers,
      isConnected
  } = useContext(VoiceContext);

  const {
      isMicMuted, toggleMic,
      isDeafened, toggleDeafen,
      isNoiseSuppression, toggleNoiseSuppression
  } = useContext(AudioSettingsContext);

  const { user } = useContext(AuthContext);
  const [showScreenPicker, setShowScreenPicker] = React.useState(false);

  if (!currentVoiceChannelId) return null;

  const safeUser = user || { username: 'Yükleniyor...', id: 'loading', avatarUrl: null };

  const handleScreenShareToggle = () => {
      if (myScreenStream) {
          stopScreenShare();
          return;
      }
      if (window.electronAPI) {
          setShowScreenPicker(true);
      } else {
          startScreenShare();
      }
  };

  const handleSourceSelect = (sourceId) => {
      setShowScreenPicker(false);
      startScreenShare(sourceId);
  };

  const isVoiceConnected = isConnected;
  const connectionText = isVoiceConnected ? 'Ses Bağlı' : 'Bağlanıyor...';
  const connectionClass = isVoiceConnected ? 'connected' : 'connecting';
  const amISpeaking = speakingUsers && safeUser.id && speakingUsers[safeUser.id];

  // 🟢 AKTİF YAYIN VAR MI KONTROLÜ
  const hasVideo = myScreenStream || (peersWithVideo && Object.keys(peersWithVideo).length > 0);

  return (
    <div className={`voice-room-controls ${hasVideo ? 'video-mode' : ''}`}>

        {/* 🟢 VİDEO ALANI (YENİ) */}
        {hasVideo && (
            <div className="voice-video-grid">
                {/* Kendi Yayınımız */}
                {myScreenStream && <VideoPlayer stream={myScreenStream} isLocal={true} />}

                {/* Başkalarının Yayını */}
                {Object.entries(peersWithVideo).map(([socketId, stream]) => (
                    <VideoPlayer key={socketId} stream={stream} />
                ))}
            </div>
        )}

        {micError && <div className="voice-error-banner">❗ {micError}</div>}

      <div className="voice-room-info">
        <div className={`voice-connection-status ${connectionClass}`}>
            <SignalIcon className="voice-icon-signal" />
            <span className="voice-status-text">{connectionText}</span>
        </div>
        <div className="voice-room-details">
            <span className="server-name">{currentServerName || 'Sunucu'}</span>
            <span className="channel-seperator">/</span>
            <span className="channel-name">{currentVoiceChannelName || 'Kanal'}</span>
        </div>
      </div>

        <div className="voice-controls-actions">
            <button onClick={toggleMic} className={`voice-control-btn ${isMicMuted ? 'active-red' : ''}`}>
                <MicrophoneIcon className="voice-icon"/>
                {isMicMuted && <div className="strike-line"/>}
            </button>

            <button onClick={toggleDeafen} className={`voice-control-btn ${isDeafened ? 'active-red' : ''}`}>
                <SpeakerWaveIcon className="voice-icon"/>
                {isDeafened && <div className="strike-line"/>}
            </button>

            <button
                onClick={toggleNoiseSuppression}
                className={`voice-control-btn ${isNoiseSuppression ? 'active-green' : ''}`}
                title="Gürültü Engelleme"
            >
                <SparklesIcon className="voice-icon"/>
                {!isNoiseSuppression && <div className="strike-line"/>}
            </button>

            <button onClick={handleScreenShareToggle}
                    className={`voice-control-btn ${myScreenStream ? 'active-green' : ''}`}>
                <ComputerDesktopIcon className="voice-icon"/>
            </button>

            <button onClick={leaveVoiceChannel} className="voice-control-btn terminate">
                <PhoneXMarkIcon className="voice-icon"/>
            </button>
        </div>

        {/* Kullanıcı Kartı (Video varken gizlenebilir veya küçültülebilir) */}
        {!hasVideo && (
            <div className="voice-user-section">
                <div className={`voice-avatar-wrapper ${amISpeaking ? 'speaking' : ''}`}>
                    <img
                        src={getImageUrl(safeUser.avatarUrl || safeUser.avatar)}
                        alt="Me"
                        className="voice-user-img"
                        onError={(e) => {
                                if (e.target.dataset.fallbackApplied) return;
                                e.target.dataset.fallbackApplied = 'true';
                                e.target.src = DEFAULT_AVATAR_URL;
                            }}
                    />
                </div>
            </div>
        )}

      {showScreenPicker && (
          <ScreenSharePickerModal onClose={() => setShowScreenPicker(false)} onSelect={handleSourceSelect} />
      )}
    </div>
  );
};

export default VoiceRoom;