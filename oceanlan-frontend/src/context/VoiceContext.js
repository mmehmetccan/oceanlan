// src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer'; // 👈 Bu paketin kurulu olduğundan emin ol
import { AuthContext } from './AuthContext';
import { AudioSettingsContext } from './AudioSettingsContext';

export const VoiceContext = createContext();

// RTC Config (Google STUN sunucuları)
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);
  const peersRef = useRef({}); // Peer bağlantılarını burada tutacağız
  const localStreamRef = useRef(null);
  const audioElementsRef = useRef({}); // Gelen ses elementleri

  const { user, token } = useContext(AuthContext);
  // Ses ayarlarını buradan yönetiyoruz
  const { inputDeviceId, outputDeviceId, isMicMuted, isDeafened, userVolumes } = useContext(AudioSettingsContext);

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
        rejoinChannel();
      }
    });

    socket.on('disconnect', () => setIsConnected(false));

    // WebRTC Sinyal Dinleyicileri (Global)
    socket.on('user-joined-voice', handleUserJoined);
    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIce);
    socket.on('user-left-voice', handleUserLeft);

    return () => {
      // Cleanup yok, uygulama kapanana kadar açık kalsın
    };
  }, [token]);


  // ----------------------------------------------------------------
  // 2. WEBRTC MANTIĞI (Peer Yönetimi)
  // ----------------------------------------------------------------

  // A. Yeni biri gelince Peer oluştur (Initiator biziz)
  const handleUserJoined = ({ socketId }) => {
    createPeer(socketId, socketRef.current?.id, true, localStreamRef.current);
  };

  // B. Biri bize teklif atınca Peer oluştur (Initiator karşı taraf)
  const handleOffer = ({ socketId, sdp }) => {
    const p = createPeer(socketId, null, false, localStreamRef.current);
    p.signal(sdp);
  };

  // C. Cevap gelince sinyali işle
  const handleAnswer = ({ socketId, sdp }) => {
    if (peersRef.current[socketId]) {
      peersRef.current[socketId].signal(sdp);
    }
  };

  // D. ICE Adayı gelince
  const handleIce = ({ socketId, candidate }) => {
    if (peersRef.current[socketId]) {
      peersRef.current[socketId].signal(candidate);
    }
  };

  // E. Kullanıcı çıkınca temizle
  const handleUserLeft = ({ socketId }) => {
    if (peersRef.current[socketId]) {
      peersRef.current[socketId].destroy();
      delete peersRef.current[socketId];
    }
    if (audioElementsRef.current[socketId]) {
      audioElementsRef.current[socketId].remove();
      delete audioElementsRef.current[socketId];
    }
  };

  // Peer Oluşturucu Fonksiyon
  const createPeer = (targetSocketId, myId, initiator, stream) => {
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

  // Gelen Sesi Oynat
  const playRemoteStream = (stream, id) => {
    // Varsa sil
    if (audioElementsRef.current[id]) audioElementsRef.current[id].remove();

    const audio = document.createElement('audio');
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.playsInline = true;
    audio.style.display = 'none'; // Görünmez
    document.body.appendChild(audio); // DOM'a ekle ki çalışsın

    // Hoparlör seçimi (Output Device)
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
      // 1. Mikrofonu Al
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

      // Mikrofon ayarlarını uygula (Mute durumunu kontrol et)
      stream.getAudioTracks().forEach(track => {
          track.enabled = !isMicMuted;
      });

      // 2. State Güncelle
      setCurrentVoiceChannelId(cId);
      setCurrentServerId(sId);
      setStayConnected(true);

      // 3. Sunucuya Bildir
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

    // Socket'e bildir
    socketRef.current?.emit('leave-voice-channel');

    // Mikrofonu kapat
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    // Peerları kapat
    Object.values(peersRef.current).forEach(p => p.destroy());
    peersRef.current = {};

    // Sesleri temizle
    Object.values(audioElementsRef.current).forEach(a => a.remove());
    audioElementsRef.current = {};
  };

  const rejoinChannel = () => {
      // Bu fonksiyon sayfa yenilenirse çalışır, şimdilik basit tutalım.
      // Normal navigasyonda joinVoiceChannel içindeki stream zaten korunur.
  };

  // ----------------------------------------------------------------
  // 4. SES AYARLARI DİNLEYİCİSİ (Mute/Deafen/Device)
  // ----------------------------------------------------------------
  useEffect(() => {
      // Mikrofon Mute/Unmute
      if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(track => {
              track.enabled = !isMicMuted;
          });
      }
  }, [isMicMuted]);

  useEffect(() => {
      // Hoparlör Sağırlaştırma (Deafen) ve Ses Ayarı
      Object.entries(audioElementsRef.current).forEach(([id, audio]) => {
          audio.muted = isDeafened;
          // Volume ayarını buraya entegre edebilirsin (userVolumes kullanarak)
          if(outputDeviceId && typeof audio.setSinkId === 'function') {
              audio.setSinkId(outputDeviceId).catch(e=>{});
          }
      });
  }, [isDeafened, outputDeviceId, userVolumes]);


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