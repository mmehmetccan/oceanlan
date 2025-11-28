// src/pages/AudioSettingsPage.jsx
import React, { useContext, useState, useEffect } from 'react';
import { AudioSettingsContext } from '../context/AudioSettingsContext';
import { useNavigate } from 'react-router-dom'; // 📢 YENİ: Navigate
import '../styles/AudioSettings.css'; // Birazdan oluşturacağız

const BASE_API_URL = import.meta.env.VITE_API_URL;


const AudioSettingsPage = () => {
  const {
    inputMode,
    setInputMode,
    pttKey,
    setPttKey,
    pttKeyCode,
    setPttKeyCode
  } = useContext(AudioSettingsContext);

  const [isListening, setIsListening] = useState(false);
const navigate = useNavigate(); // 📢 YENİ
  // Tuş atama dinleyicisi
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isListening) {
        e.preventDefault();
        // Tuş bilgilerini kaydet
        setPttKey(e.key.toUpperCase() === ' ' ? 'SPACE' : e.key.toUpperCase());
        setPttKeyCode(e.code);
        setIsListening(false); // Dinlemeyi durdur
      }
    };

    if (isListening) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isListening, setPttKey, setPttKeyCode]);

  return (
      <div className="audio-settings-container">

        <div className="settings-header-row" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #3f4147',
          paddingBottom: '15px',
          marginBottom: '25px'
        }}>
          <h2 style={{borderBottom: 'none', margin: 0, padding: 0}}>Ses ve Görüntü Ayarları</h2>

          <button
              onClick={() => navigate(-1)} // Bir önceki sayfaya dön
              className="close-settings-btn"
          >
            ESC ✕
          </button>
        </div>
        <div className="settings-section">
          <h3>Giriş Modu</h3>
          <div className="radio-group">
            <label className={`radio-option ${inputMode === 'VOICE_ACTIVITY' ? 'selected' : ''}`}>
              <input
                  type="radio"
                  value="VOICE_ACTIVITY"
                  checked={inputMode === 'VOICE_ACTIVITY'}
                  onChange={() => setInputMode('VOICE_ACTIVITY')}
              />
              <div className="radio-content">
                <span>Ses Etkinliği</span>
                <small>Konuştuğunuzda mikrofon otomatik açılır.</small>
              </div>
            </label>

            <label className={`radio-option ${inputMode === 'PUSH_TO_TALK' ? 'selected' : ''}`}>
              <input
                  type="radio"
                  value="PUSH_TO_TALK"
                  checked={inputMode === 'PUSH_TO_TALK'}
                  onChange={() => setInputMode('PUSH_TO_TALK')}
              />
              <div className="radio-content">
                <span>Bas Konuş</span>
                <small>Sadece atadığınız tuşa bastığınızda sesiniz gider.</small>
              </div>
            </label>
          </div>
        </div>

        {inputMode === 'PUSH_TO_TALK' && (
            <div className="settings-section">
              <h3>Kısayol Tuşu</h3>
              <div className="keybind-wrapper">
                <button
                    className={`keybind-btn ${isListening ? 'listening' : ''}`}
                    onClick={() => setIsListening(true)}
                >
                  {isListening ? 'Tuşa Basın...' : pttKey}
                </button>
                <p className="hint">
                  Değiştirmek için butona tıklayın ve klavyeden bir tuşa basın.
                </p>
              </div>
            </div>
        )}

        <div className="settings-section">
          <h3>Giriş Hassasiyeti</h3>
          <p className="hint">Otomatik olarak belirlenir (Şimdilik varsayılan).</p>
          <input type="range" disabled className="sensitivity-slider"/>
        </div>
      </div>
  );
};

export default AudioSettingsPage;