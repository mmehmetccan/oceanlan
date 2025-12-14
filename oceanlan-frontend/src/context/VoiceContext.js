// src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { AuthContext } from './AuthContext';
import { AudioSettingsContext } from './AudioSettingsContext';
import { ToastContext } from './ToastContext';

export const VoiceContext = createContext();

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

// 🛡️ FİLTRE AYARLARI
const LOW_CUT_FREQ = 200;
const HIGH_CUT_FREQ = 4000;

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);

  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const audioElementsRef = useRef({});
  const socketUserMapRef = useRef({});

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const inputGainNodeRef = useRef(null); // 🔊 SES YÜKSELTİCİ DÜĞÜM
  const checkIntervalRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const processingNodesRef = useRef(null);

  const { user, token, isAuthenticated } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const audioSettings = useContext(AudioSettingsContext);

  const {
      inputDeviceId, outputDeviceId, isMicMuted, isDeafened,
      userVolumes, isNoiseSuppression, inputVolume = 100
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
  const [myScreenStream, setMyScreenStream] = useState(null);

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
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    let backendUrl = 'http://localhost:4000';
    if (isElectron || isProductionUrl) {
        backendUrl = 'https://oceanlan.com';
    } else if (!isLocalhost) {
        backendUrl = `http://${window.location.hostname}:4000`;
    }

    socketRef.current = io(backendUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
      secure: true,
      reconnection: true,
      autoConnect: true,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('[SOCKET] Bağlandı:', socket.id);
      setIsConnected(true);
      if (stayConnected && currentVoiceChannelId) rejoinChannel();
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('user-joined-voice', handleUserJoined);
    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIce);
    socket.on('user-left-voice', handleUserLeft);
    socket.on('voice-channel-moved', handleChannelMoved);
    socket.on('user-speaking-change', ({ userId, isSpeaking }) => {
        setSpeakingUsers(prev => ({ ...prev, [userId]: isSpeaking }));
    });

    socket.on('voiceStateUpdate', (serverState) => {
        if (!serverState) return;
        Object.values(serverState).forEach(channelUsers => {
            channelUsers.forEach(u => {
                socketUserMapRef.current[u.userId] = u.socketId;
            });
        });
        applyVolumeSettings();
    });

    return () => { if (newSocket) newSocket.disconnect(); };
  }, [token, isAuthenticated]);

  // Başkalarının ses ayarını uygula (HTML Audio Max 1.0 destekler)
  const applyVolumeSettings = () => {
      if (!userVolumes || !audioElementsRef.current) return;
      Object.keys(userVolumes).forEach(targetUserId => {
          const targetSocketId = Object.keys(socketUserMapRef.current).find(key => socketUserMapRef.current[key] === targetUserId) ||
                                 (audioElementsRef.current[targetUserId] ? targetUserId : null);

          if (targetSocketId && audioElementsRef.current[targetSocketId]) {
              const vol = userVolumes[targetUserId];
              // 0 ise tam sessiz, değilse max 1.0
              audioElementsRef.current[targetSocketId].volume = vol === 0 ? 0 : Math.min(vol / 100, 1.0);
          }
      });
  };

  useEffect(() => { applyVolumeSettings(); }, [userVolumes]);

  // 🟢 KENDİ MİKROFON SES SEVİYEMİZ (GAIN) - BURASI ÖNEMLİ
  useEffect(() => {
      if (inputGainNodeRef.current && audioContextRef.current) {
          // Input Volume 0-200 arası gelir.
          // 0 -> 0.0 (Tam Sessizlik)
          // 100 -> 1.0 (Normal)
          // 200 -> 2.0 (İki Kat Ses)

          let gainValue = 1.0;

          if (inputVolume === 0) {
              gainValue = 0; // Mutlak Sessizlik
          } else {
              gainValue = inputVolume / 100; // Örn: 150/100 = 1.5
          }

          // Sesi yumuşak geçişle ayarla (pıtırtı olmasın diye 0.1sn gecikme)
          inputGainNodeRef.current.gain.setTargetAtTime(gainValue, audioContextRef.current.currentTime, 0.1);
      }
  }, [inputVolume]);

  // Gürültü Engelleme Toggle
  useEffect(() => {
      if (!currentVoiceChannelId || !socketRef.current) return;
      const switchAudioMode = async () => {
          if (localStreamRef.current) {
             joinVoiceChannel({ _id: currentServerId }, { _id: currentVoiceChannelId });
          }
      };
      switchAudioMode();
  }, [isNoiseSuppression]);

  // ----------------------------------------------------------------
  // 🎛️ SES İŞLEME MOTORU
  // ----------------------------------------------------------------
  const processAudioStream = async (rawStream) => {
      try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return rawStream;

          const audioCtx = new AudioContext();
          if (audioCtx.state === 'suspended') await audioCtx.resume();

          const source = audioCtx.createMediaStreamSource(rawStream);
          const destination = audioCtx.createMediaStreamDestination();

          // 🟢 1. SES SEVİYESİ (GAIN NODE)
          const inputGain = audioCtx.createGain();

          // İlk açılışta volume ayarını uygula
          const initialVolume = inputVolume !== undefined ? inputVolume : 100;
          inputGain.gain.value = initialVolume === 0 ? 0 : (initialVolume / 100);

          inputGainNodeRef.current = inputGain;

          let currentNode = source;
          currentNode.connect(inputGain);
          currentNode = inputGain;

          if (isNoiseSuppression) {
              // 2. High-Pass (Uğultu Kesici)
              const highPass = audioCtx.createBiquadFilter();
              highPass.type = 'highpass';
              highPass.frequency.value = LOW_CUT_FREQ;
              highPass.Q.value = 0.7;

              // 3. Low-Pass (Cızırtı Kesici)
              const lowPass = audioCtx.createBiquadFilter();
              lowPass.type = 'lowpass';
              lowPass.frequency.value = HIGH_CUT_FREQ;
              lowPass.Q.value = 0.7;

              // 4. Compressor
              const compressor = audioCtx.createDynamicsCompressor();
              compressor.threshold.value = -20;
              compressor.knee.value = 40;
              compressor.ratio.value = 12;
              compressor.attack.value = 0;
              compressor.release.value = 0.25;

              // Bağlantı
              currentNode.connect(highPass);
              highPass.connect(lowPass);
              lowPass.connect(compressor);
              compressor.connect(destination);
          } else {
              // Gürültü engelleme yoksa sadece Gain ile çıkışa ver
              currentNode.connect(destination);
          }

          audioContextRef.current = audioCtx;
          return destination.stream;
      } catch (e) {
          console.error("Ses işleme hatası:", e);
          return rawStream;
      }
  };

  // 🔊 ANALİZ
  const startAudioAnalysis = async (stream) => {
      try {
          let audioCtx = audioContextRef.current;
          if (!audioCtx) {
              const AudioContext = window.AudioContext || window.webkitAudioContext;
              if (!AudioContext) return;
              audioCtx = new AudioContext();
              audioContextRef.current = audioCtx;
          }
          if (audioCtx.state === 'suspended') await audioCtx.resume();

          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512;
          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);
          analyserRef.current = analyser;

          if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);

          checkIntervalRef.current = setInterval(() => {
              if (isMicMuted || !analyserRef.current || audioCtx.state === 'closed') {
                  updateSpeakingStatus(false);
                  return;
              }
              const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
              analyserRef.current.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              const average = sum / dataArray.length;
              updateSpeakingStatus(average > 10);
          }, 100);
      } catch (e) { console.error("Analiz hatası:", e); }
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

  const stopAudioAnalysis = () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
      isSpeakingRef.current = false;
  };

  const cleanupMediaOnly = () => {
      Object.keys(peersRef.current).forEach(id => {
          peersRef.current[id]?.destroy();
          audioElementsRef.current[id]?.remove();
      });
      peersRef.current = {};
      audioElementsRef.current = {};
      setPeersWithVideo({});
      setSpeakingUsers({});
      stopAudioAnalysis();

      if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
          localStreamRef.current = null;
      }
      if (processedStreamRef.current) processedStreamRef.current = null;
      if (myScreenStream) {
          myScreenStream.getTracks().forEach(t => t.stop());
          setMyScreenStream(null);
      }
      if (audioContextRef.current) {
          audioContextRef.current.close().catch(()=>{});
          audioContextRef.current = null;
      }
  };

  const handleChannelMoved = ({ newChannelId, serverId, channelName }) => {
    cleanupMediaOnly();
    setCurrentVoiceChannelId(newChannelId);
    setCurrentServerId(serverId);
    if(channelName) setCurrentVoiceChannelName(channelName);
    joinVoiceChannel(serverId, newChannelId);
  };

  // 🟢 MOBİL FALLBACK UYUMLU JOIN
  const joinVoiceChannel = async (server, channel) => {
    const sId = server._id || server;
    const cId = channel._id || channel;

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        alert("Mikrofon için HTTPS gereklidir!");
        return;
    }

    if (currentVoiceChannelId === cId) return;
    if (currentVoiceChannelId) { cleanupMediaOnly(); socketRef.current?.emit('leave-voice-channel'); }

    setCurrentVoiceChannelId(cId);
    setCurrentServerId(sId);
    setStayConnected(true);
    if(server.name) setCurrentServerName(server.name);
    if(channel.name) setCurrentVoiceChannelName(channel.name);

    try {
      let rawStream;
      const constraints = {
          audio: {
            deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
      };

      try {
          if (!isNoiseSuppression) {
             constraints.audio = { deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined };
          }
          rawStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (advancedErr) {
          console.warn("Gelişmiş mod başarısız, basit moda geçiliyor...", advancedErr);
          rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }

      localStreamRef.current = rawStream;

      // İşlenmiş Sesi Hazırla
      let streamToSend = await processAudioStream(rawStream);
      processedStreamRef.current = streamToSend;

      const shouldEnable = !isMicMuted;
      rawStream.getAudioTracks().forEach(track => { track.enabled = shouldEnable; });
      streamToSend.getAudioTracks().forEach(track => { track.enabled = shouldEnable; });

      startAudioAnalysis(streamToSend);

      socketRef.current.emit('join-voice-channel', {
        serverId: sId,
        channelId: cId,
        userId: user?._id || user?.id,
        username: user?.username
      });

    } catch (err) {
      console.error("Mikrofon hatası:", err);
      setMicError("Mikrofon açılamadı");
      addToast('Mikrofon hatası: İzin verilmedi.', 'error');
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

  const handleUserJoined = ({ socketId }) => {
      const stream = processedStreamRef.current || localStreamRef.current;
      const streams = [stream, myScreenStream].filter(Boolean);
      createPeer(socketId, true, streams);
  };

  const handleOffer = ({ socketId, sdp }) => {
    if(peersRef.current[socketId]) peersRef.current[socketId].destroy();
    const streamToSend = processedStreamRef.current || localStreamRef.current;
    const streams = [streamToSend, myScreenStream].filter(Boolean);
    const p = createPeer(socketId, false, streams);
    p.signal(sdp);
  };

  const handleAnswer = ({ socketId, sdp }) => peersRef.current[socketId]?.signal(sdp);
  const handleIce = ({ socketId, candidate }) => peersRef.current[socketId]?.signal(candidate);

  const handleUserLeft = ({ socketId }) => {
      peersRef.current[socketId]?.destroy();
      delete peersRef.current[socketId];
      audioElementsRef.current[socketId]?.remove();
      delete audioElementsRef.current[socketId];
      setPeersWithVideo(prev => { const n={...prev}; delete n[socketId]; return n; });
  };

  const createPeer = (targetSocketId, initiator, streams = []) => {
    const p = new Peer({ initiator, trickle: false, streams, config: rtcConfig });
    p.on('signal', data => socketRef.current?.emit(initiator ? 'webrtc-offer' : 'webrtc-answer', { targetSocketId, sdp: data }));
    p.on('stream', stream => handleRemoteStream(stream, targetSocketId));
    peersRef.current[targetSocketId] = p;
    return p;
  };

  const handleRemoteStream = (stream, id) => {
      if (stream.getVideoTracks().length > 0) {
          setPeersWithVideo(prev => ({ ...prev, [id]: stream }));
      } else {
          if (audioElementsRef.current[id]) audioElementsRef.current[id].remove();
          const audio = document.createElement('audio');
          audio.srcObject = stream;
          audio.autoplay = true;
          audio.style.display = 'none';
          document.body.appendChild(audio);

          if (outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(()=>{});
          audioElementsRef.current[id] = audio;
          applyVolumeSettings();
      }
  };

  const startScreenShare = async (electronSourceId = null) => {
    try {
        let stream;
        if (window.electronAPI && electronSourceId) {
             stream = await navigator.mediaDevices.getUserMedia({
                 audio: false,
                 video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: electronSourceId } }
             });
        } else {
             stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        }
        setMyScreenStream(stream);
        Object.values(peersRef.current).forEach(p => p.addStream(stream));
        stream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) {}
  };

  const stopScreenShare = () => {
      if (myScreenStream) {
          myScreenStream.getTracks().forEach(t => t.stop());
          Object.values(peersRef.current).forEach(p => { try { p.removeStream(myScreenStream); } catch(e){} });
          setMyScreenStream(null);
      }
  };

  useEffect(() => {
      if (!audioElementsRef.current) return;
      Object.values(audioElementsRef.current).forEach((audio) => {
          if (!audio) return;
          audio.muted = isDeafened;
          if(outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(e=>{});
      });
  }, [isDeafened, outputDeviceId, userVolumes]);

  useEffect(() => {
      const applyMute = (stream) => { if(stream) stream.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; }); };
      applyMute(localStreamRef.current);
      applyMute(processedStreamRef.current);
  }, [isMicMuted]);

  return (
    <VoiceContext.Provider value={{
      socket: socketRef.current, isConnected,
      currentVoiceChannelId, currentServerId,
      currentVoiceChannelName, currentServerName, joinVoiceChannel, leaveVoiceChannel, speakingUsers, micError, stayConnected, peersWithVideo, myScreenStream, startScreenShare, stopScreenShare
    }}>
      {children}
    </VoiceContext.Provider>
  );
};