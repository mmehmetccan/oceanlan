// src/components/chat/VoiceRoom.jsx
import React, { useContext } from 'react';
import { useVoiceChannel } from '../../hooks/useVoiceChannel';
import { VoiceContext } from '../../context/VoiceContext';
import { AudioSettingsContext } from '../../context/AudioSettingsContext';

const VoiceRoom = () => {
  // useVoiceChannel artık fonksiyonları döndürüyor
  const { startScreenShare, stopScreenShare } = useVoiceChannel();

  const { currentVoiceChannelId, leaveVoiceChannel, myScreenStream ,isLocalSpeaking} = useContext(VoiceContext);
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
              className="voice-room-mic-btn"
              onClick={toggleMic}
          >
              {/* ✅ Ses gidiyorsa yeşil nokta */}
              <span
                  className={`voice-speaking-indicator ${
                      isLocalSpeaking && !isMicMuted ? 'active' : ''
                  }`}
              />
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