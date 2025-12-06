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
    if (!src) return `${API_URL_BASE}/uploads/default-avatar.png`;

    // Eğer zaten tam link ise dokunma
    if (src.startsWith('http')) return src;

    // Değilse sunucu yolunu ekle
    return `${API_URL_BASE}${src.startsWith('/') ? src : '/' + src}`;
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
      isConnected
  } = useContext(VoiceContext);

  const { isMicMuted, toggleMic, isDeafened, toggleDeafen } = useContext(AudioSettingsContext);
  const { user } = useContext(AuthContext);

  // 1. Kanal seçilmediyse gösterme (Bu doğru)
  if (!currentVoiceChannelId) return null;

  // 🛑 2. ESKİ HATALI KOD BURADAYDI (if (!user) return null;)
  // O satırı sildik! Yerine aşağıdaki "safeUser" mantığını kullanıyoruz.

  // Eğer user verisi henüz gelmediyse geçici bir "Misafir" objesi oluşturuyoruz.
  // Böylece kart anında görünür, veri gelince ismi güncellenir.
  const safeUser = user || {
      username: 'Yükleniyor...',
      id: 'loading',
      avatarUrl: null
  };

  const handleScreenShareToggle = () => {
      if (myScreenStream) stopScreenShare();
      else startScreenShare();
  };

  const isVoiceConnected = isConnected;
  const connectionText = isVoiceConnected ? 'Ses Bağlı' : 'Bağlanıyor...';
  const connectionClass = isVoiceConnected ? 'connected' : 'connecting';

  // Konuşuyor mu kontrolü (safeUser.id kullanarak hata almayı engelliyoruz)
  const amISpeaking = speakingUsers && safeUser.id && speakingUsers[safeUser.id];

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
                src={toAbsolute(safeUser.avatarUrl || safeUser.avatar)}
                alt="Me"
                className="voice-user-img"
             />
          </div>

          <div className="voice-user-info-mini">
              <span className="voice-username">
                  {safeUser.username}
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