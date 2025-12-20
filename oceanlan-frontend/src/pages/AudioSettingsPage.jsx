// src/pages/AudioSettingsPage.jsx
import React, { useContext, useState, useEffect } from 'react';
import { AudioSettingsContext } from '../context/AudioSettingsContext';
import { useNavigate } from 'react-router-dom';
import '../styles/AudioSettings.css';

const AudioSettingsPage = () => {
  const {
    inputMode, setInputMode,
    pttKey, setPttKey, pttKeyCode, setPttKeyCode,
    outputDeviceId, setOutputDeviceId,
    inputDeviceId, setInputDeviceId,
    inputVolume, setInputVolume
  } = useContext(AudioSettingsContext);

  const [isListening, setIsListening] = useState(false);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const navigate = useNavigate();

  // Cihazları Listele
  useEffect(() => {
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();

        const outputs = devices.filter(device => device.kind === 'audiooutput');
        setAudioOutputDevices(outputs);

        const inputs = devices.filter(device => device.kind === 'audioinput');
        setAudioInputDevices(inputs);

      } catch (err) {
        console.error("Cihazlar alınamadı:", err);
      }
    };
    getDevices();
    navigator.mediaDevices.ondevicechange = getDevices;
  }, []);

  // ✅ PTT tuş yakalama (klavye + mouse)
  useEffect(() => {
    if (!isListening) return;

    const handleKeyDown = (e) => {
      // Kısayolu yakalıyoruz
      e.preventDefault();
      e.stopPropagation();

      // Sadece gerçek KeyboardEvent.code kaydet
      // Örn: Space, KeyV, KeyX
      setPttKeyCode(e.code);

      // UI label (istersen kaldırabilirsin; AudioSettingsContext zaten senkronluyor)
      setPttKey(e.code.toUpperCase());

      setIsListening(false);
    };

    const handleMouseDown = (e) => {
      // Mouse macro yakala: MOUSE_0..4
      // 0: sol, 1: orta, 2: sağ, 3: back, 4: forward
      e.preventDefault();
      e.stopPropagation();

      setPttKeyCode(`MOUSE_${e.button}`);

      // UI label
      setPttKey(`MOUSE ${e.button}`);

      setIsListening(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousedown', handleMouseDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mousedown', handleMouseDown, true);
    };
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

      {/* GİRİŞ CİHAZI (MİKROFON) */}
      <div className="settings-section">
        <h3>Giriş Cihazı (Mikrofon)</h3>
        <select
          value={inputDeviceId}
          onChange={(e) => setInputDeviceId(e.target.value)}
          style={{
            width: '100%', padding: '10px', borderRadius: '8px',
            background: '#2f3136', color: 'white', border: '1px solid #202225'
          }}
        >
          {audioInputDevices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Mikrofon ${device.deviceId.slice(0,5)}...`}
            </option>
          ))}
        </select>
      </div>

      {/* MİKROFON SES SEVİYESİ */}
      <div className="settings-section">
        <div style={{display:'flex', justifyContent:'space-between', marginBottom:'5px'}}>
          <h3>Giriş Sesi (Mikrofon Gücü)</h3>
          <span style={{fontWeight:'bold', color:'#b9bbbe'}}>%{inputVolume}</span>
        </div>

        <input
          type="range"
          min="0"
          max="200"
          value={inputVolume}
          onChange={(e) => setInputVolume(parseInt(e.target.value))}
          style={{
            width: '100%',
            accentColor: '#5865F2',
            cursor: 'pointer'
          }}
        />
        <p style={{fontSize:'12px', color:'#b9bbbe', marginTop:'5px'}}>
          Normal seviye %100'dür. Sesiniz az gidiyorsa artırabilirsiniz.
        </p>
      </div>

      <hr style={{borderColor:'#3f4147', margin:'20px 0', opacity: 0.5}}/>

      {/* ÇIKIŞ CİHAZI */}
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
          {audioOutputDevices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Hoparlör ${device.deviceId.slice(0,5)}...`}
            </option>
          ))}
        </select>
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
              Değiştirmek için butona tıklayın ve klavyeden bir tuşa basın (veya mouse tuşuna basın).
            </p>
            <small style={{color:'#b9bbbe'}}>
              Şu anki kod: <b>{pttKeyCode}</b>
            </small>
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioSettingsPage;
