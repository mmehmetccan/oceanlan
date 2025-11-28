// src/components/chat/VoiceRoom.jsx
import React, { useContext } from 'react';
import { useVoiceChannel } from '../../hooks/useVoiceChannel';
import { VoiceContext } from '../../context/VoiceContext';
import { AudioSettingsContext } from '../../context/AudioSettingsContext';

const VoiceRoom = () => {
  // useVoiceChannel artık fonksiyonları döndürüyor
  const { startScreenShare, stopScreenShare } = useVoiceChannel();

  const { currentVoiceChannelId, leaveVoiceChannel, myScreenStream } = useContext(VoiceContext);
  const { isMicMuted, toggleMic } = useContext(AudioSettingsContext);

  if (!currentVoiceChannelId) return null;

  const handleScreenShareToggle = () => {
      if (myScreenStream) {
          stopScreenShare();
      } else {
          startScreenShare();
      }
  };

  return (
    <div className="voice-room-controls">
      <div className="voice-room-info">
        <span className="voice-room-title">Ses Bağlantısı</span>
        <span className="voice-room-subtitle">
          {isMicMuted ? 'Mikrofon Kapalı' : 'Mikrofon Açık'}
          {myScreenStream && ' • Ekran Paylaşılıyor'}
        </span>
      </div>

      <div className="voice-controls-actions" style={{ display: 'flex', gap: '10px' }}>
        {/* EKRAN PAYLAŞ BUTONU (YENİ) */}
        <button
            onClick={handleScreenShareToggle}
            className={`voice-btn ${myScreenStream ? 'active-share' : ''}`}
            style={{
                background: 'transparent',
                border: 'none',
                color: myScreenStream ? '#3ba55d' : '#fff',
                cursor: 'pointer',
                fontSize: '18px'
            }}
            title="Ekran Paylaş"
        >
            🖥️
        </button>

        <button
            onClick={toggleMic}
            className={`voice-btn ${isMicMuted ? 'muted' : ''}`}
            style={{
                background: 'transparent',
                border: 'none',
                color: isMicMuted ? '#f04747' : '#fff',
                cursor: 'pointer',
                fontSize: '18px'
            }}
        >
            {isMicMuted ? '🔇' : '🎙️'}
        </button>

        <button
            className="voice-room-leave-btn"
            onClick={leaveVoiceChannel}
        >
            Kapat
        </button>
      </div>
    </div>
  );
};

export default VoiceRoom;