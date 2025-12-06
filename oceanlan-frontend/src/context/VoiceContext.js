// src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { AuthContext } from './AuthContext';
import { AudioSettingsContext } from './AudioSettingsContext';

export const VoiceContext = createContext();

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);

  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const audioElementsRef = useRef({});

  // Ses Analiz Refleri
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const checkIntervalRef = useRef(null);
  const isSpeakingRef = useRef(false);

  const { user, token } = useContext(AuthContext);
  const audioSettings = useContext(AudioSettingsContext);
  const { inputDeviceId, outputDeviceId, isMicMuted, isDeafened, userVolumes } = audioSettings || {};

  // --- STATES ---
  const [isConnected, setIsConnected] = useState(false);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);
  const [currentServerId, setCurrentServerId] = useState(null);
  const [currentVoiceChannelName, setCurrentVoiceChannelName] = useState(null);
  const [currentServerName, setCurrentServerName] = useState(null);

  // 🟢 KONUŞANLAR LİSTESİ: { "userId": true, "baskaUserId": false }
  const [speakingUsers, setSpeakingUsers] = useState({});

  const [micError, setMicError] = useState(null);
  const [stayConnected, setStayConnected] = useState(false);
  const [peersWithVideo, setPeersWithVideo] = useState({});
  const [myScreenStream, setMyScreenStream] = useState(null);

  // 1. SOCKET BAĞLANTISI
  useEffect(() => {
    if (!token || socketRef.current) return;

    // 1. Electron Kontrolü (User Agent üzerinden)
    const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;

    // 2. Canlı Sunucu Kontrolü (Domain üzerinden)
    const isProductionUrl = window.location.hostname.includes('oceanlan.com');

    // 3. KARAR MEKANİZMASI:
    // Eğer Electron ise VEYA Web'de oceanlan.com üzerindeysek -> CANLIYA BAĞLAN
    // Sadece tarayıcıda localhost'taysak -> LOCALHOST'A BAĞLAN
    const backendUrl = (isElectron || isProductionUrl)
        ? 'https://oceanlan.com'
        : 'http://localhost:4000';

    console.log(`[VoiceContext] Hedef Sunucu: ${backendUrl} (Electron: ${isElectron})`);

    socketRef.current = io(backendUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
      secure: true, // Her zaman güvenli dene, localhost ise zaten http çalışır
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

    // 🟢 DİĞER KULLANICILARIN KONUŞMA DURUMUNU DİNLE
    socket.on('user-speaking-change', ({ userId, isSpeaking }) => {
        setSpeakingUsers(prev => ({
            ...prev,
            [userId]: isSpeaking // UserId anahtarı ile güncelle
        }));
    });

    return () => {};
  }, [token]);

  // ----------------------------------------------------------------
  // 🔊 MİKROFON ANALİZİ (YEŞİL IŞIK TETİKLEYİCİSİ)
  // ----------------------------------------------------------------
  const startAudioAnalysis = (stream) => {
      try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return;

          const audioCtx = new AudioContext();
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512; // Hassasiyet
          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);

          // Reflere kaydet
          audioContextRef.current = audioCtx;
          analyserRef.current = analyser;

          if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);

          checkIntervalRef.current = setInterval(() => {
              // Mute ise konuşmuyor say
              if (isMicMuted || !analyserRef.current) {
                  updateSpeakingStatus(false);
                  return;
              }

              const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
              analyserRef.current.getByteFrequencyData(dataArray);

              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              const average = sum / dataArray.length;

              // 🔥 EŞİK DEĞERİ: 10 (Çok hassas) - 20 (Normal) - 30 (Bağırmak lazım)
              // Eğer yeşil ışık hiç yanmıyorsa bu değeri DÜŞÜR (örn: 5 yap)
              const threshold = 10;

              const isNowSpeaking = average > threshold;
              updateSpeakingStatus(isNowSpeaking);

          }, 100); // 100ms gecikme ile kontrol

      } catch (e) {
          console.error("Analiz hatası:", e);
      }
  };

  const updateSpeakingStatus = (isSpeaking) => {
      if (isSpeakingRef.current !== isSpeaking) {
          isSpeakingRef.current = isSpeaking;

          // 1. Sunucuya bildir (Diğerleri görsün)
          if (currentServerId && user) {
              const event = isSpeaking ? 'speaking-start' : 'speaking-stop';
              socketRef.current?.emit(event, { serverId: currentServerId, userId: user.id });
          }

          // 2. Kendim de anında göreyim (Socket gecikmesini bekleme)
          if (user) {
              setSpeakingUsers(prev => ({ ...prev, [user.id]: isSpeaking }));
          }
      }
  };

  const stopAudioAnalysis = () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
      if (audioContextRef.current) {
          audioContextRef.current.close().catch(()=>{});
          audioContextRef.current = null;
      }
      isSpeakingRef.current = false;
  };

  // ----------------------------------------------------------------
  // TEMİZLİK VE YÖNETİM
  // ----------------------------------------------------------------
  const cleanupMediaOnly = () => {
      Object.keys(peersRef.current).forEach(id => {
          peersRef.current[id]?.destroy();
          audioElementsRef.current[id]?.remove();
      });
      peersRef.current = {};
      audioElementsRef.current = {};
      setPeersWithVideo({});
      setSpeakingUsers({});
      stopAudioAnalysis(); // Analizi durdur

      if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
          localStreamRef.current = null;
      }
      if (myScreenStream) {
          myScreenStream.getTracks().forEach(t => t.stop());
          setMyScreenStream(null);
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

    if (currentVoiceChannelId === cId) return;
    if (currentVoiceChannelId) {
        cleanupMediaOnly();
        socketRef.current?.emit('leave-voice-channel');
    }

    setCurrentVoiceChannelId(cId);
    setCurrentServerId(sId);
    setStayConnected(true);
    if(server.name) setCurrentServerName(server.name);
    if(channel.name) setCurrentVoiceChannelName(channel.name);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
          echoCancellation: true, noiseSuppression: true, autoGainControl: true
        },
        video: false
      });

      localStreamRef.current = stream;
      stream.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; });

      // 🎤 ANALİZİ BAŞLAT
      startAudioAnalysis(stream);

      socketRef.current.emit('join-voice-channel', {
        serverId: sId,
        channelId: cId,
        userId: user?._id || user?.id,
        username: user?.username
      });

    } catch (err) {
      console.error("Mikrofon hatası:", err);
      setMicError("Mikrofon hatası");
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

  // WebRTC
  const handleUserJoined = ({ socketId }) => {
    const streams = [localStreamRef.current, myScreenStream].filter(Boolean);
    createPeer(socketId, true, streams);
  };
  const handleOffer = ({ socketId, sdp }) => {
    if(peersRef.current[socketId]) peersRef.current[socketId].destroy();
    const streams = [localStreamRef.current, myScreenStream].filter(Boolean);
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
      // Konuşma listesinden silmek için userId bulmamız lazım ama socketId yeterli değil.
      // Basitlik adına tüm listeyi sıfırlamıyoruz, backend zaten güncel listeyi atıyor.
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
      if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; });
      }
  }, [isMicMuted]);

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
      speakingUsers, // 🟢 DOLU VERİ
      micError,
      stayConnected,
      peersWithVideo,
      myScreenStream,
      startScreenShare,
      stopScreenShare
    }}>
      {children}
    </VoiceContext.Provider>
  );
};