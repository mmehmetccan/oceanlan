// src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { AuthContext } from './AuthContext';
import { AudioSettingsContext } from './AudioSettingsContext';
import { ToastContext } from './ToastContext';

export const VoiceContext = createContext();

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const GATE_THRESHOLD = 0.08;
const LOW_CUT_FREQ = 150;
const HIGH_CUT_FREQ = 6000;

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const audioElementsRef = useRef({});
  const socketUserMapRef = useRef({});

  // 🟢 YENİ: Yayını Ref içinde de tutuyoruz (Sonradan girenler için şart!)
  const myScreenStreamRef = useRef(null);
  const [myScreenStream, setMyScreenStream] = useState(null);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const inputGainNodeRef = useRef(null);
  const gateGainNodeRef = useRef(null);
  const isSpeakingRef = useRef(false);

  // ✅ PTT
  const isPTTPressedRef = useRef(false);
  const [isPTTPressed, setIsPTTPressed] = useState(false);

  const { user, token, isAuthenticated } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const audioSettings = useContext(AudioSettingsContext);

  const {
    inputDeviceId, outputDeviceId, isMicMuted, isDeafened,
    userVolumes, isNoiseSuppression, inputVolume = 100,
    inputMode = 'VOICE_ACTIVITY',
    // ✅ EKLENDİ
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

  // ✅ EKLENDİ: Track enable/disable helper (PTT gerçekten ses gönderimini aç/kapa yapsın)
  const setLocalMicEnabled = useCallback((enabled) => {
    const wantEnable = !!enabled && !isMicMuted;

    const apply = (stream) => {
      if (!stream) return;
      try {
        stream.getAudioTracks().forEach(t => { t.enabled = wantEnable; });
      } catch {}
    };

    apply(localStreamRef.current);
    apply(processedStreamRef.current);
  }, [isMicMuted]);

  // ✅ EKLENDİ: Mode değişince track davranışı
  useEffect(() => {
    if (inputMode === 'PUSH_TO_TALK') {
      // PTT modunda: basılı değilken kapalı
      setLocalMicEnabled(isPTTPressedRef.current);
    } else {
      // Voice activity modunda: mute değilse açık
      setLocalMicEnabled(true);
    }
  }, [inputMode, setLocalMicEnabled]);

  // 1. SOCKET BAĞLANTISI
  useEffect(() => {
    if (!token || !isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    if (socketRef.current && socketRef.current.connected) return;

    const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;
    const isProductionUrl = window.location.hostname.includes('oceanlan.com');
    let backendUrl = 'http://localhost:4000';
    if (isElectron || isProductionUrl) backendUrl = 'https://oceanlan.com';

    const newSocket = io(backendUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
      secure: true,
      reconnection: true,
      autoConnect: true,
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      setIsConnected(true);
      if (stayConnected && currentVoiceChannelId) rejoinChannel();
    });

    newSocket.on('disconnect', () => setIsConnected(false));

    newSocket.on('user-joined-voice', handleUserJoined);
    newSocket.on('webrtc-offer', handleOffer);
    newSocket.on('webrtc-answer', handleAnswer);
    newSocket.on('webrtc-ice-candidate', handleIce);
    newSocket.on('user-left-voice', handleUserLeft);
    newSocket.on('voice-channel-moved', handleChannelMoved);
    newSocket.on('user-speaking-change', ({ userId, isSpeaking }) => {
      setSpeakingUsers(prev => ({ ...prev, [userId]: isSpeaking }));
    });

    newSocket.on('screen-share-stopped', ({ socketId }) => {
      setPeersWithVideo(prev => {
        const copy = { ...prev };
        delete copy[socketId];
        return copy;
      });
    });

    newSocket.on('voiceStateUpdate', (serverState) => {
      if (!serverState) return;
      Object.values(serverState).forEach(channelUsers => {
        channelUsers.forEach(u => {
          socketUserMapRef.current[u.socketId] = u.userId;
        });
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
        const vol = userVolumes[uid];
        el.volume = vol === 0 ? 0 : Math.min(vol / 100, 1.0);
      }
    });
  };
  useEffect(() => { applyVolumeSettings(); }, [userVolumes]);

  useEffect(() => {
    if (inputGainNodeRef.current && audioContextRef.current) {
      let gainValue = 1.0;
      if (inputVolume === 0) gainValue = 0;
      else if (inputVolume <= 100) gainValue = inputVolume / 100;
      else gainValue = 1.0 + ((inputVolume - 100) / 30);
      inputGainNodeRef.current.gain.setTargetAtTime(gainValue, audioContextRef.current.currentTime, 0.05);
    }
  }, [inputVolume]);

  // ✅ PTT: tek merkez (VoiceContext)
  useEffect(() => {
    if (inputMode !== 'PUSH_TO_TALK') {
      isPTTPressedRef.current = false;
      setIsPTTPressed(false);
      return;
    }

    const isMouseBinding = (code) => typeof code === 'string' && code.startsWith('MOUSE_');
    const mouseButtonFromCode = (code) => {
      const n = parseInt(String(code).replace('MOUSE_', ''), 10);
      return Number.isFinite(n) ? n : null;
    };

    const pttDown = () => {
      if (isMicMuted) return;
      if (isPTTPressedRef.current) return;

      isPTTPressedRef.current = true;
      setIsPTTPressed(true);

      // ✅ gerçek mikrofon aç
      setLocalMicEnabled(true);

      updateSpeakingStatus(true);
    };

    const pttUp = () => {
      if (!isPTTPressedRef.current) return;

      isPTTPressedRef.current = false;
      setIsPTTPressed(false);

      // ✅ gerçek mikrofon kapat
      setLocalMicEnabled(false);

      updateSpeakingStatus(false);
    };

    const onKeyDown = (e) => {
      if (!e.repeat && e.code === pttKeyCode) pttDown();
    };
    const onKeyUp = (e) => {
      if (e.code === pttKeyCode) pttUp();
    };

    const onMouseDown = (e) => {
      if (!isMouseBinding(pttKeyCode)) return;
      const btn = mouseButtonFromCode(pttKeyCode);
      if (btn === e.button) pttDown();
    };
    const onMouseUp = (e) => {
      if (!isMouseBinding(pttKeyCode)) return;
      const btn = mouseButtonFromCode(pttKeyCode);
      if (btn === e.button) pttUp();
    };

    // Tarayıcı sekmeden çıkınca event gelmeyebilir -> “takılı kalmasın” diye blur’da bırak
    const onBlur = () => pttUp();
 const onVisibilityChange = () => {
      if (document.hidden) pttUp();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('blur', onBlur, true);
        document.addEventListener('visibilitychange', onVisibilityChange, true);


    // ✅ Electron global PTT event desteği (varsa)
    // preload/main tarafında event gönderirsen, sekme/pencere odakta olmasa da çalışır.
    let offDown = null;
    let offUp = null;
    if (window.electronAPI?.onPTTDown && window.electronAPI?.onPTTUp) {
      offDown = window.electronAPI.onPTTDown(pttDown);
      offUp = window.electronAPI.onPTTUp(pttUp);
    }

    // Başlangıçta PTT basılı değilken mic kapalı
    setLocalMicEnabled(false);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('blur', onBlur, true);
  document.removeEventListener('visibilitychange', onVisibilityChange, true);
      offDown && offDown();
      offUp && offUp();
    };
  }, [inputMode, pttKeyCode, isMicMuted, setLocalMicEnabled]);

  // EKRAN PAYLAŞIMI BAŞLATMA
  const startScreenShare = async (electronSourceId = null) => {
    try {
      let stream;
      if (window.electronAPI && electronSourceId) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: electronSourceId, minWidth: 1280, maxWidth: 1920, minHeight: 720, maxHeight: 1080 } }
        });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      }

      setMyScreenStream(stream);
      myScreenStreamRef.current = stream;

      Object.values(peersRef.current).forEach(peer => {
        try { if (peer && !peer.destroyed) peer.addStream(stream); } catch (err) {}
      });

      stream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) { addToast("Ekran paylaşımı başlatılamadı", "error"); }
  };

  const stopScreenShare = () => {
    if (socketRef.current) {
      socketRef.current.emit('screen-share-stopped', {
        serverId: currentServerId,
        channelId: currentVoiceChannelId
      });
    }

    const stream = myScreenStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());

      Object.values(peersRef.current).forEach(p => {
        try { p.removeStream(stream); } catch(e){}
      });

      setMyScreenStream(null);
      myScreenStreamRef.current = null;
    }
  };

  const handleUserJoined = ({ socketId, userId }) => {
    if (userId) socketUserMapRef.current[userId] = userId;

    const audioStream = processedStreamRef.current || localStreamRef.current;
    const screenStream = myScreenStreamRef.current;

    const streams = [audioStream, screenStream].filter(Boolean);

    createPeer(socketId, true, streams, userId);
  };

  // --- Ses İşleme / Gate ---
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
        const highPass = audioCtx.createBiquadFilter(); highPass.type = 'highpass'; highPass.frequency.value = LOW_CUT_FREQ; highPass.Q.value = 0.7;
        const lowPass = audioCtx.createBiquadFilter(); lowPass.type = 'lowpass'; lowPass.frequency.value = HIGH_CUT_FREQ; lowPass.Q.value = 0.6;
        const gateGain = audioCtx.createGain(); gateGain.gain.value = 0; gateGainNodeRef.current = gateGain;
        const compressor = audioCtx.createDynamicsCompressor(); compressor.threshold.value = -30; compressor.ratio.value = 12;

        currentNode.connect(highPass);
        highPass.connect(lowPass);
        lowPass.connect(gateGain);
        gateGain.connect(compressor);
        compressor.connect(destination);

        const analyser = audioCtx.createAnalyser();
        lowPass.connect(analyser);
        startGateAnalysis(analyser, gateGain, audioCtx);
      } else {
        currentNode.connect(destination);
        startGateAnalysis(null, null, null, rawStream);
      }

      audioContextRef.current = audioCtx;
      return destination.stream;
    } catch (e) { return rawStream; }
  };

  const startGateAnalysis = (analyser, gateGainNode, audioCtx, rawStreamForSimpleMode = null) => {
    if (rawStreamForSimpleMode) {
      try {
        const simpleCtx = new AudioContext();
        const simpleAnalyser = simpleCtx.createAnalyser();
        const simpleSrc = simpleCtx.createMediaStreamSource(rawStreamForSimpleMode);
        simpleSrc.connect(simpleAnalyser);

        const checkLoop = () => {
          if (simpleCtx.state === 'closed') return;

          if (inputMode === 'PUSH_TO_TALK') {
            // ✅ PTT’de konuşma durumunu ref belirler; track enable/disable zaten PTT handler’da
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
      return;
    }

    analyser.fftSize = 512;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const checkVolume = () => {
      if (!gateGainNode || audioCtx.state === 'closed') return;

      if (inputMode === 'PUSH_TO_TALK') {
        // ✅ PTT'de gate sadece "temizlik", asıl kapama track.enabled ile
        gateGainNode.gain.setTargetAtTime(isPTTPressedRef.current ? 1 : 0, audioCtx.currentTime, isPTTPressedRef.current ? 0.01 : 0.05);
        updateSpeakingStatus(isPTTPressedRef.current);
        requestAnimationFrame(checkVolume);
        return;
      }

      analyser.getByteFrequencyData(dataArray);
      let sum = 0; let count = 0;
      for (let i = 10; i < 50 && i < bufferLength; i++) { sum += dataArray[i]; count++; }
      const average = count > 0 ? sum / count : 0;

      if ((average / 255) > GATE_THRESHOLD) {
        gateGainNode.gain.setTargetAtTime(1, audioCtx.currentTime, 0.01);
        updateSpeakingStatus(true);
      } else {
        gateGainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        updateSpeakingStatus(false);
      }

      requestAnimationFrame(checkVolume);
    };

    checkVolume();
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

  const cleanupMediaOnly = () => {
    Object.keys(peersRef.current).forEach(id => {
      peersRef.current[id]?.destroy();
      audioElementsRef.current[id]?.remove();
    });

    peersRef.current = {};
    audioElementsRef.current = {};
    socketUserMapRef.current = {};

    setPeersWithVideo({});
    setSpeakingUsers({});
    isSpeakingRef.current = false;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (processedStreamRef.current) processedStreamRef.current = null;

    if (myScreenStreamRef.current) {
      myScreenStreamRef.current.getTracks().forEach(t => t.stop());
      myScreenStreamRef.current = null;
      setMyScreenStream(null);
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
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

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      alert("HTTPS gerekli!");
      return;
    }

    if (currentVoiceChannelId === cId) return;

    if (currentVoiceChannelId) {
      cleanupMediaOnly();
      socketRef.current?.emit('leave-voice-channel');
    }

    setCurrentVoiceChannelId(cId);
    setCurrentServerId(sId);
    setStayConnected(true);

    if (server.name) setCurrentServerName(server.name);
    if (channel.name) setCurrentVoiceChannelName(channel.name);

    try {
      const constraints = {
        audio: {
          deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
          echoCancellation: !!isNoiseSuppression,
          noiseSuppression: !!isNoiseSuppression,
          autoGainControl: false,
          googEchoCancellation: true,
          googNoiseSuppression: true,
          googTypingNoiseDetection: true
        },
        video: false
      };

      if (!isNoiseSuppression) {
        constraints.audio = { deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined };
      }

      let rawStream;
      try {
        rawStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }

      localStreamRef.current = rawStream;

      let streamToSend = await processAudioStream(rawStream);
      processedStreamRef.current = streamToSend;

      // ✅ Burada track enable mantığı:
      if (inputMode === 'PUSH_TO_TALK') {
        // PTT modunda ilk başta kapalı
        setLocalMicEnabled(isPTTPressedRef.current);
      } else {
        setLocalMicEnabled(true);
      }

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

  const leaveVoiceChannel = () => {
    setStayConnected(false);
    setCurrentVoiceChannelId(null);
    setCurrentServerId(null);
    socketRef.current?.emit('leave-voice-channel');
    cleanupMediaOnly();
  };

  const rejoinChannel = () => {};

  // Peer Oluşturma
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
    peersRef.current[socketId]?.destroy();
    delete peersRef.current[socketId];

    audioElementsRef.current[socketId]?.remove();
    delete audioElementsRef.current[socketId];

    delete socketUserMapRef.current[socketId];

    setPeersWithVideo(prev => {
      const n = { ...prev };
      delete n[socketId];
      return n;
    });
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
      document.body.appendChild(audio);

      if (outputDeviceId && typeof audio.setSinkId === 'function') {
        audio.setSinkId(outputDeviceId).catch(() => {});
      }

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

  // ✅ Mevcut mute effect’ini bozma, ama PTT modunu da hesaba kat
  useEffect(() => {
    if (inputMode === 'PUSH_TO_TALK') {
      setLocalMicEnabled(isPTTPressedRef.current);
    } else {
      setLocalMicEnabled(true);
    }
  }, [isMicMuted, inputMode, setLocalMicEnabled]);

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

      // ✅ EKLENDİ: UI göstergesi için
      isPTTPressed
    }}>
      {children}
    </VoiceContext.Provider>
  );
};
