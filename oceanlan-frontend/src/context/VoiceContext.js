// src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { AuthContext } from './AuthContext';
import { AudioSettingsContext } from './AudioSettingsContext';

export const VoiceContext = createContext();

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);

  // Refler
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const audioElementsRef = useRef({});

  // Ses Analiz Refleri
  const audioAnalyzersRef = useRef({});
  const localAudioContextRef = useRef(null);

  const { user, token } = useContext(AuthContext);
  const audioSettings = useContext(AudioSettingsContext);

  const { inputDeviceId, outputDeviceId, isMicMuted, isDeafened, userVolumes } = audioSettings || {};

  // --- STATES ---
  const [isConnected, setIsConnected] = useState(false);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);
  const [currentServerId, setCurrentServerId] = useState(null);
  const [currentVoiceChannelName, setCurrentVoiceChannelName] = useState(null);
  const [currentServerName, setCurrentServerName] = useState(null);

  const [speakingUsers, setSpeakingUsers] = useState({});
  const [micError, setMicError] = useState(null);
  const [stayConnected, setStayConnected] = useState(false);

  // Video State
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
      if (stayConnected && currentVoiceChannelId) {
        rejoinChannel();
      }
    });

    socket.on('disconnect', () => setIsConnected(false));

    // Eventler
    socket.on('user-joined-voice', handleUserJoined);
    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIce);
    socket.on('user-left-voice', handleUserLeft);
    socket.on('voice-channel-moved', handleChannelMoved);

    return () => {};
  }, [token]);

  // ----------------------------------------------------------------
  // 🧹 TEMİZLİK (CLEANUP)
  // ----------------------------------------------------------------
  const cleanupConnection = (socketId) => {
      if (peersRef.current[socketId]) {
          peersRef.current[socketId].destroy();
          delete peersRef.current[socketId];
      }
      if (audioElementsRef.current[socketId]) {
          const audio = audioElementsRef.current[socketId];
          audio.pause();
          audio.srcObject = null;
          audio.remove();
          delete audioElementsRef.current[socketId];
      }
      if (audioAnalyzersRef.current[socketId]) {
          delete audioAnalyzersRef.current[socketId];
      }
      setPeersWithVideo(prev => {
          const n = { ...prev };
          delete n[socketId];
          return n;
      });
      setSpeakingUsers(prev => {
          const n = { ...prev };
          delete n[socketId];
          return n;
      });
  };

  const destroyAllConnections = () => {
      Object.keys(peersRef.current).forEach(socketId => cleanupConnection(socketId));
      if (myScreenStream) {
          myScreenStream.getTracks().forEach(t => t.stop());
          setMyScreenStream(null);
      }
  };

  // ----------------------------------------------------------------
  // 2. LOGIC
  // ----------------------------------------------------------------

  const handleChannelMoved = ({ newChannelId, serverId, channelName }) => {
    destroyAllConnections();
    setCurrentVoiceChannelId(newChannelId);
    setCurrentServerId(serverId);
    if(channelName) setCurrentVoiceChannelName(channelName);
  };

  const setupAudioAnalysis = (stream, id) => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        audioAnalyzersRef.current[id] = { ctx: audioCtx, analyser, dataArray };
    } catch(e) {}
  };

  // Ses Analiz Döngüsü
  useEffect(() => {
    const interval = setInterval(() => {
        if (!audioAnalyzersRef.current) return;
        const updates = {};
        let changed = false;

        Object.entries(audioAnalyzersRef.current).forEach(([id, { analyser, dataArray }]) => {
            if(!analyser) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            const isSpeaking = avg > 15;

            if (speakingUsers[id] !== isSpeaking) {
                updates[id] = isSpeaking;
                changed = true;
            } else {
                updates[id] = speakingUsers[id];
            }
        });

        if (changed) {
            setSpeakingUsers(prev => ({ ...prev, ...updates }));
        }
    }, 100);

    return () => clearInterval(interval);
  }, [speakingUsers]);

  // ----------------------------------------------------------------
  // 3. WEBRTC HANDLERS
  // ----------------------------------------------------------------

  const handleUserJoined = ({ socketId }) => {
    const streamsToSend = [localStreamRef.current];
    if (myScreenStream) streamsToSend.push(myScreenStream);
    createPeer(socketId, true, streamsToSend.filter(s => s));
  };

  const handleOffer = ({ socketId, sdp }) => {
    cleanupConnection(socketId);
    const streamsToSend = [localStreamRef.current];
    if (myScreenStream) streamsToSend.push(myScreenStream);
    const p = createPeer(socketId, false, streamsToSend.filter(s => s));
    p.signal(sdp);
  };

  const handleAnswer = ({ socketId, sdp }) => peersRef.current[socketId]?.signal(sdp);
  const handleIce = ({ socketId, candidate }) => peersRef.current[socketId]?.signal(candidate);
  const handleUserLeft = ({ socketId }) => cleanupConnection(socketId);

  const createPeer = (targetSocketId, initiator, streams = []) => {
    if (peersRef.current[targetSocketId]) {
        if (!peersRef.current[targetSocketId].destroyed) return peersRef.current[targetSocketId];
        cleanupConnection(targetSocketId);
    }

    const p = new Peer({
      initiator,
      trickle: false,
      streams: streams,
      config: rtcConfig
    });

    p.on('signal', data => {
      if (socketRef.current) {
        const type = initiator ? 'webrtc-offer' : 'webrtc-answer';
        socketRef.current.emit(type, { targetSocketId, sdp: data });
      }
    });

    p.on('stream', remoteStream => handleRemoteStream(remoteStream, targetSocketId));

    p.on('error', (err) => {
        console.error(`Peer Error (${targetSocketId}):`, err);
        cleanupConnection(targetSocketId);
    });

    p.on('close', () => cleanupConnection(targetSocketId));

    peersRef.current[targetSocketId] = p;
    return p;
  };

  const handleRemoteStream = (stream, id) => {
    const isVideo = stream.getVideoTracks().length > 0;

    if (isVideo) {
        setPeersWithVideo(prev => ({ ...prev, [id]: stream }));
    } else {
        if (audioElementsRef.current[id]) {
             audioElementsRef.current[id].remove();
        }

        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.playsInline = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);

        if (outputDeviceId && typeof audio.setSinkId === 'function') {
            audio.setSinkId(outputDeviceId).catch(e => console.warn(e));
        }
        audioElementsRef.current[id] = audio;
        setupAudioAnalysis(stream, id);
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
    } catch (err) {
        console.error(err);
    }
  };

  const stopScreenShare = () => {
      if (myScreenStream) {
          myScreenStream.getTracks().forEach(t => t.stop());
          Object.values(peersRef.current).forEach(p => {
              try { p.removeStream(myScreenStream); } catch(e){}
          });
          setMyScreenStream(null);
      }
  };

  // ----------------------------------------------------------------
  // 5. JOIN / LEAVE (ANLIK GÜNCELLEME İÇİN REVİZE EDİLDİ)
  // ----------------------------------------------------------------
  const joinVoiceChannel = async (server, channel) => {
    const sId = server._id || server;
    const cId = channel._id || channel;

    if (currentVoiceChannelId === cId) return;

    if (currentVoiceChannelId) {
        leaveVoiceChannel();
    }

    // 🚀 DÜZELTME: Önce State'i güncelle (Arayüz anında değişsin)
    setCurrentVoiceChannelId(cId);
    setCurrentServerId(sId);
    setStayConnected(true);
    if(server.name) setCurrentServerName(server.name);
    if(channel.name) setCurrentVoiceChannelName(channel.name);

    // ⏳ AĞIR İŞLEM (Mikrofon) bundan sonra yapılır
    try {
      if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      localStreamRef.current = stream;
      stream.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; });

      if (user) setupAudioAnalysis(stream, user.id);

      // Socket'e bildir
      socketRef.current.emit('join-voice-channel', {
        serverId: sId,
        channelId: cId,
        userId: user?._id || user?.id,
        username: user?.username
      });

    } catch (err) {
      console.error("Mikrofon hatası:", err);
      setMicError("Mikrofon erişim hatası!");
      // Hata olursa geri alabiliriz veya sessizce hata gösterebiliriz
    }
  };

  const leaveVoiceChannel = () => {
    // 🚀 Çıkışta da anında güncelle
    setStayConnected(false);
    setCurrentVoiceChannelId(null);
    setCurrentServerId(null);
    setPeersWithVideo({});
    stopScreenShare();

    socketRef.current?.emit('leave-voice-channel');

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    destroyAllConnections();

    if (localAudioContextRef.current) {
        localAudioContextRef.current.close().catch(()=>{});
        localAudioContextRef.current = null;
    }
  };

  const rejoinChannel = () => {};

  // Ayar dinleyicileri
  useEffect(() => {
      if (!audioElementsRef.current) return;
      Object.values(audioElementsRef.current).forEach((audio) => {
          if (!audio) return;
          audio.muted = isDeafened;
          if(outputDeviceId && typeof audio.setSinkId === 'function') {
              audio.setSinkId(outputDeviceId).catch(e=>{});
          }
      });
  }, [isDeafened, outputDeviceId, userVolumes]);

  useEffect(() => {
      if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(track => {
              track.enabled = !isMicMuted;
          });
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