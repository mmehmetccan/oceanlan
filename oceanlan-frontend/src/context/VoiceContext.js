// src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { AuthContext } from './AuthContext';
import { AudioSettingsContext } from './AudioSettingsContext';
import { ToastContext } from './ToastContext';

export const VoiceContext = createContext();

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// 🟢 GÜRÜLTÜ ENGELLEME AYARLARI
const GATE_THRESHOLD = 0.02; // Daha hassas bir eşik
const LOW_CUT_FREQ = 80;     // Alt frekansları kes (Uğultu)
const HIGH_CUT_FREQ = 8000;  // Üst frekansları kes (Tıslama)

const AGGRESSIVE_AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  sampleSize: 16,
  channelCount: 1,
  // Google Chrome Gelişmiş Ayarları
  googEchoCancellation: true,
  googAutoGainControl: true,
  googNoiseSuppression: true,
  googHighpassFilter: true,
  googTypingNoiseDetection: true,
  googNoiseReduction: true,
};

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const processedStreamRef = useRef(null); // İşlenmiş ses
  const audioElementsRef = useRef({});
  const socketUserMapRef = useRef({});

  const myScreenStreamRef = useRef(null);
  const [myScreenStream, setMyScreenStream] = useState(null);

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

  // 🟢 MİKROFON AÇ/KAPA (Gain Node ve Track ile)
  const setLocalMicEnabled = useCallback((enabled) => {
    const shouldSendAudio = !!enabled && !isMicMuted;

    // 1. Track Enable/Disable (Donanımsal durdurma gibi)
    const toggleTracks = (stream) => {
      if (stream) stream.getAudioTracks().forEach(t => t.enabled = shouldSendAudio);
    };
    toggleTracks(localStreamRef.current);
    toggleTracks(processedStreamRef.current);

    // 2. Gain Node (Yazılımsal sessizlik - Gürültü engelleme açıkken şart)
    if (inputGainNodeRef.current && audioContextRef.current) {
        const ctx = audioContextRef.current;
        const targetVol = shouldSendAudio
            ? (inputVolume > 100 ? 1.0 + ((inputVolume - 100) / 30) : inputVolume / 100)
            : 0;
        try {
            inputGainNodeRef.current.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.05);
        } catch(e) {}
    }

    if (!shouldSendAudio) updateSpeakingStatus(false);
  }, [isMicMuted, inputVolume]);

  useEffect(() => {
    if (inputMode === 'PUSH_TO_TALK') {
      setLocalMicEnabled(isPTTPressedRef.current);
    } else {
      setLocalMicEnabled(true);
    }
  }, [inputMode, isPTTPressed, isMicMuted, setLocalMicEnabled]);

  // ... (Socket bağlantı kodları aynen kalacak) ...
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
    newSocket.on('screen-share-stopped', ({ socketId }) => setPeersWithVideo(prev => { const copy = { ...prev }; delete copy[socketId]; return copy; }));
    newSocket.on('voiceStateUpdate', (serverState) => {
      if (!serverState) return;
      Object.values(serverState).forEach(channelUsers => { channelUsers.forEach(u => { socketUserMapRef.current[u.socketId] = u.userId; }); });
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

  // ... (PTT Logic aynen kalacak) ...
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
    window.addEventListener('keydown', onKeyDown, true); window.addEventListener('keyup', onKeyUp, true); window.addEventListener('mousedown', onMouseDown, true); window.addEventListener('mouseup', onMouseUp, true); window.addEventListener('blur', onBlur, true); document.addEventListener('visibilitychange', onVisibilityChange, true);
    let offDown = null, offUp = null;
    if (window.electronAPI?.onPTTDown && window.electronAPI?.onPTTUp) { offDown = window.electronAPI.onPTTDown(pttDown); offUp = window.electronAPI.onPTTUp(pttUp); }
    setLocalMicEnabled(false);
    return () => { window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('keyup', onKeyUp, true); window.removeEventListener('mousedown', onMouseDown, true); window.removeEventListener('mouseup', onMouseUp, true); window.removeEventListener('blur', onBlur, true); document.removeEventListener('visibilitychange', onVisibilityChange, true); offDown && offDown(); offUp && offUp(); };
  }, [inputMode, pttKeyCode, isMicMuted, setLocalMicEnabled]);

  const startScreenShare = async (electronSourceId = null) => { /* ... aynı ... */ };
  const stopScreenShare = () => { /* ... aynı ... */ };

  const handleUserJoined = ({ socketId, userId }) => {
    if (userId) socketUserMapRef.current[userId] = userId;
    // 🟢 DÜZELTME: Önce işlenmiş (Gürültü engellenmiş) yayını kontrol et
    const audioStream = processedStreamRef.current || localStreamRef.current;
    const screenStream = myScreenStreamRef.current;
    const streams = [audioStream, screenStream].filter(Boolean);
    createPeer(socketId, true, streams, userId);
  };

  // 🟢 GELİŞMİŞ GÜRÜLTÜ ENGELLEME İŞLEMCİSİ
  const processAudioStream = async (rawStream) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return rawStream;
      const audioCtx = new AudioContext();
      // Tarayıcılar bazen context'i suspended başlatır, uyandıralım
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
        // 1. HighPass Filter (Klima/Fan uğultusu kesici)
        const highPass = audioCtx.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = LOW_CUT_FREQ;
        highPass.Q.value = 0.5;

        // 2. LowPass Filter (Aşırı tiz kesici)
        const lowPass = audioCtx.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = HIGH_CUT_FREQ;
        lowPass.Q.value = 0.5;

        // 3. Noise Gate (Sessizken tam kesici)
        const gateGain = audioCtx.createGain();
        gateGain.gain.value = 0;
        gateGainNodeRef.current = gateGain;

        // 4. Compressor (Ses dengeleyici)
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.ratio.value = 4; // Oran
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        currentNode.connect(highPass);
        highPass.connect(lowPass);
        lowPass.connect(gateGain);
        gateGain.connect(compressor);
        compressor.connect(destination);

        // Analiz
        const analyser = audioCtx.createAnalyser();
        analyser.smoothingTimeConstant = 0.8;
        lowPass.connect(analyser); // Filtreli sesi analiz et
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

  const startGateAnalysis = (analyser, gateGainNode, audioCtx, rawStreamForSimpleMode = null) => {
    // Noise Gate Mantığı (Gürültü Engelleme Açıksa)
    if (analyser && gateGainNode && audioCtx) {
        analyser.fftSize = 512;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const checkVolume = () => {
            if (!gateGainNode || audioCtx.state === 'closed') return;

            if (inputMode === 'PUSH_TO_TALK') {
                const isOpen = isPTTPressedRef.current;
                gateGainNode.gain.setTargetAtTime(isOpen ? 1 : 0, audioCtx.currentTime, isOpen ? 0.01 : 0.05);
                updateSpeakingStatus(isOpen);
                requestAnimationFrame(checkVolume);
                return;
            }

            analyser.getByteFrequencyData(dataArray);
            let sum = 0; let count = 0;
            // İnsan sesi frekanslarına odaklan
            for (let i = 5; i < 60 && i < bufferLength; i++) { sum += dataArray[i]; count++; }
            const average = count > 0 ? sum / count : 0;

            if ((average / 255) > GATE_THRESHOLD) {
                // Ses var -> Aç
                gateGainNode.gain.setTargetAtTime(1, audioCtx.currentTime, 0.02);
                updateSpeakingStatus(true);
            } else {
                // Ses yok -> Kapat
                gateGainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.2);
                updateSpeakingStatus(false);
            }
            requestAnimationFrame(checkVolume);
        };
        checkVolume();
        return;
    }

    // Basit Mod (Sadece konuşma ikonu için)
    if (rawStreamForSimpleMode) {
        try {
            const simpleCtx = new AudioContext();
            const simpleAnalyser = simpleCtx.createAnalyser();
            const simpleSrc = simpleCtx.createMediaStreamSource(rawStreamForSimpleMode);
            simpleSrc.connect(simpleAnalyser);
            const checkLoop = () => {
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

  const joinVoiceChannel = async (server, channel) => {
    const sId = server._id || server;
    const cId = channel._id || channel;

    if (currentVoiceChannelId === cId) return;
    if (currentVoiceChannelId) { cleanupMediaOnly(); socketRef.current?.emit('leave-voice-channel'); }

    setCurrentVoiceChannelId(cId);
    setCurrentServerId(sId);
    setStayConnected(true);
    if (server.name) setCurrentServerName(server.name);
    if (channel.name) setCurrentVoiceChannelName(channel.name);

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

      // 🟢 ÖNCE SESİ İŞLE, SONRA GÖNDER
      let streamToSend = await processAudioStream(rawStream);
      processedStreamRef.current = streamToSend;

      if (inputMode === 'PUSH_TO_TALK') setLocalMicEnabled(isPTTPressedRef.current);
      else setLocalMicEnabled(true);

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

  const leaveVoiceChannel = () => {
    setStayConnected(false);
    setCurrentVoiceChannelId(null);
    setCurrentServerId(null);
    socketRef.current?.emit('leave-voice-channel');
    cleanupMediaOnly();
  };

  const cleanupMediaOnly = () => {
    Object.keys(peersRef.current).forEach(id => { peersRef.current[id]?.destroy(); audioElementsRef.current[id]?.remove(); });
    peersRef.current = {}; audioElementsRef.current = {}; socketUserMapRef.current = {}; setPeersWithVideo({}); setSpeakingUsers({}); isSpeakingRef.current = false;
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (processedStreamRef.current) processedStreamRef.current = null;
    if (myScreenStreamRef.current) { myScreenStreamRef.current.getTracks().forEach(t => t.stop()); myScreenStreamRef.current = null; setMyScreenStream(null); }
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
  };

  const rejoinChannel = () => {};

  const createPeer = (targetSocketId, initiator, streams = [], userId = null) => {
    const p = new Peer({ initiator, trickle: false, streams, config: rtcConfig });
    p.on('signal', data => socketRef.current?.emit(initiator ? 'webrtc-offer' : 'webrtc-answer', { targetSocketId, sdp: data, userId: user?.id }));
    p.on('stream', stream => handleRemoteStream(stream, targetSocketId, userId));
    peersRef.current[targetSocketId] = p;
    return p;
  };

  const handleOffer = ({ socketId, sdp, userId }) => {
    if (userId) socketUserMapRef.current[socketId] = userId;
    if (peersRef.current[socketId]) peersRef.current[socketId].destroy();
    const audioStream = processedStreamRef.current || localStreamRef.current;
    const screenStream = myScreenStreamRef.current;
    const streams = [audioStream, screenStream].filter(Boolean);
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
    if (stream.getVideoTracks().length > 0) {
      setPeersWithVideo(prev => ({ ...prev, [socketId]: stream }));
    } else {
      if (audioElementsRef.current[socketId]) audioElementsRef.current[socketId].remove();
      const audio = document.createElement('audio');
      audio.srcObject = stream;
      audio.autoplay = true;
      audio.style.display = 'none';
      audio.muted = isDeafened; // 🟢 Deaf kontrolü
      document.body.appendChild(audio);
      if (outputDeviceId && typeof audio.setSinkId === 'function') { audio.setSinkId(outputDeviceId).catch(() => {}); }
      audioElementsRef.current[socketId] = audio;
      applyVolumeSettings();
    }
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
      leaveVoiceChannel,
      speakingUsers,
      micError,
      stayConnected,
      peersWithVideo,
      myScreenStream,
      startScreenShare,
      stopScreenShare,
      isPTTPressed
    }}>
      {children}
    </VoiceContext.Provider>
  );
};