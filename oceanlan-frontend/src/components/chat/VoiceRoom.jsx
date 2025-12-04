// src/components/chat/VoiceRoom.jsx
import React, { useContext } from 'react';
import { useVoiceChannel } from '../../hooks/useVoiceChannel';
import { VoiceContext } from '../../context/VoiceContext';
import { AudioSettingsContext } from '../../context/AudioSettingsContext';
import { AuthContext } from '../../context/AuthContext';
import { getFullImageUrl } from '../../utils/urlHelper';
import '../../styles/VoiceRoom.css'
import {
    MicrophoneIcon,
    SpeakerWaveIcon,
    ComputerDesktopIcon,
    PhoneXMarkIcon,
    SignalIcon
} from '@heroicons/react/24/solid';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const toAbsolute = (src) => {
    if (!src) return '/default-avatar.png';
    return src.startsWith('/uploads') ? `${API_URL_BASE}${src}` : src;
};

const VoiceRoom = () => {
  const { startScreenShare, stopScreenShare } = useVoiceChannel();


  const userAvatar = getFullImageUrl(user?.avatarUrl || user?.avatar);
  // 📢 GÜNCELLENDİ: İsimleri context'ten alıyoruz
  const {
      currentVoiceChannelId,
      leaveVoiceChannel,
      myScreenStream,
      isLocalSpeaking,
      currentVoiceChannelName,
      currentServerName,
      micError,
  } = useContext(VoiceContext);

  const { isMicMuted, toggleMic, isDeafened, toggleDeafen } = useContext(AudioSettingsContext);
  const { user } = useContext(AuthContext);

  if (!currentVoiceChannelId) return null;

  const handleScreenShareToggle = () => {
      if (myScreenStream) stopScreenShare();
      else startScreenShare();
  };

  return (
    <div className="voice-room-controls">
        {micError && (
  <div className="voice-error-banner">
    <strong>❗ Ses bağlantısı kurulamadı:</strong> {micError}
    <br />
    Lütfen mikrofon izninizin açık olduğundan ve tarayıcınızın desteklediğinden emin olun.
  </div>
)}
      <div className="voice-room-info">
        <div className={`voice-connection-status ${isLocalSpeaking ? 'speaking' : ''}`}>
            <SignalIcon className="voice-icon-signal" />
            <span className="voice-status-text">Ses Bağlandı</span>
        </div>
        <span className="voice-room-subtitle">
           <span style={{fontWeight: 'bold', color: '#fff'}}>{currentServerName || 'Sunucu'}</span> / {currentVoiceChannelName || 'Kanal'}
        </span>
      </div>

      <div className="voice-controls-actions">
        <button onClick={toggleMic} className={`voice-control-btn ${isMicMuted ? 'active-red' : ''}`} title={isMicMuted ? "Mikrofonu Aç" : "Sustur"}>
            <MicrophoneIcon className="voice-icon" />
            {isMicMuted && <div className="strike-line" />}
        </button>
        <button onClick={toggleDeafen} className={`voice-control-btn ${isDeafened ? 'active-red' : ''}`} title={isDeafened ? "Sağırlaştırmayı Kapat" : "Sağırlaştır"}>
            <SpeakerWaveIcon className="voice-icon" />
            {isDeafened && <div className="strike-line" />}
        </button>
        <button onClick={handleScreenShareToggle} className={`voice-control-btn ${myScreenStream ? 'active-green' : ''}`} title="Ekran Paylaş">
            <ComputerDesktopIcon className="voice-icon" />
        </button>
        <button onClick={leaveVoiceChannel} className="voice-control-btn terminate" title="Bağlantıyı Kes">
            <PhoneXMarkIcon className="voice-icon" />
        </button>
      </div>

      <div className="voice-user-section">
          <img

        src={userAvatar}
        alt="Profil"
        className={`voice-user-img ${isLocalSpeaking && !isMicMuted ? 'speaking' : ''}`}
        onError={(e) => e.target.src = '/default-avatar.png'}
          />
      </div>
    </div>
  );
};

export default VoiceRoom;