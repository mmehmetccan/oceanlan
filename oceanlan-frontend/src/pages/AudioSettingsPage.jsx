// src/pages/AudioSettingsPage.jsx
import React, { useContext, useState, useEffect } from 'react';
import { AudioSettingsContext } from '../context/AudioSettingsContext';
import { useNavigate } from 'react-router-dom';
import '../styles/AudioSettings.css';

const AudioSettingsPage = () => {
  const {
    inputMode, setInputMode,
    pttKey, setPttKey, pttKeyCode, setPttKeyCode,
    outputDeviceId, setOutputDeviceId // 👈 Context'ten çekildi
  } = useContext(AudioSettingsContext);

  const [isListening, setIsListening] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]); // 👈 Cihaz listesi için
  const navigate = useNavigate();

  // Cihazları Listele
  useEffect(() => {
    const getDevices = async () => {
      try {
        // İzin istemek gerekebilir, o yüzden önce bir getUserMedia denemesi yapılabilir
        // Ama genellikle cihaz listesi izin verildiyse gelir.
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(device => device.kind === 'audiooutput');
        setAudioDevices(outputs);
      } catch (err) {
        console.error("Cihazlar alınamadı:", err);
      }
    };
    getDevices();

    // Cihaz takıp çıkarınca listeyi güncelle
    navigator.mediaDevices.ondevicechange = getDevices;
  }, []);

  // Tuş atama
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isListening) {
        e.preventDefault();
        setPttKey(e.key.toUpperCase() === ' ' ? 'SPACE' : e.key.toUpperCase());
        setPttKeyCode(e.code);
        setIsListening(false);
      }
    };
    if (isListening) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isListening, setPttKey, setPttKeyCode]);

  return (
      <div className="audio-settings-container">
        <div className="settings-header-row" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid #3f4147', paddingBottom: '15px', marginBottom: '25px'
        }}>
          <h2 style={{borderBottom: 'none', margin: 0, padding: 0}}>Ses ve Görüntü Ayarları</h2>
          <button onClick={() => navigate(-1)} className="close-settings-btn">ESC ✕</button>
        </div>

        {/* 👇 YENİ BÖLÜM: ÇIKIŞ CİHAZI */}
        <div className="settings-section">
            <h3>Çıkış Cihazı (Hoparlör / Kulaklık)</h3>
            <select
                value={outputDeviceId}
                onChange={(e) => setOutputDeviceId(e.target.value)}
                style={{
                    width: '100%', padding: '10px', borderRadius: '8px',
                    background: '#2f3136', color: 'white', border: '1px solid #202225'
                }}
            >
                {audioDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Hoparlör ${device.deviceId.slice(0,5)}...`}
                    </option>
                ))}
            </select>
            <p className="hint">Sesin hangi cihazdan geleceğini buradan seçebilirsiniz.</p>
        </div>
        {/* ----------------------------- */}

        <div className="settings-section">
          <h3>Giriş Modu</h3>
          <div className="radio-group">
            <label className={`radio-option ${inputMode === 'VOICE_ACTIVITY' ? 'selected' : ''}`}>
              <input type="radio" value="VOICE_ACTIVITY" checked={inputMode === 'VOICE_ACTIVITY'} onChange={() => setInputMode('VOICE_ACTIVITY')} />
              <div className="radio-content">
                <span>Ses Etkinliği</span>
                <small>Konuştuğunuzda mikrofon otomatik açılır.</small>
              </div>
            </label>

            <label className={`radio-option ${inputMode === 'PUSH_TO_TALK' ? 'selected' : ''}`}>
              <input type="radio" value="PUSH_TO_TALK" checked={inputMode === 'PUSH_TO_TALK'} onChange={() => setInputMode('PUSH_TO_TALK')} />
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
                <button className={`keybind-btn ${isListening ? 'listening' : ''}`} onClick={() => setIsListening(true)}>
                  {isListening ? 'Tuşa Basın...' : pttKey}
                </button>
                <p className="hint">Değiştirmek için butona tıklayın ve klavyeden bir tuşa basın.</p>
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