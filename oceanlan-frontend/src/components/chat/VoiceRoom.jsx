// src/components/chat/VoiceRoom.jsx
import React, { useContext } from 'react';
import { useVoiceChannel } from '../../hooks/useVoiceChannel';
import { VoiceContext } from '../../context/VoiceContext';
import { AudioSettingsContext } from '../../context/AudioSettingsContext';
import { AuthContext } from '../../context/AuthContext';
import '../../styles/VoiceRoom.css';
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

  const {
      currentVoiceChannelId,
      leaveVoiceChannel,
      myScreenStream,
      currentVoiceChannelName,
      currentServerName,
      micError,
      speakingUsers,
      isConnected // 🟢 YENİ: Gerçek bağlantı durumunu buradan alıyoruz
  } = useContext(VoiceContext);

  const { isMicMuted, toggleMic, isDeafened, toggleDeafen } = useContext(AudioSettingsContext);
  const { user } = useContext(AuthContext);

  // 🛑 ESKİ STATE VE EFFECT KALDIRILDI
  // (Bunlar arayüzün geç güncellenmesine sebep oluyordu)

  if (!currentVoiceChannelId) return null;
  if (!user) return null;

  const handleScreenShareToggle = () => {
      if (myScreenStream) stopScreenShare();
      else startScreenShare();
  };

  // 🟢 HIZLI DURUM KONTROLÜ
  // State yerine doğrudan değişkene atıyoruz, render anında hesaplanıyor.
  const isVoiceConnected = isConnected;
  const connectionText = isVoiceConnected ? 'Ses Bağlı' : 'Bağlanıyor...';
  const connectionClass = isVoiceConnected ? 'connected' : 'connecting';

  // Konuşuyor mu?
  const amISpeaking = speakingUsers && user ? speakingUsers[user.id] : false;

  return (
    <div className="voice-room-controls">
        {micError && (
          <div className="voice-error-banner">
            ❗ {micError}
          </div>
        )}

      <div className="voice-room-info">
        <div className={`voice-connection-status ${connectionClass}`}>
            <SignalIcon className="voice-icon-signal" />
            <span className="voice-status-text">
                {connectionText}
            </span>
        </div>
        <div className="voice-room-details">
            <span className="server-name">{currentServerName || 'Sunucu'}</span>
            <span className="channel-seperator">/</span>
            <span className="channel-name">{currentVoiceChannelName || 'Kanal'}</span>
        </div>
      </div>

      <div className="voice-controls-actions">
        {/* Butonların tepki süresini artırmak için onClick olayları doğrudan Context'i tetikler */}
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

      {/* Kullanıcı Kartı - Anlık Güncelleme */}
      <div className="voice-user-section">
          <div className={`voice-avatar-wrapper ${amISpeaking ? 'speaking' : ''}`}>
             <img
                src={toAbsolute(user?.avatarUrl || user?.avatar)}
                alt="Me"
                className="voice-user-img"
             />
          </div>
          <div className="voice-user-info-mini">
              <span className="voice-username">
                  {user?.username || 'Kullanıcı'}
              </span>
              <span className="voice-status-micro">
                  {isMicMuted ? 'Muted' : 'Open'}
              </span>
          </div>
      </div>
    </div>
  );
};

export default VoiceRoom;