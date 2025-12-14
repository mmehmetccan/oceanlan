// src/pages/AudioSettingsPage.jsx
import React, { useContext, useState, useEffect } from 'react';
import { AudioSettingsContext } from '../context/AudioSettingsContext';
import { useNavigate } from 'react-router-dom';
import '../styles/AudioSettings.css';

const AudioSettingsPage = () => {
  const {
    inputMode, setInputMode,
    pttKey, setPttKey, pttKeyCode, setPttKeyCode, // 🟢 Code eklendi
    outputDeviceId, setOutputDeviceId,
    inputDeviceId, setInputDeviceId,
    inputVolume, setInputVolume
  } = useContext(AudioSettingsContext);

  const [isListening, setIsListening] = useState(false);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioOutputDevices(devices.filter(d => d.kind === 'audiooutput'));
        setAudioInputDevices(devices.filter(d => d.kind === 'audioinput'));
      } catch (err) { console.error("Cihaz hatası:", err); }
    };
    getDevices();
    navigator.mediaDevices.ondevicechange = getDevices;
  }, []);

  // 🟢 TUŞ DİNLEME (KLAVYE + MOUSE)
  useEffect(() => {
    if (!isListening) return;

    // Klavye Yakalama
    const handleKeyDown = (e) => {
      e.preventDefault();
      // Code: "Space", "KeyA" vb.
      const code = e.code;
      const name = e.key.toUpperCase() === ' ' ? 'SPACE' : e.key.toUpperCase();

      setPttKey(name);
      setPttKeyCode(code);
      setIsListening(false);
    };

    // Mouse Yakalama (Makro Tuşları)
    const handleMouseDown = (e) => {
      e.preventDefault();
      // Button: 0(Sol), 1(Orta), 2(Sağ), 3(Geri), 4(İleri)
      const code = e.button;
      let name = `MOUSE ${e.button}`;
      if (code === 0) name = "SOL TIK";
      if (code === 1) name = "ORTA TIK";
      if (code === 2) name = "SAĞ TIK";
      if (code === 3) name = "MOUSE 4 (GERİ)";
      if (code === 4) name = "MOUSE 5 (İLERİ)";

      setPttKey(name);
      setPttKeyCode(code);
      setIsListening(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isListening, setPttKey, setPttKeyCode]);

  return (
      <div className="audio-settings-container">
        <div className="settings-header-row" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px'}}>
          <h2 style={{margin: 0}}>Ses ve Görüntü</h2>
          <button onClick={() => navigate(-1)} className="close-settings-btn">✕</button>
        </div>

        <div className="settings-section">
            <h3>Giriş Cihazı</h3>
            <select value={inputDeviceId} onChange={(e) => setInputDeviceId(e.target.value)} style={{width: '100%', padding: '10px', background: '#2f3136', color: 'white', border: '1px solid #202225'}}>
                {audioInputDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mikrofon ${d.deviceId.slice(0,5)}`}</option>)}
            </select>
        </div>

        <div className="settings-section">
            <div style={{display:'flex', justifyContent:'space-between'}}><h3>Giriş Sesi</h3><span>%{inputVolume}</span></div>
            <input type="range" min="0" max="200" value={inputVolume} onChange={(e) => setInputVolume(parseInt(e.target.value))} style={{width: '100%', accentColor: '#5865F2'}} />
        </div>

        <hr style={{borderColor:'#3f4147', margin:'20px 0', opacity: 0.5}}/>

        <div className="settings-section">
            <h3>Çıkış Cihazı</h3>
            <select value={outputDeviceId} onChange={(e) => setOutputDeviceId(e.target.value)} style={{width: '100%', padding: '10px', background: '#2f3136', color: 'white', border: '1px solid #202225'}}>
                {audioOutputDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Hoparlör ${d.deviceId.slice(0,5)}`}</option>)}
            </select>
        </div>

        <div className="settings-section">
          <h3>Giriş Modu</h3>
          <div className="radio-group">
            <label className={`radio-option ${inputMode === 'VOICE_ACTIVITY' ? 'selected' : ''}`}>
              <input type="radio" value="VOICE_ACTIVITY" checked={inputMode === 'VOICE_ACTIVITY'} onChange={() => setInputMode('VOICE_ACTIVITY')} />
              <div className="radio-content"><span>Ses Etkinliği</span><small>Konuştuğunuzda otomatik açılır.</small></div>
            </label>

            <label className={`radio-option ${inputMode === 'PUSH_TO_TALK' ? 'selected' : ''}`}>
              <input type="radio" value="PUSH_TO_TALK" checked={inputMode === 'PUSH_TO_TALK'} onChange={() => setInputMode('PUSH_TO_TALK')} />
              <div className="radio-content"><span>Bas Konuş</span><small>Atadığınız tuşa basılı tutunca ses gider.</small></div>
            </label>
          </div>
        </div>

        {inputMode === 'PUSH_TO_TALK' && (
            <div className="settings-section">
              <h3>Kısayol Tuşu</h3>
              <div className="keybind-wrapper">
                <button className={`keybind-btn ${isListening ? 'listening' : ''}`} onClick={() => setIsListening(true)}>
                  {isListening ? 'Tuşa veya Mouse Tuşuna Basın...' : pttKey}
                </button>
              </div>
            </div>
        )}
      </div>
  );
};

export default AudioSettingsPage;