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

// 🛡️ HİBRİT GÜRÜLTÜ ENGELLEME AYARLARI
const GATE_THRESHOLD = 0.05; // Hassas Kapı
const LOW_CUT_FREQ = 200;    // Uğultu Kesici
const HIGH_CUT_FREQ = 3000;  // Tıslama Kesici (Telsiz Modu)

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);

  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const audioElementsRef = useRef({});

  // 🟢 KRİTİK: SocketID <-> UserID Eşleşmesi
  const socketUserMapRef = useRef({});

  // Ses İşleme Refleri
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const inputGainNodeRef = useRef(null);
  const checkIntervalRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const isPTTPressedRef = useRef(false);

  const { user, token, isAuthenticated } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const audioSettings = useContext(AudioSettingsContext);

  const {
      inputDeviceId, outputDeviceId, isMicMuted, isDeafened,
      userVolumes, isNoiseSuppression, inputVolume = 100,
      inputMode = 'VOICE_ACTIVITY', pushToTalkKey = 'Space'
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
    let backendUrl = (isElectron || isProductionUrl) ? 'https://oceanlan.com' : 'http://localhost:4000';

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

    // 🟢 Eşleşmeleri Yakala
    socket.on('user-joined-voice', ({ socketId, userId }) => {
        if (userId) socketUserMapRef.current[socketId] = userId;
        handleUserJoined({ socketId, userId });
    });

    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIce);
    socket.on('user-left-voice', handleUserLeft);
    socket.on('voice-channel-moved', handleChannelMoved);
    socket.on('user-speaking-change', ({ userId, isSpeaking }) => {
        setSpeakingUsers(prev => ({ ...prev, [userId]: isSpeaking }));
    });

    // Serverdan tüm listeyi alıp eşleştir
    socket.on('voiceStateUpdate', (serverState) => {
        if (!serverState) return;
        Object.values(serverState).forEach(channelUsers => {
            channelUsers.forEach(u => {
                socketUserMapRef.current[u.socketId] = u.userId;
            });
        });
        applyVolumeSettings(); // Harita güncellendi, sesleri uygula
    });

    return () => { if (newSocket) newSocket.disconnect(); };
  }, [token, isAuthenticated]);

  // 🟢 BAŞKALARININ SES AYARI (ARTIK ÇALIŞACAK)
  const applyVolumeSettings = () => {
      // Audio elementlerini gez
      Object.keys(audioElementsRef.current).forEach(socketId => {
          const audioElement = audioElementsRef.current[socketId];
          const ownerUserId = socketUserMapRef.current[socketId]; // ID'yi haritadan bul

          if (ownerUserId && audioElement && userVolumes[ownerUserId] !== undefined) {
              const vol = userVolumes[ownerUserId];
              // Volume 0-200 arası gelir. HTML Audio max 1.0 alır.
              // %200 yapmak için sesi yazılımsal yükseltmemiz gerekir ama basit çözüm:
              // 100 üstünü 1.0 kabul edelim (HTML limiti), 0-100 arasını kısalım.
              // Eğer %200 ses istiyorsan GainNode eklememiz lazım herbiri için (Karmaşıklaşır).
              // Şimdilik slider çalışsın diye: 0-100 arası çalışır.
              audioElement.volume = vol === 0 ? 0 : Math.min(vol / 100, 1.0);
          }
      });
  };

  useEffect(() => { applyVolumeSettings(); }, [userVolumes]);

  // 🟢 KENDİ INPUT VOLUME (GÜÇLÜ GAIN)
  useEffect(() => {
      if (inputGainNodeRef.current && audioContextRef.current) {
          let gainValue = 1.0;
          if (inputVolume === 0) gainValue = 0;
          else if (inputVolume <= 100) gainValue = inputVolume / 100;
          else gainValue = 1.0 + ((inputVolume - 100) / 30); // 200'de 4.3 kat ses!

          inputGainNodeRef.current.gain.setTargetAtTime(gainValue, audioContextRef.current.currentTime, 0.05);
      }
  }, [inputVolume]);

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
  // 🎛️ SES İŞLEME MOTORU (TELSİZ MODU)
  // ----------------------------------------------------------------
  const processAudioStream = async (rawStream) => {
      try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return rawStream;

          const audioCtx = new AudioContext();
          if (audioCtx.state === 'suspended') await audioCtx.resume();

          const source = audioCtx.createMediaStreamSource(rawStream);
          const destination = audioCtx.createMediaStreamDestination();

          // 1. INPUT GAIN (Ses Seviyesi)
          const inputGain = audioCtx.createGain();
          const startVol = inputVolume > 100 ? 1.0 + ((inputVolume - 100) / 30) : inputVolume / 100;
          inputGain.gain.value = inputVolume === 0 ? 0 : startVol;
          inputGainNodeRef.current = inputGain;

          let currentNode = source;
          currentNode.connect(inputGain);
          currentNode = inputGain;

          if (isNoiseSuppression) {
              // 🟢 ASKERİ TELSİZ FİLTRESİ

              // 1. High-Pass (Bas gürültüleri kes)
              const highPass = audioCtx.createBiquadFilter();
              highPass.type = 'highpass';
              highPass.frequency.value = LOW_CUT_FREQ;
              highPass.Q.value = 0.5;

              // 2. Low-Pass (Tıslama ve cızırtıları kes)
              const lowPass = audioCtx.createBiquadFilter();
              lowPass.type = 'lowpass';
              lowPass.frequency.value = HIGH_CUT_FREQ;
              lowPass.Q.value = 0.5;

              // 3. Compressor (Sesi dengeler, patlamaları önler)
              const compressor = audioCtx.createDynamicsCompressor();
              compressor.threshold.value = -30;
              compressor.knee.value = 40;
              compressor.ratio.value = 12;
              compressor.attack.value = 0.003;
              compressor.release.value = 0.25;

              // 4. Noise Gate (Sert Kapanış)
              const gateGain = audioCtx.createGain();
              gateGain.gain.value = 0;
              gateGainNodeRef.current = gateGain;

              // Bağlantı
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
      } catch (e) {
          console.error("Ses işleme hatası:", e);
          return rawStream;
      }
  };

  const startGateAnalysis = (analyser, gateGainNode, audioCtx, rawStreamForSimpleMode = null) => {
      // Basit Mod (Mobil vb.)
      if (rawStreamForSimpleMode) {
           try {
               const simpleCtx = new AudioContext();
               const simpleAnalyser = simpleCtx.createAnalyser();
               const simpleSrc = simpleCtx.createMediaStreamSource(rawStreamForSimpleMode);
               simpleSrc.connect(simpleAnalyser);
               const checkLoop = () => {
                   if (simpleCtx.state === 'closed') return;
                   if (inputMode === 'PUSH_TO_TALK' && !isPTTPressedRef.current) { updateSpeakingStatus(false); requestAnimationFrame(checkLoop); return; }
                   const arr = new Uint8Array(simpleAnalyser.frequencyBinCount);
                   simpleAnalyser.getByteFrequencyData(arr);
                   let sum = 0; for(let i=0; i<arr.length; i++) sum+=arr[i];
                   updateSpeakingStatus((sum/arr.length) > 10);
                   requestAnimationFrame(checkLoop);
               }; checkLoop();
           } catch(e){} return;
      }

      analyser.fftSize = 512;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
          if (!gateGainNode || audioCtx.state === 'closed') return;

          if (inputMode === 'PUSH_TO_TALK' && !isPTTPressedRef.current) {
              gateGainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
              updateSpeakingStatus(false);
              requestAnimationFrame(checkVolume);
              return;
          }

          analyser.getByteFrequencyData(dataArray);
          let sum = 0; let count = 0;
          for (let i = 5; i < 60 && i < bufferLength; i++) { sum += dataArray[i]; count++; }
          const average = count > 0 ? sum / count : 0;
          const normalizedVol = average / 255;

          if (normalizedVol > GATE_THRESHOLD) {
              gateGainNode.gain.setTargetAtTime(1, audioCtx.currentTime, 0.02);
              updateSpeakingStatus(true);
          } else {
              gateGainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.15);
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

  const stopAudioAnalysis = () => {
      isSpeakingRef.current = false;
  };

  const cleanupMediaOnly = () => {
      Object.keys(peersRef.current).forEach(id => {
          peersRef.current[id]?.destroy();
          audioElementsRef.current[id]?.remove();
      });
      peersRef.current = {};
      audioElementsRef.current = {};
      socketUserMapRef.current = {}; // Haritayı temizle
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
      // 🟢 GÜRÜLTÜ ENGELLEME İÇİN ÖZEL CONSTRAINTS
      const constraints = {
          audio: {
            deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
            // Eğer Gürültü Engelleme AÇIKSA -> Tarayıcınınkini de aç (Çift Koruma)
            // Eğer KAPALIYSA -> Tarayıcınınkini de kapat (Saf Ses)
            echoCancellation: !!isNoiseSuppression,
            noiseSuppression: !!isNoiseSuppression,
            autoGainControl: !!isNoiseSuppression,
          },
          video: false
      };

      let rawStream;
      try {
          rawStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (advancedErr) {
          console.warn("Gelişmiş mod başarısız, basit moda geçiliyor...", advancedErr);
          rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }

      localStreamRef.current = rawStream;

      let streamToSend = await processAudioStream(rawStream);
      processedStreamRef.current = streamToSend;

      const shouldEnable = !isMicMuted;
      rawStream.getAudioTracks().forEach(track => { track.enabled = shouldEnable; });
      streamToSend.getAudioTracks().forEach(track => { track.enabled = shouldEnable; });

      if (!isNoiseSuppression) startGateAnalysis(null, null, null, rawStream);

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

  // 🟢 UserID Eşleşmesini Garantiye Al
  const handleUserJoined = ({ socketId, userId }) => {
      if (userId) socketUserMapRef.current[socketId] = userId;

      const stream = processedStreamRef.current || localStreamRef.current;
      const streams = [stream, myScreenStream].filter(Boolean);
      createPeer(socketId, true, streams, userId);
  };

  const handleOffer = ({ socketId, sdp, userId }) => { // Backendden userId gelmeli
      if (userId) socketUserMapRef.current[socketId] = userId;

      if(peersRef.current[socketId]) peersRef.current[socketId].destroy();
      const streamToSend = processedStreamRef.current || localStreamRef.current;
      const streams = [streamToSend, myScreenStream].filter(Boolean);
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
      setPeersWithVideo(prev => { const n={...prev}; delete n[socketId]; return n; });
  };

  const createPeer = (targetSocketId, initiator, streams = [], userId = null) => {
    const p = new Peer({ initiator, trickle: false, streams, config: rtcConfig });

    p.on('signal', data => {
        socketRef.current?.emit(initiator ? 'webrtc-offer' : 'webrtc-answer', {
            targetSocketId,
            sdp: data,
            userId: user?.id // Kendi ID'ni gönder
        });
    });

    p.on('stream', stream => handleRemoteStream(stream, targetSocketId, userId));
    peersRef.current[targetSocketId] = p;
    return p;
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

          if (outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(()=>{});
          audioElementsRef.current[socketId] = audio;

          // Akış geldiği an ses ayarını uygula
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