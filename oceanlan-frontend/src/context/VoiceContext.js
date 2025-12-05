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

  // Ses Analizi için
  const localAudioContextRef = useRef(null);
  const localAnalyserRef = useRef(null);
  const speakingIntervalRef = useRef(null);
  const isSpeakingRef = useRef(false); // Anlık durumu tutmak için ref

  const { user, token } = useContext(AuthContext);
  const audioSettings = useContext(AudioSettingsContext);
  const { inputDeviceId, outputDeviceId, isMicMuted, isDeafened, userVolumes } = audioSettings || {};

  // --- STATES ---
  const [isConnected, setIsConnected] = useState(false);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);
  const [currentServerId, setCurrentServerId] = useState(null);
  const [currentVoiceChannelName, setCurrentVoiceChannelName] = useState(null);
  const [currentServerName, setCurrentServerName] = useState(null);

  const [speakingUsers, setSpeakingUsers] = useState({}); // { userId: true/false }
  const [micError, setMicError] = useState(null);
  const [stayConnected, setStayConnected] = useState(false);

  const [peersWithVideo, setPeersWithVideo] = useState({});
  const [myScreenStream, setMyScreenStream] = useState(null);

  // 1. SOCKET BAĞLANTISI
  useEffect(() => {
    if (!token || socketRef.current) return;

    const isProduction = window.location.hostname.includes('oceanlan.com');
    const backendUrl = isProduction ? 'https://oceanlan.com' : 'http://localhost:4000';

    socketRef.current = io(backendUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
      secure: isProduction,
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

    // 🟢 GLOBAL KONUŞMA DİNLEYİCİSİ
    socket.on('user-speaking-change', ({ userId, isSpeaking }) => {
        setSpeakingUsers(prev => ({
            ...prev,
            [userId]: isSpeaking
        }));
    });

    return () => {};
  }, [token]);

  // ----------------------------------------------------------------
  // 🔊 SES ANALİZİ VE YAYINLAMA (YEŞİL IŞIK MOTORU)
  // ----------------------------------------------------------------
  const startLocalAudioAnalysis = (stream) => {
      try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return;

          const audioCtx = new AudioContext();
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512;
          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);

          localAudioContextRef.current = audioCtx;
          localAnalyserRef.current = analyser;

          // Döngüyü başlat
          if (speakingIntervalRef.current) clearInterval(speakingIntervalRef.current);

          speakingIntervalRef.current = setInterval(() => {
              // Mute isek analiz yapma
              if (isMicMuted || !localAnalyserRef.current) {
                  if (isSpeakingRef.current) {
                      isSpeakingRef.current = false;
                      socketRef.current?.emit('speaking-stop', { serverId: currentServerId, userId: user.id });
                  }
                  return;
              }

              const dataArray = new Uint8Array(localAnalyserRef.current.frequencyBinCount);
              localAnalyserRef.current.getByteFrequencyData(dataArray);

              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              const average = sum / dataArray.length;

              // Eşik Değeri (Hassasiyet)
              const threshold = 15;
              const isNowSpeaking = average > threshold;

              // Durum değiştiyse Socket'e bildir
              if (isSpeakingRef.current !== isNowSpeaking) {
                  isSpeakingRef.current = isNowSpeaking;
                  const event = isNowSpeaking ? 'speaking-start' : 'speaking-stop';
                  if (currentServerId && user) {
                      socketRef.current?.emit(event, { serverId: currentServerId, userId: user.id });
                  }
              }
          }, 100); // 100ms'de bir kontrol et

      } catch (e) {
          console.error("Analiz hatası:", e);
      }
  };

  const stopLocalAudioAnalysis = () => {
      if (speakingIntervalRef.current) clearInterval(speakingIntervalRef.current);
      if (localAudioContextRef.current) {
          localAudioContextRef.current.close().catch(()=>{});
          localAudioContextRef.current = null;
      }
      isSpeakingRef.current = false;
  };

  // ----------------------------------------------------------------
  // DİĞER FONKSİYONLAR (Move, Cleanup vb.)
  // ----------------------------------------------------------------

  const cleanupMediaOnly = () => {
      Object.keys(peersRef.current).forEach(id => {
          peersRef.current[id]?.destroy();
          audioElementsRef.current[id]?.remove();
      });
      peersRef.current = {};
      audioElementsRef.current = {};
      setPeersWithVideo({});
      setSpeakingUsers({}); // Listeyi sıfırla
      stopLocalAudioAnalysis(); // Analizi durdur

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
      startLocalAudioAnalysis(stream);

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

  // WebRTC Handlers
  const handleUserJoined = ({ socketId }) => {
    const streams = [localStreamRef.current, myScreenStream].filter(Boolean);
    createPeer(socketId, true, streams);
  };
  const handleOffer = ({ socketId, sdp }) => {
    if (peersRef.current[socketId]) peersRef.current[socketId].destroy();
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
      setSpeakingUsers(prev => { const n={...prev}; delete n[socketId]; return n; }); // Listeden sil
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
      speakingUsers,
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