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

  // Refler (Sayfa değişse de sıfırlanmaz)
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const audioElementsRef = useRef({});

  const { user, token } = useContext(AuthContext);

  // Ses ayarları
  const audioSettings = useContext(AudioSettingsContext);
  const inputDeviceId = audioSettings?.inputDeviceId;
  const outputDeviceId = audioSettings?.outputDeviceId;
  const isMicMuted = audioSettings?.isMicMuted;
  const isDeafened = audioSettings?.isDeafened;
  const userVolumes = audioSettings?.userVolumes;

  // --- STATE'LER ---
  const [isConnected, setIsConnected] = useState(false);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);
  const [currentServerId, setCurrentServerId] = useState(null);
  const [speakingUsers, setSpeakingUsers] = useState({});
  const [micError, setMicError] = useState(null);
  const [stayConnected, setStayConnected] = useState(false);

  // 🔴 EKSİK OLAN KISIMLAR EKLENDİ 👇
  const [incomingStreams, setIncomingStreams] = useState({});
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

    // Event dinleyicileri
    socket.on('user-joined-voice', (d) => handleUserJoined(d));
    socket.on('webrtc-offer', (d) => handleOffer(d));
    socket.on('webrtc-answer', (d) => handleAnswer(d));
    socket.on('webrtc-ice-candidate', (d) => handleIce(d));
    socket.on('user-left-voice', (d) => handleUserLeft(d));

    return () => { };
  }, [token]);

  // --- Yardımcı Stream Fonksiyonları ---
  const addIncomingStream = (socketId, stream) => {
    setIncomingStreams(prev => ({ ...prev, [socketId]: stream }));
  };

  const removeIncomingStream = (socketId) => {
    setIncomingStreams(prev => {
      const newState = { ...prev };
      delete newState[socketId];
      return newState;
    });
  };

  // --- WebRTC Mantığı ---

  const handleUserJoined = ({ socketId }) => {
    createPeer(socketId, true, localStreamRef.current);
  };

  const handleOffer = ({ socketId, sdp }) => {
    const p = createPeer(socketId, false, localStreamRef.current);
    p.signal(sdp);
  };

  const handleAnswer = ({ socketId, sdp }) => {
    if (peersRef.current && peersRef.current[socketId]) {
      peersRef.current[socketId].signal(sdp);
    }
  };

  const handleIce = ({ socketId, candidate }) => {
    if (peersRef.current && peersRef.current[socketId]) {
      peersRef.current[socketId].signal(candidate);
    }
  };

  const handleUserLeft = ({ socketId }) => {
    if (peersRef.current && peersRef.current[socketId]) {
      peersRef.current[socketId].destroy();
      delete peersRef.current[socketId];
    }
    if (audioElementsRef.current && audioElementsRef.current[socketId]) {
      audioElementsRef.current[socketId].remove();
      delete audioElementsRef.current[socketId];
    }
    // State'ten de sil
    removeIncomingStream(socketId);
  };

  const createPeer = (targetSocketId, initiator, stream) => {
    if (!peersRef.current) peersRef.current = {};
    if (peersRef.current[targetSocketId]) return peersRef.current[targetSocketId];

    const p = new Peer({
      initiator,
      trickle: false,
      stream: stream || undefined,
      config: rtcConfig
    });

    p.on('signal', data => {
      if (socketRef.current) {
        const type = initiator ? 'webrtc-offer' : 'webrtc-answer';
        socketRef.current.emit(type, { targetSocketId, sdp: data });
      }
    });

    p.on('stream', remoteStream => {
      playRemoteStream(remoteStream, targetSocketId);
    });

    peersRef.current[targetSocketId] = p;
    return p;
  };

  const playRemoteStream = (stream, id) => {
    // 1. DOM'a Audio Elementi Ekle (Duymak için)
    if (!audioElementsRef.current) audioElementsRef.current = {};
    if (audioElementsRef.current[id]) audioElementsRef.current[id].remove();

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

    // 2. State'e Ekle (Arayüzün görmesi için - Yeşil çerçeve vb.)
    addIncomingStream(id, stream);
  };

  // --- Kanala Katılma / Ayrılma ---

  const joinVoiceChannel = async (server, channel) => {
    const sId = server._id || server;
    const cId = channel._id || channel;

    if (currentVoiceChannelId === cId) return;

    try {
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

      setCurrentVoiceChannelId(cId);
      setCurrentServerId(sId);
      setStayConnected(true);

      socketRef.current.emit('join-voice-channel', {
        serverId: sId,
        channelId: cId,
        userId: user?._id || user?.id,
        username: user?.username
      });

    } catch (err) {
      console.error("Mikrofon hatası:", err);
      setMicError(err);
    }
  };

  const leaveVoiceChannel = () => {
    setStayConnected(false);
    setCurrentVoiceChannelId(null);
    setCurrentServerId(null);

    socketRef.current?.emit('leave-voice-channel');

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    if (peersRef.current) {
        Object.values(peersRef.current).forEach(p => p.destroy());
        peersRef.current = {};
    }
    if (audioElementsRef.current) {
        Object.values(audioElementsRef.current).forEach(a => a.remove());
        audioElementsRef.current = {};
    }
    // Stream state'lerini temizle
    setIncomingStreams({});
    setMyScreenStream(null);
  };

  const rejoinChannel = () => {
     // Sayfa yenilenirse çalışır
  };

  // --- Ses Ayarları Dinleyicisi ---
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
      joinVoiceChannel,
      leaveVoiceChannel,

      speakingUsers,
      micError,
      stayConnected,

      // 🔴 EKSİK OLAN BU KISIMLAR GERİ EKLENDİ 🔴
      incomingStreams,
      addIncomingStream,
      removeIncomingStream,
      myScreenStream,
      setMyScreenStream
    }}>
      {children}
    </VoiceContext.Provider>
  );
};