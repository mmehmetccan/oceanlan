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
  ],
  iceTransportPolicy: 'all',
};

// ============================================================
// 🎛️ OPTİMİZE NOISE GATE PARAMETRELERİ
// ------------------------------------------------------------
// GATE_OPEN_RMS   : 0.025 - Klavye seslerini geçirmeyecek kadar yüksek,
//                   konuşmayı kesecek kadar değil
// GATE_CLOSE_RMS  : 0.010 - Hızlı kapanma için optimize
// GATE_FLOOR      : 0.0001 - Arka planı tamamen kes
// GATE_HOLD_MS    : 300 - Cümle araları için yeterli, gecikmeye sebep olmayacak kadar kısa
// EXPANDER_POWER  : 2.0 - Daha doğal ses geçişi
// RMS_SMOOTHING   : 0.85 - Hızlı tepki için optimize
// ============================================================
const GATE_OPEN_RMS   = 0.025;
const GATE_CLOSE_RMS  = 0.010;
const GATE_FLOOR      = 0.0001;
const GATE_HOLD_MS    = 300;
const EXPANDER_POWER  = 2.0;
const RMS_SMOOTHING   = 0.85;

// ============================================================
// 🎛️ AGRESİF FİLTRELEME PARAMETRELERİ
// ------------------------------------------------------------
// LOW_CUT_FREQ    : 180 Hz - Mutfak gürültüsü ve klavye bas seslerini kes
// HIGH_CUT_FREQ   : 8000 Hz - Tiz klavye seslerini kes
// LOW_CUT_Q       : 0.9 - Daha dik kesiş
// ============================================================
const LOW_CUT_FREQ  = 180;
const HIGH_CUT_FREQ = 8000;
const LOW_CUT_Q     = 0.9;

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
  const workletNodeRef     = useRef(null);
  const scriptNodeRef      = useRef(null);

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

  // Ref'lere yansıt
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
  // ARKA PLAN OPTİMİZASYONU - Web Audio API'yi canlı tut
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    // Worklet'i sürekli aktif tutmak için düşük frekanslı bir oscillator
    let keepAliveTimer = null;
    let silentOsc = null;
    let keepAliveGain = null;
    
    const startKeepAlive = () => {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;
      
      try {
        // Sessiz bir sinyal oluştur - Web Audio API'yi uyutmaz
        if (!silentOsc) {
          silentOsc = audioContextRef.current.createOscillator();
          keepAliveGain = audioContextRef.current.createGain();
          keepAliveGain.gain.value = 0.000001; // Duyulamayacak kadar düşük
          silentOsc.connect(keepAliveGain);
          keepAliveGain.connect(audioContextRef.current.destination);
          silentOsc.frequency.value = 20; // Duyulamaz frekans
          silentOsc.start();
        }
      } catch (e) {
        // Sessizce devam et
      }
    };

    const stopKeepAlive = () => {
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      if (silentOsc) {
        try {
          silentOsc.stop();
          silentOsc.disconnect();
        } catch (e) {}
        silentOsc = null;
      }
      if (keepAliveGain) {
        try {
          keepAliveGain.disconnect();
        } catch (e) {}
        keepAliveGain = null;
      }
    };

    const handleVisibilityChange = () => {
      const ctx = audioContextRef.current;
      if (!ctx || ctx.state === 'closed') return;
      
      if (document.hidden) {
        // Arka plana geçince keep-alive başlat
        startKeepAlive();
        // Context'i hemen resume et
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        // Periyodik olarak kontrol et
        keepAliveTimer = setInterval(() => {
          if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume().catch(() => {});
          }
          startKeepAlive();
        }, 1000);
      } else {
        // Ön plana dönünce keep-alive'i durdur
        stopKeepAlive();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
      }
    };

    // Sayfa görünürlüğü değişince
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Sayfa yüklenince hemen kontrol et
    if (!document.hidden && audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopKeepAlive();
    };
  }, []);

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
      try { 
        // Anında tepki için setTargetAtTime yerine linear ramp
        inputGainNodeRef.current.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.005); 
      } catch (_) {}
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
        const oldRawStream       = localStreamRef.current;
        const oldProcessedStream = processedStreamRef.current;

        const newConstraints = buildAudioConstraints(isNoiseSuppression, inputDeviceId);
        const newRawStream = await navigator.mediaDevices.getUserMedia(newConstraints);
        pendingStream = newRawStream;
        if (isCancelled) { newRawStream.getTracks().forEach(t => t.stop()); return; }

        // Eski AudioContext'i temizle
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        gateLoopActiveRef.current = false;

        const newProcessedStream = await processAudioStream(newRawStream);
        if (isCancelled) {
          newRawStream.getTracks().forEach(t => t.stop());
          return;
        }
        const newTrack = newProcessedStream?.getAudioTracks?.()?.[0];

        localStreamRef.current    = newRawStream;
        processedStreamRef.current = newProcessedStream;

        // Peer sender'larını güncelle
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

        if (oldRawStream) oldRawStream.getTracks().forEach(t => t.stop());

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
      inputGainNodeRef.current.gain.linearRampToValueAtTime(
        gainValue,
        audioContextRef.current.currentTime + 0.005
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
  // OPTİMİZE SES İŞLEME - KLASÖR VE MUTFAK SESLERİNİ KES
  // ─────────────────────────────────────────────────────────────
  const processAudioStream = async (rawStream) => {
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtxClass({ 
        sampleRate: 48000,
        latencyHint: 'interactive' // Düşük gecikme için
      });
      
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const source = audioCtx.createMediaStreamSource(rawStream);
      const destination = audioCtx.createMediaStreamDestination();

      // 1. AGRESİF LİMİTER - Klavye "patlamalarını" anında ezer
      const limiter = audioCtx.createDynamicsCompressor();
      limiter.threshold.value = -30;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.0005; // 0.5ms - Anında tepki
      limiter.release.value = 0.03;   // 30ms - Hızlı toparlanma

      // 2. KLASÖR FREKANS ÇENTİK FİLTRESİ - 4-6kHz arası klavye sesleri
      const keyboardNotch1 = audioCtx.createBiquadFilter();
      keyboardNotch1.type = 'notch';
      keyboardNotch1.frequency.value = 4500;
      keyboardNotch1.Q.value = 2.0;

      const keyboardNotch2 = audioCtx.createBiquadFilter();
      keyboardNotch2.type = 'notch';
      keyboardNotch2.frequency.value = 5500;
      keyboardNotch2.Q.value = 2.0;

      // 3. YÜKSEK GEÇİRGEN FİLTRE - Mutfak gürültüsü ve bas sesler
      const highpassFilter = audioCtx.createBiquadFilter();
      highpassFilter.type = 'highpass';
      highpassFilter.frequency.value = LOW_CUT_FREQ;
      highpassFilter.Q.value = LOW_CUT_Q;

      // 4. ALÇAK GEÇİRGEN FİLTRE - Tiz klavye sesleri
      const lowpassFilter = audioCtx.createBiquadFilter();
      lowpassFilter.type = 'lowpass';
      lowpassFilter.frequency.value = HIGH_CUT_FREQ;
      lowpassFilter.Q.value = 0.7;

      // 5. PRE-GAIN - Ses yutulmasını önle
      const preGain = audioCtx.createGain();
      preGain.gain.value = 1.3;

      // 6. NOISE GATE - Arka planı tamamen kes
      const gateGain = audioCtx.createGain();
      gateGain.gain.value = 0;
      gateGainNodeRef.current = gateGain;

      // 7. INPUT VOLUME KONTROLÜ
      const inputGain = audioCtx.createGain();
      const initialGain = inputVolumeRef.current / 100;
      inputGain.gain.value = initialGain;
      inputGainNodeRef.current = inputGain;

      if (isNoiseSuppressionRef.current) {
        // RNNoise Worklet'i yükle
        try {
          await audioCtx.audioWorklet.addModule('/processors/rnnoise-processor.js');
          const rnnoiseNode = new AudioWorkletNode(audioCtx, 'rnnoise-processor');
          workletNodeRef.current = rnnoiseNode;
          
          // ZİNCİR: source -> limiter -> notch1 -> notch2 -> highpass -> lowpass -> preGain -> rnnoise -> inputGain -> gate -> dest
          source.connect(limiter);
          limiter.connect(keyboardNotch1);
          keyboardNotch1.connect(keyboardNotch2);
          keyboardNotch2.connect(highpassFilter);
          highpassFilter.connect(lowpassFilter);
          lowpassFilter.connect(preGain);
          preGain.connect(rnnoiseNode);
          rnnoiseNode.connect(inputGain);
          inputGain.connect(gateGain);
          gateGain.connect(destination);
          
          const analyser = audioCtx.createAnalyser();
          rnnoiseNode.connect(analyser);
          
          rnnoiseNode.port.postMessage({ type: 'init' });
          startOptimizedGateAnalysis(analyser, gateGain, audioCtx);
        } catch (rnnoiseError) {
          console.warn('RNNoise yüklenemedi, fallback filtreler kullanılıyor:', rnnoiseError);
          // Fallback zinciri
          source.connect(limiter);
          limiter.connect(keyboardNotch1);
          keyboardNotch1.connect(keyboardNotch2);
          keyboardNotch2.connect(highpassFilter);
          highpassFilter.connect(lowpassFilter);
          lowpassFilter.connect(preGain);
          preGain.connect(inputGain);
          inputGain.connect(gateGain);
          gateGain.connect(destination);
          
          const analyser = audioCtx.createAnalyser();
          preGain.connect(analyser);
          startOptimizedGateAnalysis(analyser, gateGain, audioCtx);
        }
      } else {
        // Noise suppression kapalıyken basit zincir
        source.connect(highpassFilter);
        highpassFilter.connect(inputGain);
        inputGain.connect(destination);
      }

      audioContextRef.current = audioCtx;
      return destination.stream;
    } catch (e) {
      console.error('Ses işleme başlatılamadı:', e);
      return rawStream;
    }
  };

  // ─────────────────────────────────────────────────────────────
  // OPTİMİZE GATE ANALİZİ - 0.5 SANİYE GECİKME YOK
  // ─────────────────────────────────────────────────────────────
  const startOptimizedGateAnalysis = (analyser, gateGainNode, audioCtx) => {
    gateLoopActiveRef.current = false;

    // Önceki script node'u temizle
    if (scriptNodeRef.current) {
      try {
        scriptNodeRef.current.disconnect();
      } catch (e) {}
      scriptNodeRef.current = null;
    }

    // Hemen başlat
    gateLoopActiveRef.current = true;
    
    if (!analyser || !audioCtx) return;

    // Daha küçük buffer = daha hızlı tepki (256 samples ≈ 5.3ms @ 48kHz)
    const scriptNode = audioCtx.createScriptProcessor(256, 1, 1);
    scriptNodeRef.current = scriptNode;
    
    analyser.fftSize = 256;
    const timeData = new Float32Array(analyser.fftSize);
    
    let gateIsOpen = false;
    let lastOpenTime = 0;
    let smoothRms = 0;

    scriptNode.onaudioprocess = () => {
      if (!gateLoopActiveRef.current || audioCtx.state === 'closed') {
        scriptNode.disconnect();
        return;
      }

      // Context'i aktif tut
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      analyser.getFloatTimeDomainData(timeData);
      
      // Hızlı RMS hesaplama
      let sumSq = 0;
      for (let i = 0; i < timeData.length; i++) {
        sumSq += timeData[i] * timeData[i];
      }
      const instantRms = Math.sqrt(sumSq / timeData.length);
      
      // Yumuşatılmış RMS
      smoothRms = smoothRms * RMS_SMOOTHING + instantRms * (1 - RMS_SMOOTHING);

      const now = audioCtx.currentTime;
      
      // Hızlı gate kararı
      if (smoothRms > GATE_OPEN_RMS) {
        gateIsOpen = true;
        lastOpenTime = now;
      } else if (smoothRms < GATE_CLOSE_RMS && (now - lastOpenTime) > (GATE_HOLD_MS / 1000)) {
        gateIsOpen = false;
      }

      const finalStatus = inputModeRef.current === 'PUSH_TO_TALK' ? 
        isPTTPressedRef.current : gateIsOpen;

      if (gateGainNode) {
        // Anında açılma (0.002 saniye), yumuşak kapanma (0.05 saniye)
        const targetGain = finalStatus ? 1.0 : GATE_FLOOR;
        const rampTime = finalStatus ? 0.002 : 0.05;
        
        // setTargetAtTime yerine linearRampToValueAtTime kullan - daha hızlı
        gateGainNode.gain.linearRampToValueAtTime(targetGain, now + rampTime);
      }

      updateSpeakingStatus(finalStatus);
    };

    // Zinciri bağla
    analyser.connect(scriptNode);
    scriptNode.connect(audioCtx.destination);
  };

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

    // Script node'u temizle
    if (scriptNodeRef.current) {
      try {
        scriptNodeRef.current.disconnect();
      } catch (e) {}
      scriptNodeRef.current = null;
    }

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

    if (audioElementsRef.current[socketId]) audioElementsRef.current[socketId].remove();

    const audio       = document.createElement('audio');
    audio.srcObject   = stream;
    audio.autoplay    = true;
    audio.style.display = 'none';
    audio.muted       = isDeafenedRef.current;
    document.body.appendChild(audio);

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