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
// 🎛️ DENGELİ GATE PARAMETRELERİ
// ------------------------------------------------------------
// GATE_OPEN_RMS   : 0.022 - Normal konuşma seviyesinde açılır,
//                   klavye ve uzak konuşmaların altında kalır.
// GATE_CLOSE_RMS  : 0.009 - Konuşma bitince yumuşak kapanır.
// GATE_HOLD_MS    : 400   - Cümle aralarında kesinti olmaz.
// ============================================================
const GATE_OPEN_RMS   = 0.022;
const GATE_CLOSE_RMS  = 0.009;
const GATE_HOLD_MS    = 400;
const RMS_SMOOTHING   = 0.85;

// ============================================================
// 🎛️ NAZİK FİLTRE PARAMETRELERİ
// ------------------------------------------------------------
// HIGH_PASS_FREQ   : 140 Hz - Mutfak gürültüsü, buzdolabı uğultusu.
// NOTCH_FREQ       : 5000 Hz - Mekanik klavye tıkırtılarının tepe noktası.
// NOTCH_GAIN       : -12 dB - Sadece bastırır, yok etmez (doğallık için).
// ============================================================
const HIGH_PASS_FREQ = 140;
const NOTCH_FREQ     = 5000;
const NOTCH_GAIN_DB  = -12;

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

  const isNoiseSuppressionRef = useRef(isNoiseSuppression);
  const inputModeRef          = useRef(inputMode);
  const inputVolumeRef        = useRef(inputVolume);
  const outputDeviceIdRef     = useRef(outputDeviceId);
  const isDeafenedRef         = useRef(isDeafened);

  useEffect(() => { isNoiseSuppressionRef.current = isNoiseSuppression; }, [isNoiseSuppression]);
  useEffect(() => { inputModeRef.current = inputMode; }, [inputMode]);
  useEffect(() => { inputVolumeRef.current = inputVolume; }, [inputVolume]);
  useEffect(() => { outputDeviceIdRef.current = outputDeviceId; }, [outputDeviceId]);
  useEffect(() => { isDeafenedRef.current = isDeafened; }, [isDeafened]);

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
  // ARKA PLAN OPTİMİZASYONU (Sekme küçülünce ses kesilmez)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let keepAliveTimer = null;
    let silentOsc = null;
    let keepAliveGain = null;
    
    const startKeepAlive = () => {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;
      try {
        if (!silentOsc) {
          silentOsc = audioContextRef.current.createOscillator();
          keepAliveGain = audioContextRef.current.createGain();
          keepAliveGain.gain.value = 0.000001;
          silentOsc.connect(keepAliveGain);
          keepAliveGain.connect(audioContextRef.current.destination);
          silentOsc.frequency.value = 20;
          silentOsc.start();
        }
      } catch (e) {}
    };

    const stopKeepAlive = () => {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (silentOsc) {
        try { silentOsc.stop(); silentOsc.disconnect(); } catch (e) {}
        silentOsc = null;
      }
      if (keepAliveGain) {
        try { keepAliveGain.disconnect(); } catch (e) {}
        keepAliveGain = null;
      }
    };

    const handleVisibilityChange = () => {
      const ctx = audioContextRef.current;
      if (!ctx || ctx.state === 'closed') return;
      
      if (document.hidden) {
        startKeepAlive();
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        keepAliveTimer = setInterval(() => {
          if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume().catch(() => {});
          }
        }, 1000);
      } else {
        stopKeepAlive();
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
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
        inputGainNodeRef.current.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.005); 
      } catch (_) {}
    }
    if (!shouldSendAudio) updateSpeakingStatus(false);
  }, [isMicMuted]);

  // ... (diğer useEffect'ler ve fonksiyonlar aynı kalabilir, sadece processAudioStream ve gate analizi değişecek)

  // ─────────────────────────────────────────────────────────────
  // 🎯 OPTİMİZE SES İŞLEME (RNNoise + Hafif Filtreler)
  // ─────────────────────────────────────────────────────────────
  const processAudioStream = async (rawStream) => {
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtxClass({ 
        sampleRate: 48000,
        latencyHint: 'interactive'
      });
      
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const source = audioCtx.createMediaStreamSource(rawStream);
      const destination = audioCtx.createMediaStreamDestination();

      // 1. Hafif Limiter (ani patlamaları törpüler)
      const limiter = audioCtx.createDynamicsCompressor();
      limiter.threshold.value = -20;
      limiter.knee.value = 5;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.05;

      // 2. Highpass Filtre (mutfak uğultusu, klima sesi)
      const highpass = audioCtx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = HIGH_PASS_FREQ;
      highpass.Q.value = 0.7;

      // 3. Klavye Notch Filtresi (5 kHz civarı)
      const notch = audioCtx.createBiquadFilter();
      notch.type = 'peaking';
      notch.frequency.value = NOTCH_FREQ;
      notch.Q.value = 2.0;
      notch.gain.value = NOTCH_GAIN_DB;

      // 4. Pre-Gain (RNNoise öncesi hafif yükseltme)
      const preGain = audioCtx.createGain();
      preGain.gain.value = 1.1;

      // 5. Gate Gain Node
      const gateGain = audioCtx.createGain();
      gateGain.gain.value = 0;
      gateGainNodeRef.current = gateGain;

      // 6. Input Volume Gain
      const inputGain = audioCtx.createGain();
      inputGain.gain.value = inputVolumeRef.current / 100;
      inputGainNodeRef.current = inputGain;

      if (isNoiseSuppressionRef.current) {
        try {
          await audioCtx.audioWorklet.addModule('/processors/rnnoise-processor.js');
          const rnnoiseNode = new AudioWorkletNode(audioCtx, 'rnnoise-processor');
          workletNodeRef.current = rnnoiseNode;
          
          // Zincir: source → limiter → highpass → notch → preGain → RNNoise → inputGain → gate → dest
          source.connect(limiter);
          limiter.connect(highpass);
          highpass.connect(notch);
          notch.connect(preGain);
          preGain.connect(rnnoiseNode);
          rnnoiseNode.connect(inputGain);
          inputGain.connect(gateGain);
          gateGain.connect(destination);
          
          const analyser = audioCtx.createAnalyser();
          rnnoiseNode.connect(analyser);
          
          rnnoiseNode.port.postMessage({ type: 'init' });
          
          // RNNoise hazır olana kadar gate kapalı kalmasın diye timeout
          setTimeout(() => startOptimizedGateAnalysis(analyser, gateGain, audioCtx), 100);
        } catch (rnnoiseError) {
          console.warn('RNNoise yüklenemedi, fallback:', rnnoiseError);
          // Fallback
          source.connect(limiter);
          limiter.connect(highpass);
          highpass.connect(notch);
          notch.connect(preGain);
          preGain.connect(inputGain);
          inputGain.connect(gateGain);
          gateGain.connect(destination);
          
          const analyser = audioCtx.createAnalyser();
          preGain.connect(analyser);
          startOptimizedGateAnalysis(analyser, gateGain, audioCtx);
        }
      } else {
        source.connect(highpass);
        highpass.connect(inputGain);
        inputGain.connect(destination);
      }

      audioContextRef.current = audioCtx;
      return destination.stream;
    } catch (e) {
      console.error('Ses işleme hatası:', e);
      return rawStream;
    }
  };

  // ─────────────────────────────────────────────────────────────
  // GATE ANALİZİ (Düşük Gecikmeli)
  // ─────────────────────────────────────────────────────────────
  const startOptimizedGateAnalysis = (analyser, gateGainNode, audioCtx) => {
    gateLoopActiveRef.current = false;
    if (scriptNodeRef.current) {
      try { scriptNodeRef.current.disconnect(); } catch (e) {}
      scriptNodeRef.current = null;
    }

    gateLoopActiveRef.current = true;
    if (!analyser || !audioCtx) return;

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

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      analyser.getFloatTimeDomainData(timeData);
      
      let sumSq = 0;
      for (let i = 0; i < timeData.length; i++) {
        sumSq += timeData[i] * timeData[i];
      }
      const instantRms = Math.sqrt(sumSq / timeData.length);
      smoothRms = smoothRms * RMS_SMOOTHING + instantRms * (1 - RMS_SMOOTHING);

      const now = audioCtx.currentTime;
      
      if (smoothRms > GATE_OPEN_RMS) {
        gateIsOpen = true;
        lastOpenTime = now;
      } else if (smoothRms < GATE_CLOSE_RMS && (now - lastOpenTime) > (GATE_HOLD_MS / 1000)) {
        gateIsOpen = false;
      }

      const finalStatus = inputModeRef.current === 'PUSH_TO_TALK' ? 
        isPTTPressedRef.current : gateIsOpen;

      if (gateGainNode) {
        const targetGain = finalStatus ? 1.0 : 0.0;
        const rampTime = finalStatus ? 0.003 : 0.06;
        gateGainNode.gain.linearRampToValueAtTime(targetGain, now + rampTime);
      }

      updateSpeakingStatus(finalStatus);
    };

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