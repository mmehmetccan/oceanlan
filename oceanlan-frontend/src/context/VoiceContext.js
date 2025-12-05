import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { AuthContext } from './AuthContext';
import { AudioSettingsContext } from './AudioSettingsContext';

export const VoiceContext = createContext();

// RTC Config
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);

  // 🛡️ ÖNEMLİ: Başlangıç değerlerini kesinlikle {} (boş obje) olarak veriyoruz
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const audioElementsRef = useRef({});

  const { user, token } = useContext(AuthContext);

  // AudioSettingsContext'ten gelen verilerin undefined olmadığından emin olalım
  const audioSettings = useContext(AudioSettingsContext);
  const inputDeviceId = audioSettings?.inputDeviceId;
  const outputDeviceId = audioSettings?.outputDeviceId;
  const isMicMuted = audioSettings?.isMicMuted;
  const isDeafened = audioSettings?.isDeafened;
  const userVolumes = audioSettings?.userVolumes;

  const [isConnected, setIsConnected] = useState(false);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);
  const [currentServerId, setCurrentServerId] = useState(null);
  const [speakingUsers, setSpeakingUsers] = useState({});
  const [micError, setMicError] = useState(null);
  const [stayConnected, setStayConnected] = useState(false);

  // ----------------------------------------------------------------
  // 1. SOCKET BAĞLANTISI
  // ----------------------------------------------------------------
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
        rejoinChannel(); // Fonksiyon aşağıda tanımlı
      }
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('user-joined-voice', (data) => handleUserJoined(data));
    socket.on('webrtc-offer', (data) => handleOffer(data));
    socket.on('webrtc-answer', (data) => handleAnswer(data));
    socket.on('webrtc-ice-candidate', (data) => handleIce(data));
    socket.on('user-left-voice', (data) => handleUserLeft(data));

    return () => { };
  }, [token]);

  // ----------------------------------------------------------------
  // 2. WEBRTC MANTIĞI
  // ----------------------------------------------------------------

  const handleUserJoined = ({ socketId }) => {
    createPeer(socketId, socketRef.current?.id, true, localStreamRef.current);
  };

  const handleOffer = ({ socketId, sdp }) => {
    const p = createPeer(socketId, null, false, localStreamRef.current);
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
    // 🛡️ GÜVENLİK KONTROLÜ
    if (peersRef.current && peersRef.current[socketId]) {
      peersRef.current[socketId].destroy();
      delete peersRef.current[socketId];
    }
    if (audioElementsRef.current && audioElementsRef.current[socketId]) {
      audioElementsRef.current[socketId].remove();
      delete audioElementsRef.current[socketId];
    }
  };

  const createPeer = (targetSocketId, myId, initiator, stream) => {
    // 🛡️ GÜVENLİK KONTROLÜ
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
    // 🛡️ GÜVENLİK KONTROLÜ
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
  };

  // ----------------------------------------------------------------
  // 3. KANALA KATIL / AYRIL
  // ----------------------------------------------------------------
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

    // 🛡️ KRİTİK DÜZELTME: Object.values kullanırken null kontrolü
    if (peersRef.current) {
        Object.values(peersRef.current).forEach(p => p.destroy());
        peersRef.current = {};
    }

    if (audioElementsRef.current) {
        Object.values(audioElementsRef.current).forEach(a => a.remove());
        audioElementsRef.current = {};
    }
  };

  const rejoinChannel = () => {
      // Rejoin mantığı
  };

  // ----------------------------------------------------------------
  // 4. SES AYARLARI DİNLEYİCİSİ (Hatanın Kaynağı Olabilir)
  // ----------------------------------------------------------------
  useEffect(() => {
      // 🛡️ Bu kontrol olmazsa, audioElementsRef null iken Object.entries patlar
      if (!audioElementsRef.current) return;

      Object.entries(audioElementsRef.current).forEach(([id, audio]) => {
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
      stayConnected
    }}>
      {children}
    </VoiceContext.Provider>
  );
};