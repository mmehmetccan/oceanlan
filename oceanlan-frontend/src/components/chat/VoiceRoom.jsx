import React, { useContext } from 'react';
import { useVoiceChannel } from '../../hooks/useVoiceChannel';
import { VoiceContext } from '../../context/VoiceContext';
import { AudioSettingsContext } from '../../context/AudioSettingsContext';
import { AuthContext } from '../../context/AuthContext';
import '../../styles/VoiceRoom.css';
import { getImageUrl, DEFAULT_AVATAR_URL } from '../../utils/urlHelper';
import {
    MicrophoneIcon,
    SpeakerWaveIcon,
    ComputerDesktopIcon,
    PhoneXMarkIcon,
    SignalIcon,
    SparklesIcon
} from '@heroicons/react/24/solid';

const VoiceRoom = () => {
  const { startScreenShare, stopScreenShare } = useVoiceChannel();

  const {
      currentVoiceChannelId,
      leaveVoiceChannel,
      myScreenStream,
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

  if (!currentVoiceChannelId) return null;

  // Güvenli kullanıcı verisi
  const safeUser = user || { username: 'Yükleniyor...', id: 'loading', avatarUrl: null };

  const handleScreenShareToggle = () => {
      if (myScreenStream) stopScreenShare();
      else startScreenShare();
  };

  const isVoiceConnected = isConnected;
  const connectionText = isVoiceConnected ? 'Ses Bağlı' : 'Bağlanıyor...';
  const connectionClass = isVoiceConnected ? 'connected' : 'connecting';
  const amISpeaking = speakingUsers && safeUser.id && speakingUsers[safeUser.id];

  return (
    <div className="voice-room-controls">
        {micError && (
          <div className="voice-error-banner">❗ {micError}</div>
        )}

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
            {/* MİKROFON */}
            <button onClick={toggleMic} className={`voice-control-btn ${isMicMuted ? 'active-red' : ''}`}>
                <MicrophoneIcon className="voice-icon"/>
                {isMicMuted && <div className="strike-line"/>}
            </button>

            {/* SAĞIRLAŞTIRMA */}
            <button onClick={toggleDeafen} className={`voice-control-btn ${isDeafened ? 'active-red' : ''}`}>
                <SpeakerWaveIcon className="voice-icon"/>
                {isDeafened && <div className="strike-line"/>}
            </button>

            {/* 🟢 GÜRÜLTÜ ENGELLEME (GÜNCELLENDİ) */}
            {/* Açıkken Yeşil (active-green), Kapalıyken Çizgili */}
            <button
                onClick={toggleNoiseSuppression}
                className={`voice-control-btn ${isNoiseSuppression ? 'active-green' : ''}`}
                title={isNoiseSuppression ? "Gürültü Engelleme: AÇIK" : "Gürültü Engelleme: KAPALI"}
            >
                <SparklesIcon className="voice-icon"/>
                {/* Kapalıysa üstüne çizgi çek */}
                {!isNoiseSuppression && <div className="strike-line"/>}
            </button>

            {/* EKRAN PAYLAŞIMI */}
            <button onClick={handleScreenShareToggle}
                    className={`voice-control-btn ${myScreenStream ? 'active-green' : ''}`}>
                <ComputerDesktopIcon className="voice-icon"/>
            </button>

            {/* BAĞLANTIYI KES */}
            <button onClick={leaveVoiceChannel} className="voice-control-btn terminate">
                <PhoneXMarkIcon className="voice-icon"/>
            </button>
        </div>

        {/* KULLANICI KARTI */}
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
    </div>
  );
};

export default VoiceRoom;