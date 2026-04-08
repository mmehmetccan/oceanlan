// src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { AuthContext } from './AuthContext';
import { AudioSettingsContext } from './AudioSettingsContext';
import { ToastContext } from './ToastContext';

export const VoiceContext = createContext();

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // {
    //   urls: 'turn:turn.oceanlan.com:3478',
    //   username: 'oceanlan',
    //   credential: 'YOUR_TURN_SECRET'
    // },
  ],
  iceTransportPolicy: 'all',
};

// ============================================================
// 🎛️ NOISE GATE PARAMETRELERİ
// ------------------------------------------------------------
// GATE_OPEN_RMS   : Konuşma başladığı an için RMS eşiği.
//                   0.018 → 0.030 yükseltildi.
//                   Klavye/nefes gibi düşük enerjili sesler artık gate'i açmaz.
//
// GATE_CLOSE_RMS  : Gate'in kapanmaya başlayacağı eşik.
//                   Konuşma bitince hızlı kapanır.
//
// GATE_FLOOR      : Gate kapalıyken sinyale uygulanan minimum kazanç.
//                   0.001 → 0.0001 düşürüldü. Arka plan neredeyse tamamen kesilir.
//
// GATE_HOLD_MS    : Gate, son konuşma sesinin üstünden bu kadar ms geçmeden kapanmaz.
//                   Cümle aralarında ses kesilmesini önler.
//
// EXPANDER_POWER  : Gate açıkken RMS'i şekillendiren üs değeri.
//                   8 → 3 düşürüldü. Önceki değer düşük sesli konuşmayı
//                   neredeyse sıfırlıyordu; şimdi daha doğal geçiş var.
//
// RMS_SMOOTHING   : Anlık RMS dalgalanmalarını yumuşatır.
//                   0.90 korundu — çok yüksek olursa gecikme artar.
// ============================================================
const GATE_OPEN_RMS   = 0.015;
const GATE_CLOSE_RMS  = 0.008;
const GATE_FLOOR      = 0.002;
const GATE_HOLD_MS    = 500;
const EXPANDER_POWER  = 3.0;
const RMS_SMOOTHING   = 0.75;

// ============================================================
// 🎛️ EQ / FİLTRE PARAMETRELERİ
// ------------------------------------------------------------
// LOW_CUT_FREQ    : Highpass filtresi kesim noktası.
//                   100 → 120 Hz yükseltildi.
//                   Derin nefes/hırıltı sesleri genellikle 80-120 Hz bandındadır.
//
// HIGH_CUT_FREQ   : Lowpass filtresi kesim noktası. Değişmedi.
//
// LOW_CUT_Q       : Highpass filtresi Q değeri (eğim diklği).
//                   0.5 → 0.7 yükseltildi — daha dik kesiş, daha az geçirgen.
// ============================================================
const LOW_CUT_FREQ  = 150;
const HIGH_CUT_FREQ = 16000;
const LOW_CUT_Q     = 0.7;

const AGGRESSIVE_AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  sampleSize: 16,
  channelCount: 1,
  googEchoCancellation: true,
  googAutoGainControl: true,
  googNoiseSuppression: true,
  googHighpassFilter: true,
  googTypingNoiseDetection: true,
  googNoiseReduction: true,
  googExperimentalNoiseSuppression: true
};

export const VoiceProvider = ({ children }) => {
  const socketRef        = useRef(null);
  const peersRef         = useRef({});
  const localStreamRef   = useRef(null);
  const processedStreamRef = useRef(null);
  const audioElementsRef = useRef({});
  const socketUserMapRef = useRef({});

  const myScreenStreamRef  = useRef(null);
  const [myScreenStream, setMyScreenStream] = useState(null);

  const myCameraStreamRef  = useRef(null);
  const [myCameraStream, setMyCameraStream] = useState(null);

  const audioContextRef    = useRef(null);
  const inputGainNodeRef   = useRef(null);
  const gateGainNodeRef    = useRef(null);
  const isSpeakingRef      = useRef(false);
  const gateLoopActiveRef  = useRef(false);

  const isPTTPressedRef    = useRef(false);
  const [isPTTPressed, setIsPTTPressed] = useState(false);

  const { user, token, isAuthenticated } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const audioSettings = useContext(AudioSettingsContext);

  const {
    inputDeviceId, outputDeviceId, isMicMuted, isDeafened,
    userVolumes, isNoiseSuppression, inputVolume = 100,
    inputMode   = 'VOICE_ACTIVITY',
    pttKeyCode  = 'Space'
  } = audioSettings || {};

  // Ref'lere yansıt — closure'ların stale değer okumasını önler
  const isNoiseSuppressionRef = useRef(isNoiseSuppression);
  const inputModeRef          = useRef(inputMode);
  const inputVolumeRef        = useRef(inputVolume);
  const outputDeviceIdRef     = useRef(outputDeviceId);
  const isDeafenedRef         = useRef(isDeafened);

  useEffect(() => { isNoiseSuppressionRef.current = isNoiseSuppression; }, [isNoiseSuppression]);
  useEffect(() => { inputModeRef.current = inputMode; },                 [inputMode]);
  useEffect(() => { inputVolumeRef.current = inputVolume; },             [inputVolume]);
  useEffect(() => { outputDeviceIdRef.current = outputDeviceId; },       [outputDeviceId]);
  useEffect(() => { isDeafenedRef.current = isDeafened; },               [isDeafened]);

  const [isConnected,            setIsConnected]            = useState(false);
  const [currentVoiceChannelId,  setCurrentVoiceChannelId]  = useState(null);
  const [currentServerId,        setCurrentServerId]        = useState(null);
  const [currentVoiceChannelName,setCurrentVoiceChannelName]= useState(null);
  const [currentServerName,      setCurrentServerName]      = useState(null);
  const [speakingUsers,          setSpeakingUsers]          = useState({});
  const [micError,               setMicError]               = useState(null);
  const [stayConnected,          setStayConnected]          = useState(false);
  const [peersWithVideo,         setPeersWithVideo]         = useState({});

  // ─────────────────────────────────────────────────────────────
  // MİKROFON AÇ / KAPA
  // ─────────────────────────────────────────────────────────────
  const setLocalMicEnabled = useCallback((enabled) => {
    const shouldSendAudio = !!enabled && !isMicMuted;

    const toggleTracks = (stream) => {
      if (stream) stream.getAudioTracks().forEach(t => { t.enabled = shouldSendAudio; });
    };
    toggleTracks(localStreamRef.current);
    toggleTracks(processedStreamRef.current);

    if (inputGainNodeRef.current && audioContextRef.current) {
      const ctx = audioContextRef.current;
      const vol = inputVolumeRef.current;
      const targetVol = shouldSendAudio
        ? (vol > 100 ? 1.0 + ((vol - 100) / 30) : vol / 100)
        : 0;
      try { inputGainNodeRef.current.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.05); } catch (_) {}
    }

    if (!shouldSendAudio) updateSpeakingStatus(false);
  }, [isMicMuted]);

  // ─────────────────────────────────────────────────────────────
  // AYARLAR DEĞİŞİNCE STREAM'İ CANLI GÜNCELLE
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentVoiceChannelId || !isConnected || !socketRef.current) return;

    let isCancelled  = false;
    let pendingStream = null;

    const refreshStream = async () => {
      try {
        // 1) Eski track'leri şimdi yakala — stop etme
        const oldRawStream       = localStreamRef.current;
        const oldProcessedStream = processedStreamRef.current;

        // Peer'larda hangi track'in değiştirileceğini bulmak için
        // RTCRtpSender'ları kullanacağız — replaceTrack(old, new, stream) yerine
        // doğrudan sender.replaceTrack(newTrack) daha güvenilir.

        // 2) Yeni constraints
        const newConstraints = buildAudioConstraints(isNoiseSuppression, inputDeviceId);

        // 3) Yeni ham stream
        const newRawStream = await navigator.mediaDevices.getUserMedia(newConstraints);
        pendingStream = newRawStream;
        if (isCancelled) { newRawStream.getTracks().forEach(t => t.stop()); return; }

        // 4) Eski AudioContext'i kapat
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        gateLoopActiveRef.current = false;

        // 5) Yeni processed stream üret
        const newProcessedStream = await processAudioStream(newRawStream);
        if (isCancelled) {
          newRawStream.getTracks().forEach(t => t.stop());
          return;
        }
        const newTrack = newProcessedStream?.getAudioTracks?.()?.[0];

        // 6) Refs güncelle
        localStreamRef.current    = newRawStream;
        processedStreamRef.current = newProcessedStream;

        // 7) Peer sender'larını güncelle (replaceTrack ile — bağlantı kopmaz)
        if (newTrack) {
          Object.values(peersRef.current).forEach(peer => {
            if (!peer || peer.destroyed) return;
            try {
              const senders = peer._pc?.getSenders?.() || [];
              const audioSender = senders.find(s => s.track?.kind === 'audio');
              if (audioSender) {
                audioSender.replaceTrack(newTrack).catch(err => {
                  console.warn('[refreshStream] replaceTrack başarısız:', err);
                });
              }
            } catch (e) {
              console.warn('[refreshStream] sender erişim hatası:', e);
            }
          });
        }

        // 8) Eski ham stream'i durdur
        if (oldRawStream) oldRawStream.getTracks().forEach(t => t.stop());

        // 9) Mute/PTT durumunu geri yükle
        if (inputModeRef.current === 'PUSH_TO_TALK') {
          setLocalMicEnabled(isPTTPressedRef.current);
        } else {
          setLocalMicEnabled(true);
        }

      } catch (error) {
        console.error('[refreshStream] Hata:', error);
        addToast('Ses ayarları güncellenemedi.', 'error');
      }
    };

    refreshStream();

    return () => {
      isCancelled = true;
      if (pendingStream) pendingStream.getTracks().forEach(t => t.stop());
    };
  }, [isNoiseSuppression, inputDeviceId, inputMode, currentVoiceChannelId]);

  // ─────────────────────────────────────────────────────────────
  // PTT / VOICE ACTIVITY MOD DEĞİŞİNCE MİKROFON DURUMU
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (inputMode === 'PUSH_TO_TALK') {
      setLocalMicEnabled(isPTTPressedRef.current);
    } else {
      setLocalMicEnabled(true);
    }
  }, [inputMode, isPTTPressed, isMicMuted, setLocalMicEnabled]);

  // ─────────────────────────────────────────────────────────────
  // INPUT VOLUME DEĞİŞİNCE GAIN GÜNCELLE
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!inputGainNodeRef.current || !audioContextRef.current) return;
    if (isMicMuted) return;
    if (inputMode === 'PUSH_TO_TALK' && !isPTTPressedRef.current) return;

    let gainValue;
    if (inputVolume === 0)        gainValue = 0;
    else if (inputVolume <= 100)  gainValue = inputVolume / 100;
    else                          gainValue = 1.0 + ((inputVolume - 100) / 30);

    try {
      inputGainNodeRef.current.gain.setTargetAtTime(
        gainValue,
        audioContextRef.current.currentTime,
        0.05
      );
    } catch (_) {}
  }, [inputVolume, isMicMuted, inputMode]);

  // ─────────────────────────────────────────────────────────────
  // SOCKET BAĞLANTISI
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }
    if (socketRef.current?.connected) return;

    const isElectron     = navigator.userAgent.toLowerCase().includes(' electron/');
    const isProductionUrl = window.location.hostname.includes('oceanlan.com');
    const backendUrl     = (isElectron || isProductionUrl) ? 'https://oceanlan.com' : 'http://localhost:4000';

    const newSocket = io(backendUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
      secure: true,
      reconnection: true,
      autoConnect: true,
    });
    socketRef.current = newSocket;

    newSocket.on('connect',    ()  => { setIsConnected(true); });
    newSocket.on('disconnect', ()  => setIsConnected(false));
    newSocket.on('user-joined-voice',    handleUserJoined);
    newSocket.on('webrtc-offer',         handleOffer);
    newSocket.on('webrtc-answer',        handleAnswer);
    newSocket.on('webrtc-ice-candidate', handleIce);
    newSocket.on('user-left-voice',      handleUserLeft);
    newSocket.on('voice-channel-moved',  handleChannelMoved);
    newSocket.on('user-speaking-change', ({ userId, isSpeaking }) =>
      setSpeakingUsers(prev => ({ ...prev, [userId]: isSpeaking }))
    );
    newSocket.on('screen-share-stopped', ({ socketId }) =>
      setPeersWithVideo(prev => { const c = { ...prev }; delete c[socketId]; return c; })
    );
    newSocket.on('voiceStateUpdate', (serverState) => {
      if (!serverState) return;
      Object.values(serverState).forEach(channelUsers => {
        channelUsers.forEach(u => { socketUserMapRef.current[u.socketId] = u.userId; });
      });
      applyVolumeSettings();
    });

    return () => { newSocket.disconnect(); };
  }, [token, isAuthenticated]);

  // ─────────────────────────────────────────────────────────────
  // ÇIKIŞ CİHAZI / SAĞIRLIK DEĞİŞİNCE AUDIO ELEMENTLERINI GÜNCELLE
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Object.values(audioElementsRef.current).forEach(audio => {
      if (!audio) return;
      audio.muted = isDeafened;
      // outputDeviceId boş/default olsa bile her zaman setSinkId çağır.
      // Böylece sistem varsayılanı değişse (ör. monitör → kulaklık) otomatik takip eder.
      if (typeof audio.setSinkId === 'function') {
        const sinkId = outputDeviceId || 'default';
        audio.setSinkId(sinkId).catch(() => {});
      }
    });
  }, [isDeafened, outputDeviceId, userVolumes]);

  // ─────────────────────────────────────────────────────────────
  // KULLANICI SES SEVİYELERİ
  // ─────────────────────────────────────────────────────────────
  const applyVolumeSettings = () => {
    Object.keys(audioElementsRef.current).forEach(socketId => {
      const el  = audioElementsRef.current[socketId];
      const uid = socketUserMapRef.current[socketId];
      if (uid && el && userVolumes[uid] !== undefined) {
        el.volume = userVolumes[uid] === 0 ? 0 : Math.min(userVolumes[uid] / 100, 1.0);
      }
    });
  };
  useEffect(() => { applyVolumeSettings(); }, [userVolumes]);

  // ─────────────────────────────────────────────────────────────
  // PTT LOGIC
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (inputMode !== 'PUSH_TO_TALK') {
      isPTTPressedRef.current = false;
      setIsPTTPressed(false);
      return;
    }

    const isMouseBinding    = (code) => typeof code === 'string' && code.startsWith('MOUSE_');
    const mouseButtonFromCode = (code) => {
      const n = parseInt(String(code).replace('MOUSE_', ''), 10);
      return Number.isFinite(n) ? n : null;
    };

    const pttDown = () => {
      if (isMicMuted || isPTTPressedRef.current) return;
      isPTTPressedRef.current = true;
      setIsPTTPressed(true);
      setLocalMicEnabled(true);
      updateSpeakingStatus(true);
    };
    const pttUp = () => {
      if (!isPTTPressedRef.current) return;
      isPTTPressedRef.current = false;
      setIsPTTPressed(false);
      setLocalMicEnabled(false);
      updateSpeakingStatus(false);
    };

    const onKeyDown          = (e) => { if (!e.repeat && e.code === pttKeyCode) pttDown(); };
    const onKeyUp            = (e) => { if (e.code === pttKeyCode) pttUp(); };
    const onMouseDown        = (e) => { if (isMouseBinding(pttKeyCode) && mouseButtonFromCode(pttKeyCode) === e.button) pttDown(); };
    const onMouseUp          = (e) => { if (isMouseBinding(pttKeyCode) && mouseButtonFromCode(pttKeyCode) === e.button) pttUp(); };
    const onBlur             = ()  => pttUp();
    const onVisibilityChange = ()  => { if (document.hidden) pttUp(); };

    window.addEventListener('keydown',          onKeyDown,          true);
    window.addEventListener('keyup',            onKeyUp,            true);
    window.addEventListener('mousedown',        onMouseDown,        true);
    window.addEventListener('mouseup',          onMouseUp,          true);
    window.addEventListener('blur',             onBlur,             true);
    document.addEventListener('visibilitychange', onVisibilityChange, true);

    let offDown = null, offUp = null;
    if (window.electronAPI?.onPTTDown && window.electronAPI?.onPTTUp) {
      offDown = window.electronAPI.onPTTDown(pttDown);
      offUp   = window.electronAPI.onPTTUp(pttUp);
    }

    setLocalMicEnabled(false);

    return () => {
      window.removeEventListener('keydown',          onKeyDown,          true);
      window.removeEventListener('keyup',            onKeyUp,            true);
      window.removeEventListener('mousedown',        onMouseDown,        true);
      window.removeEventListener('mouseup',          onMouseUp,          true);
      window.removeEventListener('blur',             onBlur,             true);
      document.removeEventListener('visibilitychange', onVisibilityChange, true);
      offDown?.();
      offUp?.();
    };
  }, [inputMode, pttKeyCode, isMicMuted, setLocalMicEnabled]);

  // ─────────────────────────────────────────────────────────────
  // YARDIMCI: constraints oluştur
  // ─────────────────────────────────────────────────────────────
  const buildAudioConstraints = (noiseSupp, devId) => {
    if (noiseSupp) {
      return {
        audio: {
          ...AGGRESSIVE_AUDIO_CONSTRAINTS,
          deviceId: devId ? { exact: devId } : undefined,
        },
        video: false,
      };
    }
    return {
      audio: {
        deviceId:          devId ? { exact: devId } : undefined,
        echoCancellation:  true,
        autoGainControl:   true,
        noiseSuppression:  false,
      },
      video: false,
    };
  };

  // ─────────────────────────────────────────────────────────────
  // KAMERA
  // ─────────────────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      if (myScreenStreamRef.current) stopScreenShare();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId:         inputDeviceId ? { exact: inputDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl:  true,
          channelCount:     1,
          sampleRate:       48000,
        },
        video: false,
      });

      setMyCameraStream(stream);
      myCameraStreamRef.current = stream;

      Object.values(peersRef.current).forEach(peer => {
        try { if (peer && !peer.destroyed) peer.addStream(stream); } catch (_) {}
      });

      const vTrack = stream.getVideoTracks?.()?.[0];
      if (vTrack) vTrack.onended = () => stopCamera();
    } catch (err) {
      console.error('[Camera] Başlatılamadı:', err);
      addToast('Kamera başlatılamadı', 'error');
    }
  };

  const stopCamera = () => {
    socketRef.current?.emit('screen-share-stopped', {
      serverId:  currentServerId,
      channelId: currentVoiceChannelId,
      socketId:  socketRef.current?.id,
      userId:    user?._id,
    });

    const stream = myCameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      Object.values(peersRef.current).forEach(p => { try { p.removeStream(stream); } catch (_) {} });
      setMyCameraStream(null);
      myCameraStreamRef.current = null;
    }
  };

  // ─────────────────────────────────────────────────────────────
  // EKRAN PAYLAŞIMI
  // ─────────────────────────────────────────────────────────────
  const startScreenShare = async (electronSourceId = null) => {
    try {
      if (myCameraStreamRef.current) stopCamera();

      let stream;
      if (window.electronAPI && electronSourceId) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource:   'desktop',
              chromeMediaSourceId: electronSourceId,
              minWidth: 1280, maxWidth: 1920,
              minHeight: 720, maxHeight: 1080,
              maxFrameRate: 30,
            },
          },
        });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 30, max: 30 },
            width:     { ideal: 1920 },
            height:    { ideal: 1080 },
          },
          audio: true,
          selfBrowserSurface: 'exclude',
        });
      }

      setMyScreenStream(stream);
      myScreenStreamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];

      Object.values(peersRef.current).forEach(peer => {
        if (!peer || peer.destroyed) return;
        try {
          const senders      = peer._pc?.getSenders?.() || [];
          const videoSender  = senders.find(s => s.track?.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(videoTrack).catch(() => peer.addStream(stream));
          } else {
            peer.addStream(stream);
          }
        } catch (err) {
          console.warn('[ScreenShare] Track eklenemedi:', err);
        }
      });

      videoTrack.onended = () => stopScreenShare();
      videoTrack.onmute  = () => {
        setTimeout(() => { if (videoTrack.readyState === 'ended') stopScreenShare(); }, 3000);
      };
    } catch (err) {
      console.error('[ScreenShare] Hata:', err);
      addToast('Ekran paylaşımı başlatılamadı', 'error');
    }
  };

  const stopScreenShare = () => {
    socketRef.current?.emit('screen-share-stopped', {
      serverId:  currentServerId,
      channelId: currentVoiceChannelId,
      socketId:  socketRef.current?.id,
      userId:    user?._id,
    });

    const stream = myScreenStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      Object.values(peersRef.current).forEach(peer => {
        if (!peer || peer.destroyed) return;
        try {
          const senders     = peer._pc?.getSenders?.() || [];
          const videoSender = senders.find(s => s.track?.kind === 'video');
          if (videoSender) videoSender.replaceTrack(null).catch(() => {});
        } catch (_) {}
      });
      setMyScreenStream(null);
      myScreenStreamRef.current = null;
    }
  };

  // ─────────────────────────────────────────────────────────────
  // WebRTC PEER YÖNETİMİ
  // ─────────────────────────────────────────────────────────────
  const handleUserJoined = ({ socketId, userId }) => {
    if (socketId && userId) socketUserMapRef.current[socketId] = userId;

    const audioStream = processedStreamRef.current || localStreamRef.current;
    if (!audioStream) {
      console.warn('[WebRTC] Stream henüz hazır değil, peer kurulamadı');
      return;
    }

    const videoStream = myScreenStreamRef.current || myCameraStreamRef.current;
    const streams     = [audioStream, videoStream].filter(Boolean);
    createPeer(socketId, true, streams, userId);
  };

  // ─────────────────────────────────────────────────────────────
  // GELİŞMİŞ GÜRÜLTÜ ENGELLEME İŞLEMCİSİ
  // ─────────────────────────────────────────────────────────────
 const processAudioStream = async (rawStream) => {
  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtxClass({ sampleRate: 48000 });
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const source = audioCtx.createMediaStreamSource(rawStream);
    const destination = audioCtx.createMediaStreamDestination();

    await audioCtx.audioWorklet.addModule('/processors/rnnoise-processor.js');
    const rnnoiseNode = new AudioWorkletNode(audioCtx, 'rnnoise-processor');

    // 1. FİLTRELERİ BİRAZ GEVŞETELİM (Sesinin yutulmaması için)
    const lowFreqCut = audioCtx.createBiquadFilter();
    lowFreqCut.type = 'highpass';
    lowFreqCut.frequency.value = 120; // 180'den 120'ye çektik, sesin daha dolgun gelir

    const highFreqCut = audioCtx.createBiquadFilter();
    highFreqCut.type = 'lowpass';
    highFreqCut.frequency.value = 7500; // 6500'den 7500'e çıkardık, sesin boğulmaz

    // 2. ÖN KAZANÇ (Sesini gürültüden ayırmak için kritik)
    const preGain = audioCtx.createGain();
    preGain.gain.value = 1.4; // Sesini %40 artırarak RNNoise'a gönderiyoruz

    // 3. YUMUŞAK COMPRESSOR
    const limiter = audioCtx.createDynamicsCompressor();
    limiter.threshold.value = -20; 
    limiter.knee.value = 15; // Soft-knee: Sesin yutulmasını önler, doğal geçiş sağlar
    limiter.ratio.value = 12; 
    limiter.attack.value = 0.005;
    limiter.release.value = 0.1;

    const outputGate = audioCtx.createGain();
    outputGate.gain.value = 1.0;
    gateGainNodeRef.current = outputGate;

    if (isNoiseSuppressionRef.current) {
      // Zincir: Kaynak -> lowCut -> highCut -> preGain -> limiter -> RNNoise -> Gate -> Dest
      source.connect(lowFreqCut);
      lowFreqCut.connect(highFreqCut);
      highFreqCut.connect(preGain);
      preGain.connect(limiter);
      limiter.connect(rnnoiseNode);
      rnnoiseNode.connect(outputGate);
      outputGate.connect(destination);
      
      const analyser = audioCtx.createAnalyser();
      rnnoiseNode.connect(analyser);
      
      rnnoiseNode.port.postMessage({ type: 'init' });
      startGateAnalysis(analyser, outputGate, audioCtx); 
    } else {
      source.connect(destination);
      const rawAnalyser = audioCtx.createAnalyser();
      source.connect(rawAnalyser);
      startGateAnalysis(rawAnalyser, null, audioCtx);
    }

    audioContextRef.current = audioCtx;
    return destination.stream;
  } catch (e) {
    console.error('RNNoise Başlatılamadı:', e);
    return rawStream;
  }
};

  // ─────────────────────────────────────────────────────────────
  // GATE ANALİZ DÖNGÜSÜ
  // ─────────────────────────────────────────────────────────────
 
  // ─────────────────────────────────────────────────────────────
  // GATE ANALİZ DÖNGÜSÜ (RNNoise Uyumlu ve Hataları Giderilmiş)
  // ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────
  // GATE ANALİZ DÖNGÜSÜ (Arka Plan Fix & Parantez Hatası Giderildi)
  // ─────────────────────────────────────────────────────────────
  const startGateAnalysis = (analyser, gateGainNode, audioCtx, rawStreamForSimpleMode = null) => {
    // Önceki döngüyü tamamen durdur
    gateLoopActiveRef.current = false;

    // Bir sonraki tick'te yeni döngü başlasın
    setTimeout(() => {
      gateLoopActiveRef.current = true;

      // --- 1. DURUM: Analyser ve Context Mevcutsa (Normal/RNNoise Modu) ---
      if (analyser && audioCtx) {
        analyser.fftSize = 512;
        const timeData = new Float32Array(analyser.fftSize);
        let gateIsOpen = false;

        const checkVolume = () => {
          if (!gateLoopActiveRef.current || audioCtx.state === 'closed') return;

          // 🔧 ARKA PLAN FIX: Sekme arka planda kısıtlansa bile Context'i uyanık tut
          if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }

          analyser.getFloatTimeDomainData(timeData);
          let sumSq = 0;
          for (let i = 0; i < timeData.length; i++) sumSq += timeData[i] * timeData[i];
          const rms = Math.sqrt(sumSq / timeData.length);

          // Histerizis (Çift Eşik) Ayarı
          const openThreshold = 0.020; 
          const closeThreshold = 0.010;

          if (rms > openThreshold) {
            gateIsOpen = true;
          } else if (rms < closeThreshold) {
            gateIsOpen = false;
          }

          const finalStatus = inputModeRef.current === 'PUSH_TO_TALK' ? isPTTPressedRef.current : gateIsOpen;

          if (gateGainNode) {
            const targetGain = finalStatus ? 1.0 : 0.0;
            const rampTime = finalStatus ? 0.04 : 0.20; 
            gateGainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, rampTime);
          }

          updateSpeakingStatus(finalStatus);

          // Arka plan kısıtlamasından kurtulmak için döngüyü devam ettir
          if (gateLoopActiveRef.current) {
            setTimeout(checkVolume, 40); 
          }
        };

        checkVolume();
        return; 
      }

      // --- 2. DURUM: Basit Mod (Hata durumları veya yedek analiz) ---
      if (rawStreamForSimpleMode) {
        try {
          const simpleCtx = new (window.AudioContext || window.webkitAudioContext)();
          const simpleAnalyser = simpleCtx.createAnalyser();
          const simpleSrc = simpleCtx.createMediaStreamSource(rawStreamForSimpleMode);
          simpleSrc.connect(simpleAnalyser);

          const checkLoop = () => {
            if (!gateLoopActiveRef.current) { 
              simpleCtx.close().catch(() => {}); 
              return; 
            }
            
            const arr = new Uint8Array(simpleAnalyser.frequencyBinCount);
            simpleAnalyser.getByteFrequencyData(arr);
            let sum = 0;
            for (let i = 0; i < arr.length; i++) sum += arr[i];
            
            updateSpeakingStatus((sum / arr.length) > 10);
            
            if (gateLoopActiveRef.current) {
              setTimeout(checkLoop, 50);
            }
          };

          checkLoop();
        } catch (err) {
          console.error("Basit ses analizi başlatılamadı:", err);
        }
      }
    }, 100);
  };

  // ─────────────────────────────────────────────────────────────
  // 🔧 ARKA PLAN FIX: Sekme geri gelince AudioContext'i resume et
  // Chrome, arka planda AudioContext'i suspend edebilir.
  // visibilitychange dinleyerek her sekme geçişinde context'i uyandırıyoruz.
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      const ctx = audioContextRef.current;
      if (!ctx || ctx.state === 'closed') return;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // ─────────────────────────────────────────────────────────────
  // KONUŞMA DURUMU
  // ─────────────────────────────────────────────────────────────
  const updateSpeakingStatus = (isSpeaking) => {
    if (isSpeakingRef.current === isSpeaking) return;
    isSpeakingRef.current = isSpeaking;
    if (currentServerId && user) {
      const event = isSpeaking ? 'speaking-start' : 'speaking-stop';
      socketRef.current?.emit(event, { serverId: currentServerId, userId: user.id });
    }
    if (user) setSpeakingUsers(prev => ({ ...prev, [user.id]: isSpeaking }));
  };

  // ─────────────────────────────────────────────────────────────
  // KANAL YÖNETİMİ
  // ─────────────────────────────────────────────────────────────
  const handleChannelMoved = ({ newChannelId, serverId, channelName }) => {
    cleanupMediaOnly();
    setCurrentVoiceChannelId(newChannelId);
    setCurrentServerId(serverId);
    if (channelName) setCurrentVoiceChannelName(channelName);
    joinVoiceChannel(serverId, newChannelId);
  };

  const joinVoiceChannel = async (server, channel, force = false) => {
    const sId = server?._id || server;
    const cId = channel?._id || channel;

    if (!force && currentVoiceChannelId === cId) return;
    if (currentVoiceChannelId) {
      cleanupMediaOnly();
      socketRef.current?.emit('leave-voice-channel');
    }

    setCurrentVoiceChannelId(cId);
    setCurrentServerId(sId);
    setStayConnected(true);
    if (server?.name)  setCurrentServerName(server.name);
    if (channel?.name) setCurrentVoiceChannelName(channel.name);

    try {
      const constraints = buildAudioConstraints(isNoiseSuppression, inputDeviceId);
      let rawStream;
      try {
        rawStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (_) {
        rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }

      localStreamRef.current = rawStream;
      const streamToSend = await processAudioStream(rawStream);
      processedStreamRef.current = streamToSend;

      if (inputMode === 'PUSH_TO_TALK') setLocalMicEnabled(isPTTPressedRef.current);
      else                               setLocalMicEnabled(true);

      // Stream hazır olduktan SONRA join emit edilir — race condition önlenir
      socketRef.current.emit('join-voice-channel', {
        serverId:  sId,
        channelId: cId,
        userId:    user?._id || user?.id,
        username:  user?.username,
      });
    } catch (err) {
      console.error('[joinVoiceChannel] Hata:', err);
      setMicError('Mikrofon hatası');
      addToast('Mikrofon hatası', 'error');
    }
  };

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
    Object.keys(peersRef.current).forEach(id => {
      peersRef.current[id]?.destroy();
      audioElementsRef.current[id]?.remove();
    });
    peersRef.current       = {};
    audioElementsRef.current = {};
    socketUserMapRef.current = {};
    setPeersWithVideo({});
    setSpeakingUsers({});
    isSpeakingRef.current  = false;
    gateLoopActiveRef.current = false;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    processedStreamRef.current = null;

    if (myScreenStreamRef.current) {
      myScreenStreamRef.current.getTracks().forEach(t => t.stop());
      myScreenStreamRef.current = null;
      setMyScreenStream(null);
    }
    if (myCameraStreamRef.current) {
      myCameraStreamRef.current.getTracks().forEach(t => t.stop());
      myCameraStreamRef.current = null;
      setMyCameraStream(null);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  const rejoinChannel = () => {};

  // ─────────────────────────────────────────────────────────────
  // PEER OLUŞTURMA
  // ─────────────────────────────────────────────────────────────
  const createPeer = (targetSocketId, initiator, streams = [], userId = null) => {
    const p = new Peer({ initiator, trickle: true, streams, config: rtcConfig });

    p.on('signal', data => {
      if (data.type === 'offer' || data.type === 'answer') {
        const eventName = data.type === 'offer' ? 'webrtc-offer' : 'webrtc-answer';
        socketRef.current?.emit(eventName, { targetSocketId, sdp: data, userId: user?.id });
      } else if (data.candidate) {
        socketRef.current?.emit('webrtc-ice-candidate', {
          targetSocketId,
          candidate: data.candidate,
          userId: user?.id,
        });
      }
    });

    p.on('stream', stream => {
      if (stream.getAudioTracks().length === 0 && stream.getVideoTracks().length === 0) {
        console.warn('[WebRTC] Boş stream algılandı');
        return;
      }
      handleRemoteStream(stream, targetSocketId, userId);
    });

    p.on('error', err => {
      console.error('[WebRTC Hatası]:', err);
      if (err.code === 'ERR_ICE_CONNECTION_FAILURE' || err.code === 'ERR_DATA_CHANNEL') {
        const uid         = socketUserMapRef.current[targetSocketId];
        peersRef.current[targetSocketId]?.destroy();
        delete peersRef.current[targetSocketId];
        const audioStream = processedStreamRef.current || localStreamRef.current;
        const videoStream = myScreenStreamRef.current  || myCameraStreamRef.current;
        const newStreams   = [audioStream, videoStream].filter(Boolean);
        createPeer(targetSocketId, true, newStreams, uid);
      }
    });

    peersRef.current[targetSocketId] = p;
    return p;
  };

  const handleOffer = ({ socketId, sdp, userId }) => {
    if (userId) socketUserMapRef.current[socketId] = userId;
    peersRef.current[socketId]?.destroy();

    const audioStream = processedStreamRef.current || localStreamRef.current;
    const videoStream = myScreenStreamRef.current  || myCameraStreamRef.current;
    const streams     = [audioStream, videoStream].filter(Boolean);
    const p           = createPeer(socketId, false, streams, userId);
    p.signal(sdp);
  };

  const handleAnswer = ({ socketId, sdp }) =>
    peersRef.current[socketId]?.signal(sdp);

  const handleIce = ({ socketId, candidate }) => {
    if (peersRef.current[socketId]) {
      peersRef.current[socketId].signal({ candidate });
    }
  };

  const handleUserLeft = ({ socketId }) => {
    peersRef.current[socketId]?.destroy();
    delete peersRef.current[socketId];
    audioElementsRef.current[socketId]?.remove();
    delete audioElementsRef.current[socketId];
    delete socketUserMapRef.current[socketId];
    setPeersWithVideo(prev => { const n = { ...prev }; delete n[socketId]; return n; });
  };

  // ─────────────────────────────────────────────────────────────
  // UZAK STREAM İŞLEME
  // ─────────────────────────────────────────────────────────────
  const handleRemoteStream = (stream, socketId, userId) => {
    if (userId) socketUserMapRef.current[socketId] = userId;

    if (stream.getVideoTracks().length > 0) {
      setPeersWithVideo(prev => ({ ...prev, [socketId]: stream }));
      const vTrack     = stream.getVideoTracks()[0];
      const cleanupVid = () => setPeersWithVideo(prev => { const n = { ...prev }; delete n[socketId]; return n; });
      if (vTrack) {
        vTrack.onended = cleanupVid;
        vTrack.onmute  = () => {
          setTimeout(() => { if (vTrack.readyState === 'ended') cleanupVid(); }, 3000);
        };
      }
      try { stream.addEventListener?.('inactive', cleanupVid); } catch (_) {}
      return;
    }

    // Ses elementi oluştur
    if (audioElementsRef.current[socketId]) audioElementsRef.current[socketId].remove();

    const audio       = document.createElement('audio');
    audio.srcObject   = stream;
    audio.autoplay    = true;
    audio.style.display = 'none';
    audio.muted       = isDeafenedRef.current;
    document.body.appendChild(audio);

    // outputDeviceId her zaman set edilir — boşsa 'default' kullan.
    // Bu, monitörden gelen ses sorununu önler: tarayıcı hangi cihazı
    // "default" saydığına bakmaksızın istediğimiz çıkışı zorunlu kılarız.
    if (typeof audio.setSinkId === 'function') {
      const sinkId = outputDeviceIdRef.current || 'default';
      audio.setSinkId(sinkId).catch(() => {});
    }

    audioElementsRef.current[socketId] = audio;
    applyVolumeSettings();
  };

  // ─────────────────────────────────────────────────────────────
  // PROVIDER
  // ─────────────────────────────────────────────────────────────
  return (
    <VoiceContext.Provider value={{
      socket:                socketRef.current,
      isConnected,
      currentVoiceChannelId,
      currentServerId,
      currentVoiceChannelName,
      currentServerName,
      joinVoiceChannel,
      reconnectVoiceChannel,
      leaveVoiceChannel,
      speakingUsers,
      micError,
      stayConnected,
      peersWithVideo,
      myScreenStream,
      startScreenShare,
      stopScreenShare,
      myCameraStream,
      startCamera,
      stopCamera,
      isPTTPressed,
      userIdBySocketId: socketUserMapRef.current,
    }}>
      {children}
    </VoiceContext.Provider>
  );
};