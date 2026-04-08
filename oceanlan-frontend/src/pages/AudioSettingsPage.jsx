// src/pages/AudioSettingsPage.jsx
import React, { useContext, useState, useEffect ,useRef} from 'react';
import { AudioSettingsContext } from '../context/AudioSettingsContext';
import { useNavigate } from 'react-router-dom';
import { ToastContext } from '../context/ToastContext';
import '../styles/AudioSettings.css';

const AudioSettingsPage = () => {
  const {
    inputMode, setInputMode,
    pttKey, setPttKey, pttKeyCode, setPttKeyCode,
    outputDeviceId, setOutputDeviceId,
    inputDeviceId, setInputDeviceId,
    inputVolume, setInputVolume,
    isMicMuted
  } = useContext(AudioSettingsContext);

  const [isListening, setIsListening] = useState(false);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const navigate = useNavigate();
const { addToast } = useContext(ToastContext);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0); // 0-100 arası görsel bar için
  const testStreamRef = useRef(null);
  const testAudioCtxRef = useRef(null);
  const animationFrameRef = useRef(null);

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

  const toggleMicTest = async () => {
  if (isTestingMic) {
    stopMicTest();
  } else {
    try {
      // 1. Cihaz seçimini ve güncel kısıtlamaları uygula
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { 
          deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: false // Test sırasında ham sesi görmek daha iyidir
        }
      });
      testStreamRef.current = stream;

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContext();
      testAudioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      
      // 2. Ses seviyesi (inputVolume) düğümünü ekle
      // Böylece sesi kıstığında bar da düşer.
      const gainNode = audioCtx.createGain();
      const vol = inputVolume / 100;
      gainNode.gain.value = vol;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512; // Daha hassas analiz için yükseltildi
      analyser.smoothingTimeConstant = 0.4; // Tepki hızını artırır (dalgalanma için kritik)

      source.connect(gainNode);
      gainNode.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
  // 1. Döngü Güvenlik Kontrolleri
  if (!testAudioCtxRef.current || !isTestingMic) return; 

  // 2. Mute Kontrolü (Mikrofon kapalıysa barı sıfırla ve bekle)
  

  // 3. Frekans Verisini Al
  analyser.getByteFrequencyData(dataArray);

  // 4. Sadece Konuşma Frekanslarına Odaklan (Dalgalanma için KRİTİK)
  // İnsan sesi genelde düşük ve orta frekanslardadır. 
  // Tüm buffer yerine ilk %30'luk kısmı (bas ve orta sesler) hesaplamak barı canlandırır.
  let sum = 0;
  const focusRange = Math.floor(bufferLength * 0.3); 
  
  for (let i = 0; i < focusRange; i++) {
    sum += dataArray[i];
  }
  
  let average = sum / focusRange;

  // 5. Giriş Volümü ile Çarp (Sesi kıstığında barın düşmesi için)
  const currentVolMult = inputVolume / 100;
  average = average * currentVolMult;

  // 6. Dip Gürültü Filtresi ve Hassasiyet Çarpanı
  if (average < 1.5) {
    average = 0;
  }

  // Barın daha hareketli görünmesi için logaritmik veya daha yüksek bir çarpan:
  const finalLevel = Math.min(average * 1.8, 100); 
  
  setMicLevel(finalLevel);

  animationFrameRef.current = requestAnimationFrame(updateLevel);
};

      updateLevel();
      setIsTestingMic(true);
    } catch (err) {
      console.error("Test başlatılamadı:", err);
      addToast("Mikrofona erişilemedi.", "error");
    }
  }
};

  const stopMicTest = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (testStreamRef.current) testStreamRef.current.getTracks().forEach(t => t.stop());
    if (testAudioCtxRef.current) testAudioCtxRef.current.close();
    setMicLevel(0);
    setIsTestingMic(false);
  };

  // Sayfadan çıkınca testi durdur
  useEffect(() => {
    return () => stopMicTest();
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

      {/* ✅ MİKROFON TESTİ (YENİ EKLENEN) */}
      <div className="settings-section mic-test-section">
        <h3>Mikrofonu Kontrol Et</h3>
        <p style={{fontSize:'12px', color:'#b9bbbe', marginBottom:'10px'}}>
            Sesinin nasıl gittiğini görmek için testi başlat ve konuş.
        </p>
        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
            <button 
                onClick={toggleMicTest} 
                className={`test-btn ${isTestingMic ? 'active' : ''}`}
            >
                {isTestingMic ? 'Durdur' : 'Testi Başlat'}
            </button>
            <div className="mic-meter-container">
                <div 
                    className="mic-meter-fill" 
                    style={{ width: `${micLevel}%`, backgroundColor: micLevel > 15 ? '#43b581' : '#f04747' }}
                />
                {/* Gate Eşiği Çizgisi (Görsel Yardımcı) */}
                <div className="gate-threshold-line" style={{ left: '12%' }} /> 
            </div>
        </div>
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
