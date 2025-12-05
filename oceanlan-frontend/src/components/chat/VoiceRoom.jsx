// src/components/chat/VoiceRoom.jsx
import React, { useContext, useEffect, useState } from 'react';
import { VoiceContext } from '../../context/VoiceContext';
import { AudioSettingsContext } from '../../context/AudioSettingsContext';
import { AuthContext } from '../../context/AuthContext';
import '../../styles/VoiceRoom.css'
import {
    MicrophoneIcon,
    SpeakerWaveIcon,
    ComputerDesktopIcon,
    PhoneXMarkIcon,
    SignalIcon,
    ArrowPathIcon // Yenileme ikonu
} from '@heroicons/react/24/solid';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const toAbsolute = (src) => {
    if (!src) return '/default-avatar.png';
    return src.startsWith('/uploads') ? `${API_URL_BASE}${src}` : src;
};

const VoiceRoom = () => {
  const {
      currentVoiceChannelId,
      leaveVoiceChannel,
      myScreenStream,
      isLocalSpeaking,
      currentVoiceChannelName,
      currentServerName,
      micError,
      speakingUsers,
      screenShareMethods // 👈 Context'e eklediğimiz metodlar
  } = useContext(VoiceContext);
  const { startScreenShare, stopScreenShare } = screenShareMethods;

  const { isMicMuted, toggleMic, isDeafened, toggleDeafen } = useContext(AudioSettingsContext);
  const { user } = useContext(AuthContext);

  // Connection durumu için basit bir local state
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // connecting, connected, error

  useEffect(() => {
    if (currentVoiceChannelId) {
        setConnectionStatus('connected');
    }
  }, [currentVoiceChannelId]);

  if (!currentVoiceChannelId) return null;

  const handleScreenShareToggle = () => {
      if (myScreenStream) stopScreenShare();
      else startScreenShare();
  };

  // 📢 SES GELMİYORSA RESTART ATACAK BUTON
  const handleReconnect = () => {
      // Kanaldan çıkıp tekrar girmek en temiz çözümdür
      const oldChannel = currentVoiceChannelId; // ID'yi sakla
      leaveVoiceChannel();
      setTimeout(() => {
          // Burada tekrar katılma mantığı VoiceContext üzerinden tetiklenmeli
          // veya kullanıcıya manuel tıklatmalı. Şimdilik sadece çıkış yapıyoruz.
          // Kullanıcı tekrar tıklasın.
      }, 500);
  };

  // Gerçekten konuşuyor muyum? Context + Analiz
  const amISpeaking = speakingUsers[user?.id];

  return (
    <div className="voice-room-controls">
        {micError && (
          <div className="voice-error-banner">
            ❗ {micError}
          </div>
        )}

      <div className="voice-room-info">
        <div className={`voice-connection-status ${connectionStatus === 'connected' ? 'connected' : 'connecting'}`}>
            <SignalIcon className="voice-icon-signal" />
            <span className="voice-status-text">
                {connectionStatus === 'connected' ? 'Ses Bağlı' : 'Bağlanıyor...'}
            </span>
        </div>
        <div className="voice-room-details">
            <span className="server-name">{currentServerName || 'Sunucu'}</span>
            <span className="channel-seperator">/</span>
            <span className="channel-name">{currentVoiceChannelName || 'Kanal'}</span>
        </div>
      </div>

      <div className="voice-controls-actions">
        <button onClick={toggleMic} className={`voice-control-btn ${isMicMuted ? 'active-red' : ''}`}>
            <MicrophoneIcon className="voice-icon" />
            {isMicMuted && <div className="strike-line" />}
        </button>

        <button onClick={toggleDeafen} className={`voice-control-btn ${isDeafened ? 'active-red' : ''}`}>
            <SpeakerWaveIcon className="voice-icon" />
            {isDeafened && <div className="strike-line" />}
        </button>

        <button onClick={handleScreenShareToggle} className={`voice-control-btn ${myScreenStream ? 'active-green' : ''}`}>
            <ComputerDesktopIcon className="voice-icon" />
        </button>

        <button onClick={leaveVoiceChannel} className="voice-control-btn terminate">
            <PhoneXMarkIcon className="voice-icon" />
        </button>
      </div>

      {/* Kullanıcı Kartı */}
      <div className="voice-user-section">
          <div className={`voice-avatar-wrapper ${amISpeaking ? 'speaking' : ''}`}>
             <img
                src={toAbsolute(user?.avatarUrl || user?.avatar)}
                alt="Me"
                className="voice-user-img"
             />
          </div>
          <div className="voice-user-info-mini">
              <span className="voice-username">{user?.username}</span>
              <span className="voice-status-micro">{isMicMuted ? 'Muted' : 'Open'}</span>
          </div>
      </div>
    </div>
  );
};

export default VoiceRoom;