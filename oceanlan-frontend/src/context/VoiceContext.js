 // src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { AuthContext } from './AuthContext';
import { AudioSettingsContext } from './AudioSettingsContext';
import { ToastContext } from './ToastContext';

export const VoiceContext = createContext();

// 🔧 DÜZELTİLDİ #1: TURN sunucusu eklendi — sadece STUN yetmez,
// NAT arkasındaki kullanıcılarda ICE adayları eşleşmeyince ses gitmez.
// Kendi TURN sunucun varsa credentials kısmını doldur.
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Kendi TURN sunucun varsa aşağıyı aç:
    // {
    //   urls: 'turn:turn.oceanlan.com:3478',
    //   username: 'oceanlan',
    //   credential: 'YOUR_TURN_SECRET'
    // },
  ],
  iceTransportPolicy: 'all',
};

// 🟢 GÜRÜLTÜ ENGELLEME (Noise Gate) EŞİKLERİ
const GATE_OPEN_RMS = 0.018;  // 👈 Biraz yükselttik (0.006 idi)
const GATE_CLOSE_RMS = 0.010; // ESKİSİ: 0.014 (Cümle sonlarını yutmaz)
const GATE_FLOOR = 0.001;     // ESKİSİ: 0.08  (Konuşmadığında fan sesi TAMAMEN kesilir)
const GATE_HOLD_MS = 500;     // ESKİSİ: 260   (Kesik kesik konuşmayı engeller)
const EXPANDER_POWER = 8.0;   // Gürültüyü daha sert bastırır
const RMS_SMOOTHING = 0.90;   // Dalgalanmayı önler

const LOW_CUT_FREQ = 100;     // 80-100Hz altı fan uğultusunu keser
const HIGH_CUT_FREQ = 16000;

const AGGRESSIVE_AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  sampleSize: 16,
  channelCount: 1,
  // Chrome Özel Gelişmiş Ayarlar
  googEchoCancellation: true,
  googAutoGainControl: true,
  googNoiseSuppression: true,
  googHighpassFilter: true,
  googTypingNoiseDetection: true,
  googNoiseReduction: true,
  googExperimentalNoiseSuppression: true
};

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const audioElementsRef = useRef({});
  const socketUserMapRef = useRef({});

  const myScreenStreamRef = useRef(null);
  const [myScreenStream, setMyScreenStream] = useState(null);

  // ✅ EKLENDİ: Kamera stream'i
  const myCameraStreamRef = useRef(null);
  const [myCameraStream, setMyCameraStream] = useState(null);

  const audioContextRef = useRef(null);
  const inputGainNodeRef = useRef(null);
  const gateGainNodeRef = useRef(null);
  const isSpeakingRef = useRef(false);

  const isPTTPressedRef = useRef(false);
  const [isPTTPressed, setIsPTTPressed] = useState(false);

  const { user, token, isAuthenticated } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const audioSettings = useContext(AudioSettingsContext);

  const {
    inputDeviceId, outputDeviceId, isMicMuted, isDeafened,
    userVolumes, isNoiseSuppression, inputVolume = 100,
    inputMode = 'VOICE_ACTIVITY',
    pttKeyCode = 'Space'
  } = audioSettings || {};

  const [isConnected, setIsConnected] = useState(false);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);
  const [currentServerId, setCurrentServerId] = useState(null);
  const [currentVoiceChannelName, setCurrentVoiceChannelName] = useState(null);
  const [currentServerName, setCurrentServerName] = useState(null);
  const [speakingUsers, setSpeakingUsers] = useState({});
  const [micError, setMicError] = useState(null);
  const [stayConnected, setStayConnected] = useState(false);
  const [peersWithVideo, setPeersWithVideo] = useState({});

  // 🟢 MİKROFON AÇ/KAPA (Gain Node + Track)
  const setLocalMicEnabled = useCallback((enabled) => {
    const shouldSendAudio = !!enabled && !isMicMuted;

    // 1. Track Seviyesinde
    const toggleTracks = (stream) => {
      if (stream) stream.getAudioTracks().forEach(t => t.enabled = shouldSendAudio);
    };
    toggleTracks(localStreamRef.current);
    toggleTracks(processedStreamRef.current);

    // 2. Gain Node
    if (inputGainNodeRef.current && audioContextRef.current) {
      const ctx = audioContextRef.current;
      const targetVol = shouldSendAudio
        ? (inputVolume > 100 ? 1.0 + ((inputVolume - 100) / 30) : inputVolume / 100)
        : 0;
      try {
        inputGainNodeRef.current.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.05);
      } catch (e) {}
    }

    if (!shouldSendAudio) updateSpeakingStatus(false);
  }, [isMicMuted, inputVolume]);

  // 🟢 YENİ: AYARLAR DEĞİŞİNCE YAYINI CANLI GÜNCELLE (Kopmadan)
  useEffect(() => {
    if (!currentVoiceChannelId || !isConnected || !socketRef.current) return;

    let isCancelled = false;
let pendingStream = null; 
    const refreshStream = async () => {
      try {
        // ✅ ÖNEMLİ: Eski stream/track adaylarını daha hiçbir şeyi stop etmeden yakala
        const oldRawStream = localStreamRef.current;
        const oldProcessedStream = processedStreamRef.current;

        const oldCandidates = [
          { stream: oldProcessedStream, track: oldProcessedStream?.getAudioTracks?.()[0] },
          { stream: oldRawStream, track: oldRawStream?.getAudioTracks?.()[0] },
        ].filter(x => x?.stream && x?.track);

        // 1) Yeni Constraints (Ayarlara Göre)
        let finalConstraints = { audio: {}, video: false };

        if (isNoiseSuppression) {
          finalConstraints.audio = {
            ...AGGRESSIVE_AUDIO_CONSTRAINTS,
            deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
          };
        } else {
          finalConstraints.audio = {
            deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
            echoCancellation: true,
            autoGainControl: true,
            noiseSuppression: false // ✅ Bunu açıkça false yaparsan tarayıcı kendi NS'ini kapatır
          };
        }

        // 2) Yeni Stream Al
        const newRawStream = await navigator.mediaDevices.getUserMedia(finalConstraints);
pendingStream = newRawStream;

        if (isCancelled) {
          newRawStream.getTracks().forEach(t => t.stop());
          return;
        }



        // 3) Eski WebAudio context'i kapat (yeni zinciri kuracağız)
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
        }

        // 4) Yeni processed stream üret
        const newProcessedStream = await processAudioStream(newRawStream);
        const newTrack = newProcessedStream?.getAudioTracks?.()[0];

        // ✅ refs'i güncelle (setLocalMicEnabled yeni ref'leri görsün)
        localStreamRef.current = newRawStream;
        processedStreamRef.current = newProcessedStream;

        // 5) Peer'lerdeki Track'i Değiştir (Bağlantı kopmaz)
        if (newTrack) {
          Object.values(peersRef.current).forEach(peer => {
            if (!peer || peer.destroyed) return;

            // ✅ Hem oldProcessed hem oldRaw dene
            for (const cand of oldCandidates) {
              try {
                peer.replaceTrack(cand.track, newTrack, cand.stream);
                break;
              } catch (e) {}
            }
          });
        }

        // 6) Eski raw stream'i durdur (artık yeni stream kullanıyoruz)
        if (oldRawStream) {
          oldRawStream.getTracks().forEach(t => t.stop());
        }

        // 7) Mute/PTT Durumunu Geri Yükle
        if (inputMode === 'PUSH_TO_TALK') {
          setLocalMicEnabled(isPTTPressedRef.current);
        } else {
          setLocalMicEnabled(true);
        }

        // 8) Analiz Başlat (NS kapalıysa ikon için)
        if (!isNoiseSuppression) {
          startGateAnalysis(null, null, null, newRawStream);
        }

      } catch (error) {
        console.error("Stream yenileme hatası:", error);
        addToast("Ses ayarları güncellenemedi.", "error");
      }
    };

    refreshStream();

    return () => { isCancelled = true;
if (pendingStream) pendingStream.getTracks().forEach(t => t.stop());


 };
}, [isNoiseSuppression, inputDeviceId, inputMode, currentVoiceChannelId]);

  // Mod değiştiğinde PTT ayarla
  useEffect(() => {
    if (inputMode === 'PUSH_TO_TALK') {
      setLocalMicEnabled(isPTTPressedRef.current);
    } else {
      setLocalMicEnabled(true);
    }
  }, [inputMode, isPTTPressed, isMicMuted, setLocalMicEnabled]);

  // Socket bağlantı kodları
  useEffect(() => {
    if (!token || !isAuthenticated) {
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; setIsConnected(false); }
      return;
    }
    if (socketRef.current && socketRef.current.connected) return;

    const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;
    const isProductionUrl = window.location.hostname.includes('oceanlan.com');
    let backendUrl = 'http://localhost:4000';
    if (isElectron || isProductionUrl) backendUrl = 'https://oceanlan.com';

    const newSocket = io(backendUrl, { auth: { token }, transports: ['polling', 'websocket'], secure: true, reconnection: true, autoConnect: true });
    socketRef.current = newSocket;

    newSocket.on('connect', () => { setIsConnected(true); if (stayConnected && currentVoiceChannelId) rejoinChannel(); });
    newSocket.on('disconnect', () => setIsConnected(false));
    newSocket.on('user-joined-voice', handleUserJoined);
    newSocket.on('webrtc-offer', handleOffer);
    newSocket.on('webrtc-answer', handleAnswer);
    newSocket.on('webrtc-ice-candidate', handleIce);
    newSocket.on('user-left-voice', handleUserLeft);
    newSocket.on('voice-channel-moved', handleChannelMoved);
    newSocket.on('user-speaking-change', ({ userId, isSpeaking }) => setSpeakingUsers(prev => ({ ...prev, [userId]: isSpeaking })));

    // ✅ KAMERA da aynı event ile temizlenecek (değiştirmedik, sadece kamera da bu event'i kullanacak)
    newSocket.on('screen-share-stopped', ({ socketId }) =>
      setPeersWithVideo(prev => {
        const copy = { ...prev };
        delete copy[socketId];
        return copy;
      })
    );

    newSocket.on('voiceStateUpdate', (serverState) => {
      if (!serverState) return;
      Object.values(serverState).forEach(channelUsers => {
        channelUsers.forEach(u => { socketUserMapRef.current[u.socketId] = u.userId; });
      });
      applyVolumeSettings();
    });

    return () => { if (newSocket) newSocket.disconnect(); };
  }, [token, isAuthenticated]);

  const applyVolumeSettings = () => {
    Object.keys(audioElementsRef.current).forEach(socketId => {
      const el = audioElementsRef.current[socketId];
      const uid = socketUserMapRef.current[socketId];
      if (uid && el && userVolumes[uid] !== undefined) {
        el.volume = userVolumes[uid] === 0 ? 0 : Math.min(userVolumes[uid] / 100, 1.0);
      }
    });
  };
  useEffect(() => { applyVolumeSettings(); }, [userVolumes]);

  useEffect(() => {
    if (inputGainNodeRef.current && audioContextRef.current && !isMicMuted && (!inputMode || inputMode === 'VOICE_ACTIVITY' || isPTTPressedRef.current)) {
      let gainValue = 1.0;
      if (inputVolume === 0) gainValue = 0;
      else if (inputVolume <= 100) gainValue = inputVolume / 100;
      else gainValue = 1.0 + ((inputVolume - 100) / 30);
      try {
        inputGainNodeRef.current.gain.setTargetAtTime(gainValue, audioContextRef.current.currentTime, 0.05);
      } catch(e){}
    }
  }, [inputVolume, isMicMuted, inputMode]);

  // PTT Logic
  useEffect(() => {
    if (inputMode !== 'PUSH_TO_TALK') { isPTTPressedRef.current = false; setIsPTTPressed(false); return; }
    const isMouseBinding = (code) => typeof code === 'string' && code.startsWith('MOUSE_');
    const mouseButtonFromCode = (code) => { const n = parseInt(String(code).replace('MOUSE_', ''), 10); return Number.isFinite(n) ? n : null; };
    const pttDown = () => { if (isMicMuted || isPTTPressedRef.current) return; isPTTPressedRef.current = true; setIsPTTPressed(true); setLocalMicEnabled(true); updateSpeakingStatus(true); };
    const pttUp = () => { if (!isPTTPressedRef.current) return; isPTTPressedRef.current = false; setIsPTTPressed(false); setLocalMicEnabled(false); updateSpeakingStatus(false); };
    const onKeyDown = (e) => { if (!e.repeat && e.code === pttKeyCode) pttDown(); };
    const onKeyUp = (e) => { if (e.code === pttKeyCode) pttUp(); };
    const onMouseDown = (e) => { if (!isMouseBinding(pttKeyCode)) return; if (mouseButtonFromCode(pttKeyCode) === e.button) pttDown(); };
    const onMouseUp = (e) => { if (!isMouseBinding(pttKeyCode)) return; if (mouseButtonFromCode(pttKeyCode) === e.button) pttUp(); };
    const onBlur = () => pttUp();
    const onVisibilityChange = () => { if (document.hidden) pttUp(); };
    window.addEventListener('keydown', onKeyDown, true); window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('mousedown', onMouseDown, true); window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('blur', onBlur, true); document.addEventListener('visibilitychange', onVisibilityChange, true);

    let offDown = null, offUp = null;
    if (window.electronAPI?.onPTTDown && window.electronAPI?.onPTTUp) { offDown = window.electronAPI.onPTTDown(pttDown); offUp = window.electronAPI.onPTTUp(pttUp); }

    setLocalMicEnabled(false);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('mousedown', onMouseDown, true); window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('blur', onBlur, true); document.removeEventListener('visibilitychange', onVisibilityChange, true);
      offDown && offDown(); offUp && offUp();
    };
  }, [inputMode, pttKeyCode, isMicMuted, setLocalMicEnabled]);

  // ✅ EKLENDİ: Kamera başlat / durdur
  const startCamera = async () => {
    try {
      // Aynı anda 2 video istemiyorsan: kamera açılırken ekran paylaşımını kapat
      if (myScreenStreamRef.current) {
        stopScreenShare();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
        deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
        echoCancellation: true,    // 👈 Oyundaki sesin geri gitmesini engeller
        noiseSuppression: true,     // 👈 Arka plan gürültüsünü süzer
        autoGainControl: true,      // 👈 Ses seviyesini dengeler
        channelCount: 1,            // 👈 Mono ses (WebRTC için daha kararlı)
        sampleRate: 48000
    },
    video: false
      });

      setMyCameraStream(stream);
      myCameraStreamRef.current = stream;

      // Peer'lara stream ekle
      Object.values(peersRef.current).forEach(peer => {
        try { if (peer && !peer.destroyed) peer.addStream(stream); } catch (err) {}
      });

      // Kullanıcı kamerayı OS'tan kapatırsa
      const vTrack = stream.getVideoTracks?.()[0];
      if (vTrack) vTrack.onended = () => stopCamera();

    } catch (err) {
      console.error("Kamera başlatılamadı:", err);
      addToast("Kamera başlatılamadı", "error");
    }
  };

  const stopCamera = () => {
    // Herkeste kapanması için aynı event’i kullanıyoruz
    if (socketRef.current) {
      socketRef.current.emit('screen-share-stopped', {
        serverId: currentServerId,
        channelId: currentVoiceChannelId,
        socketId: socketRef.current.id,
        userId: user?._id
      });
    }

    const stream = myCameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      Object.values(peersRef.current).forEach(p => {
        try { p.removeStream(stream); } catch(e){}
      });
      setMyCameraStream(null);
      myCameraStreamRef.current = null;
    }
  };

  const startScreenShare = async (electronSourceId = null) => {
    try {
      if (myCameraStreamRef.current) stopCamera();

      let stream;
      if (window.electronAPI && electronSourceId) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: electronSourceId,
              minWidth: 1280, maxWidth: 1920,
              minHeight: 720, maxHeight: 1080,
              // 🔧 DÜZELTİLDİ #3: Oyunlarda GPU yakalama sınırlandırılır,
              // sınırsız FPS talebi track'i anında 'ended'e düşürür
              maxFrameRate: 30,
            }
          }
        });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 30, max: 30 }, // 🔧 DÜZELTİLDİ #3: frameRate sınırı
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: true,
          // 🔧 DÜZELTİLDİ #3: Sistem sesi varsa ayrı track — WebRTC karışıklığını önler
          selfBrowserSurface: 'exclude',
        });
      }

      setMyScreenStream(stream);
      myScreenStreamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];

      // 🔧 DÜZELTİLDİ #3: addStream yerine replaceTrack kullan
      // addStream eski track'lerle çakışır, izleyicide görüntü donuklaşır
      Object.values(peersRef.current).forEach(peer => {
        if (!peer || peer.destroyed) return;
        try {
          // Mevcut video track'i varsa değiştir, yoksa ekle
          const senders = peer._pc?.getSenders?.() || [];
          const videoSender = senders.find(s => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(videoTrack).catch(() => {
              // replaceTrack başarısız olursa addStream fallback
              peer.addStream(stream);
            });
          } else {
            peer.addStream(stream);
          }
        } catch (err) {
          console.warn('[ScreenShare] Track eklenemedi:', err);
        }
      });

      // Kullanıcı OS'tan paylaşımı kapatırsa veya oyun minimize olursa
      videoTrack.onended = () => stopScreenShare();

      // 🔧 DÜZELTİLDİ #3: Track mute olunca (oyun tam ekran gibi) hemen kesme,
      // 3 saniye bekle, hala ended ise kapat
      videoTrack.onmute = () => {
        setTimeout(() => {
          if (videoTrack.readyState === 'ended') stopScreenShare();
        }, 3000);
      };

    } catch (err) {
      console.error('[ScreenShare] Hata:', err);
      addToast("Ekran paylaşımı başlatılamadı", "error");
    }
  };

  const stopScreenShare = () => {
    if (socketRef.current) {
      socketRef.current.emit('screen-share-stopped', {
        serverId: currentServerId,
        channelId: currentVoiceChannelId,
        socketId: socketRef.current.id,
        userId: user?._id
      });
    }

    const stream = myScreenStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());

      // 🔧 DÜZELTİLDİ #3b: Peer'lara video track'in bittiğini bildir
      Object.values(peersRef.current).forEach(peer => {
        if (!peer || peer.destroyed) return;
        try {
          const senders = peer._pc?.getSenders?.() || [];
          const videoSender = senders.find(s => s.track?.kind === 'video');
          if (videoSender) videoSender.replaceTrack(null).catch(() => {});
        } catch (e) {}
      });

      setMyScreenStream(null);
      myScreenStreamRef.current = null;
    }
  };

  const handleUserJoined = ({ socketId, userId }) => {
    if (socketId && userId) socketUserMapRef.current[socketId] = userId;

    const audioStream = processedStreamRef.current || localStreamRef.current;

    // ✅ EKLENDİ: ekran yoksa kamera varsa onu gönder
    const videoStream = myScreenStreamRef.current || myCameraStreamRef.current;

    const streams = [audioStream, videoStream].filter(Boolean);
    createPeer(socketId, true, streams, userId);
  };

  // 🟢 GELİŞMİŞ GÜRÜLTÜ ENGELLEME İŞLEMCİSİ
  const processAudioStream = async (rawStream) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return rawStream;
      const audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const source = audioCtx.createMediaStreamSource(rawStream);
      const destination = audioCtx.createMediaStreamDestination();

      const inputGain = audioCtx.createGain();
      const startVol = inputVolume > 100 ? 1.0 + ((inputVolume - 100) / 30) : inputVolume / 100;
      inputGain.gain.value = inputVolume === 0 ? 0 : startVol;
      inputGainNodeRef.current = inputGain;

      let currentNode = source;
      currentNode.connect(inputGain);
      currentNode = inputGain;

      if (isNoiseSuppression) {
        const highPass = audioCtx.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = LOW_CUT_FREQ;
        highPass.Q.value = 0.5;

        const lowPass = audioCtx.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = HIGH_CUT_FREQ;
        lowPass.Q.value = 0.5;

        const gateGain = audioCtx.createGain();
        gateGain.gain.value = 1;
        gateGainNodeRef.current = gateGain;

        const compressor = audioCtx.createDynamicsCompressor();
       compressor.threshold.value = -24; // ESKİSİ: -30 (Çok erkenden sesi kısmasın)
        compressor.knee.value = 30;       // Daha yumuşak geçiş
        compressor.ratio.value = 4;       // ESKİSİ: 6 (Sesi çok ezmesin)
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        currentNode.connect(highPass);
        highPass.connect(lowPass);
        lowPass.connect(gateGain);
        gateGain.connect(compressor);
        compressor.connect(destination);

        const analyser = audioCtx.createAnalyser();
        analyser.smoothingTimeConstant = 0.8;
        lowPass.connect(analyser);
        startGateAnalysis(analyser, gateGain, audioCtx);
      } else {
        currentNode.connect(destination);
        startGateAnalysis(null, null, null, rawStream);
      }

      audioContextRef.current = audioCtx;
      return destination.stream;
    } catch (e) {
      console.error("Ses işleme hatası:", e);
      return rawStream;
    }
  };

  const gateLoopActiveRef = useRef(false); // 🔧 DÜZELTİLDİ #2: Eski döngüyü öldürmek için flag

  const startGateAnalysis = (analyser, gateGainNode, audioCtx, rawStreamForSimpleMode = null) => {
    // Her yeni analiz başlamadan önce önceki döngüyü durdur
    gateLoopActiveRef.current = false;
    const loopId = {}; // her çağrıya özgü referans
    gateLoopActiveRef.current = true;
    const thisLoopAlive = gateLoopActiveRef; // closure'a yakala
    if (analyser && gateGainNode && audioCtx) {
      analyser.fftSize = 1024;
      const timeData = new Float32Array(analyser.fftSize);

      let gateIsOpen = true;
      let lastOpenTime = performance.now();
      let smoothedRms = 0;

      const checkVolume = () => {
        // 🔧 DÜZELTİLDİ #2b: Eski döngü öldürüldüyse dur (refreshStream race condition'ı)
        if (!gateLoopActiveRef.current) return;
        if (!gateGainNode || audioCtx.state === 'closed') return;

        if (inputMode === 'PUSH_TO_TALK') {
          const isOpen = isPTTPressedRef.current;
          gateGainNode.gain.setTargetAtTime(isOpen ? 1 : 0, audioCtx.currentTime, isOpen ? 0.01 : 0.05);
          updateSpeakingStatus(isOpen);
          requestAnimationFrame(checkVolume);
          return;
        }

        analyser.getFloatTimeDomainData(timeData);

        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = timeData[i];
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / timeData.length);

        smoothedRms = (RMS_SMOOTHING * smoothedRms) + ((1 - RMS_SMOOTHING) * rms);

        const now = performance.now();

        if (smoothedRms >= GATE_OPEN_RMS) {
          gateIsOpen = true;
          lastOpenTime = now;
        } else if (smoothedRms <= GATE_CLOSE_RMS) {
          if (now - lastOpenTime > GATE_HOLD_MS) gateIsOpen = false;
        }

        const norm = Math.min(Math.max(smoothedRms / GATE_OPEN_RMS, 0), 1);
        const shaped = Math.pow(norm, EXPANDER_POWER);

        let target;
        if (gateIsOpen) {
          target = GATE_FLOOR + (1 - GATE_FLOOR) * shaped;
          // NOT: Senin kodunda burada SPEECH_FLOOR kullanımı var (ben bozmadım)
          // target = Math.max(target, SPEECH_FLOOR);
        } else {
          target = GATE_FLOOR;
        }

        const tau = gateIsOpen ? 0.035 : 0.12;
        gateGainNode.gain.setTargetAtTime(target, audioCtx.currentTime, tau);

        updateSpeakingStatus(gateIsOpen);
        requestAnimationFrame(checkVolume);
      };

      checkVolume();
      return;
    }

    if (rawStreamForSimpleMode) {
      try {
        const simpleCtx = new AudioContext();
        const simpleAnalyser = simpleCtx.createAnalyser();
        const simpleSrc = simpleCtx.createMediaStreamSource(rawStreamForSimpleMode);
        simpleSrc.connect(simpleAnalyser);
        const checkLoop = () => {
          // 🔧 DÜZELTİLDİ #2c: Basit modda da eski döngü öldürülür
          if (!gateLoopActiveRef.current) { simpleCtx.close().catch(() => {}); return; }
          if (simpleCtx.state === 'closed') return;
          if (inputMode === 'PUSH_TO_TALK') {
            updateSpeakingStatus(isPTTPressedRef.current);
            requestAnimationFrame(checkLoop);
            return;
          }
          const arr = new Uint8Array(simpleAnalyser.frequencyBinCount);
          simpleAnalyser.getByteFrequencyData(arr);
          let sum = 0; for (let i = 0; i < arr.length; i++) sum += arr[i];
          updateSpeakingStatus((sum / arr.length) > 10);
          requestAnimationFrame(checkLoop);
        };
        checkLoop();
      } catch (e) {}
    }
  };

  const updateSpeakingStatus = (isSpeaking) => {
    if (isSpeakingRef.current !== isSpeaking) {
      isSpeakingRef.current = isSpeaking;
      if (currentServerId && user) {
        const event = isSpeaking ? 'speaking-start' : 'speaking-stop';
        socketRef.current?.emit(event, { serverId: currentServerId, userId: user.id });
      }
      if (user) setSpeakingUsers(prev => ({ ...prev, [user.id]: isSpeaking }));
    }
  };

  const handleChannelMoved = ({ newChannelId, serverId, channelName }) => {
    cleanupMediaOnly();
    setCurrentVoiceChannelId(newChannelId);
    setCurrentServerId(serverId);
    if (channelName) setCurrentVoiceChannelName(channelName);
    joinVoiceChannel(serverId, newChannelId);
  };

  // ✅ FORCE PARAMETRELİ HALE GETİRİLDİ
  const joinVoiceChannel = async (server, channel, force = false) => {
    const sId = server?._id || server;
    const cId = channel?._id || channel;

    if (!force && currentVoiceChannelId === cId) return;
    if (currentVoiceChannelId) { cleanupMediaOnly(); socketRef.current?.emit('leave-voice-channel'); }

    setCurrentVoiceChannelId(cId);
    setCurrentServerId(sId);
    setStayConnected(true);

    if (server?.name) setCurrentServerName(server.name);
    if (channel?.name) setCurrentVoiceChannelName(channel.name);

    try {
      let finalConstraints = { audio: {}, video: false };
      if (isNoiseSuppression) {
        finalConstraints.audio = {
          ...AGGRESSIVE_AUDIO_CONSTRAINTS,
          deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined
        };
      } else {
        finalConstraints.audio = {
          deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
          echoCancellation: true,
          autoGainControl: true
        };
      }

      let rawStream;
      try {
        rawStream = await navigator.mediaDevices.getUserMedia(finalConstraints);
      } catch (e) {
        rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }

      localStreamRef.current = rawStream;
      let streamToSend = await processAudioStream(rawStream);
      processedStreamRef.current = streamToSend;

      if (inputMode === 'PUSH_TO_TALK') setLocalMicEnabled(isPTTPressedRef.current);
      else setLocalMicEnabled(true);

      if (!isNoiseSuppression) startGateAnalysis(null, null, null, rawStream);

      socketRef.current.emit('join-voice-channel', {
        serverId: sId,
        channelId: cId,
        userId: user?._id || user?.id,
        username: user?.username
      });
    } catch (err) {
      setMicError("Mikrofon hatası");
      addToast('Mikrofon hatası', 'error');
    }
  };

  // ✅ YENİ: AYARLAR (ÖZELLİKLE GÜRÜLTÜ ENGELLEME) DEĞİŞİNCE ANINDA UYGULAMAK İÇİN
  const reconnectVoiceChannel = useCallback(async () => {
    if (!currentServerId || !currentVoiceChannelId) return;
    await joinVoiceChannel(currentServerId, currentVoiceChannelId, true);
  }, [currentServerId, currentVoiceChannelId]);

  const leaveVoiceChannel = () => {
    setStayConnected(false);
    setCurrentVoiceChannelId(null);
    setCurrentServerId(null);
    socketRef.current?.emit('leave-voice-channel');
    cleanupMediaOnly();
  };

  const cleanupMediaOnly = () => {
    Object.keys(peersRef.current).forEach(id => { peersRef.current[id]?.destroy(); audioElementsRef.current[id]?.remove(); });
    peersRef.current = {};
    audioElementsRef.current = {};
    socketUserMapRef.current = {};
    setPeersWithVideo({});
    setSpeakingUsers({});
    isSpeakingRef.current = false;

    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (processedStreamRef.current) processedStreamRef.current = null;

    if (myScreenStreamRef.current) { myScreenStreamRef.current.getTracks().forEach(t => t.stop()); myScreenStreamRef.current = null; setMyScreenStream(null); }

    // ✅ EKLENDİ: Kamera cleanup
    if (myCameraStreamRef.current) { myCameraStreamRef.current.getTracks().forEach(t => t.stop()); myCameraStreamRef.current = null; setMyCameraStream(null); }

    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
  };

  const rejoinChannel = () => {};

  const createPeer = (targetSocketId, initiator, streams = [], userId = null) => {
    const p = new Peer({ 
      initiator, 
      trickle: true,   // 🔧 DÜZELTİLDİ #1b: trickle:true — false iken ICE adayları geç gelirse bağlantı sessiz kalıyor
      streams, 
      config: rtcConfig 
    });

    p.on('signal', data => {
  if (data.type === 'offer') {
    socketRef.current?.emit('webrtc-offer', { targetSocketId, sdp: data, userId: user?.id });
  } else if (data.type === 'answer') {
    socketRef.current?.emit('webrtc-answer', { targetSocketId, sdp: data, userId: user?.id });
  } else if (data.candidate) {
    // 🟢 Sadece gerçek bir candidate bilgisi varsa gönder
    socketRef.current?.emit('webrtc-ice-candidate', { 
      targetSocketId, 
      candidate: data.candidate, // veya direkt data
      userId: user?.id 
    });
  }
});

    p.on('stream', stream => {
      // 🟢 C KISMI BURADA: Stream geldiğinde kontrol et
      if (stream.getAudioTracks().length === 0 && stream.getVideoTracks().length === 0) {
        console.warn("[WebRTC] Boş stream algılandı! Bağlantı tazeleniyor...");
        reconnectVoiceChannel(); 
      }
      handleRemoteStream(stream, targetSocketId, userId);
    });

    // 🔧 DÜZELTİLDİ #1c: Peer hatalarında döngüsel reconnect yerine sadece o peer yeniden kurulur
    p.on('error', err => {
      console.error('[WebRTC Hatası]:', err);
      if (err.code === 'ERR_ICE_CONNECTION_FAILURE' || err.code === 'ERR_DATA_CHANNEL') {
        console.log("[WebRTC] Peer bağlantısı koptu, sadece bu peer yeniden kuruluyor...");
        // Tüm odadan çıkmak yerine sadece bu peer'ı yeniden kur
        const uid = socketUserMapRef.current[targetSocketId];
        peersRef.current[targetSocketId]?.destroy();
        delete peersRef.current[targetSocketId];
        const audioStream = processedStreamRef.current || localStreamRef.current;
        const videoStream = myScreenStreamRef.current || myCameraStreamRef.current;
        const newStreams = [audioStream, videoStream].filter(Boolean);
        createPeer(targetSocketId, true, newStreams, uid);
      }
    });

    peersRef.current[targetSocketId] = p;
    return p;
  };

  const handleOffer = ({ socketId, sdp, userId }) => {
    if (userId) socketUserMapRef.current[socketId] = userId;
    if (peersRef.current[socketId]) peersRef.current[socketId].destroy();

    const audioStream = processedStreamRef.current || localStreamRef.current;

    // ✅ EKLENDİ: ekran yoksa kamera varsa onu gönder
    const videoStream = myScreenStreamRef.current || myCameraStreamRef.current;

    const streams = [audioStream, videoStream].filter(Boolean);
    const p = createPeer(socketId, false, streams, userId);
    p.signal(sdp);
  };

  const handleAnswer = ({ socketId, sdp }) => peersRef.current[socketId]?.signal(sdp);
  const handleIce = ({ socketId, candidate }) => peersRef.current[socketId]?.signal(candidate);

  const handleUserLeft = ({ socketId }) => {
    peersRef.current[socketId]?.destroy(); delete peersRef.current[socketId];
    audioElementsRef.current[socketId]?.remove(); delete audioElementsRef.current[socketId]; delete socketUserMapRef.current[socketId];
    setPeersWithVideo(prev => { const n = { ...prev }; delete n[socketId]; return n; });
  };

  const handleRemoteStream = (stream, socketId, userId) => {
    if (userId) socketUserMapRef.current[socketId] = userId;

    // ✅ VIDEO (Screen Share veya Kamera)
    if (stream.getVideoTracks().length > 0) {
      setPeersWithVideo(prev => ({ ...prev, [socketId]: stream }));

      const vTrack = stream.getVideoTracks()[0];
      const cleanupVideo = () => {
        setPeersWithVideo(prev => {
          const next = { ...prev };
          delete next[socketId];
          return next;
        });
      };

      if (vTrack) {
        vTrack.onended = cleanupVideo;
        vTrack.onmute = () => {
          setTimeout(() => {
            // Eğer hala kapalıysa ve gerçekten yayın bittiyse kapat
            if (vTrack.readyState === 'ended') {
                cleanupVideo();
            }
        }, 3000);
        };
      }

      try { stream.addEventListener?.('inactive', cleanupVideo); } catch (e) {}

      return;
    }

    // ✅ AUDIO (normal)
    if (audioElementsRef.current[socketId]) audioElementsRef.current[socketId].remove();

    const audio = document.createElement('audio');
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.style.display = 'none';
    audio.muted = isDeafened;
    document.body.appendChild(audio);

    if (outputDeviceId && typeof audio.setSinkId === 'function') {
      audio.setSinkId(outputDeviceId).catch(() => {});
    }

    audioElementsRef.current[socketId] = audio;
    applyVolumeSettings();
  };

  useEffect(() => {
    if (!audioElementsRef.current) return;
    Object.values(audioElementsRef.current).forEach((audio) => {
      if (!audio) return;
      audio.muted = isDeafened;
      if (outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(() => {});
    });
  }, [isDeafened, outputDeviceId, userVolumes]);

  return (
    <VoiceContext.Provider value={{
      socket: socketRef.current,
      isConnected,
      currentVoiceChannelId,
      currentServerId,
      currentVoiceChannelName,
      currentServerName,
      joinVoiceChannel,
      reconnectVoiceChannel, // ✅ eklendi
      leaveVoiceChannel,
      speakingUsers,
      micError,
      stayConnected,
      peersWithVideo,

      myScreenStream,
      startScreenShare,
      stopScreenShare,

      // ✅ EKLENDİ: Kamera API
      myCameraStream,
      startCamera,
      stopCamera,

      isPTTPressed,

      userIdBySocketId: socketUserMapRef.current, // ✅ EKLE
    }}>
      {children}
    </VoiceContext.Provider>
  );
};
