// src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './AuthContext';
import { useSocket } from '../hooks/useSocket'; // en üstte

export const VoiceContext = createContext();

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);
  const { user } = useContext(AuthContext);

  const [isConnected, setIsConnected] = useState(false);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);
  const [currentServerId, setCurrentServerId] = useState(null);

  // İsimlendirmeler
  const [currentVoiceChannelName, setCurrentVoiceChannelName] = useState(null);
  const [currentServerName, setCurrentServerName] = useState(null);

  // Stream ve Konuşma Durumları
  const [incomingStreams, setIncomingStreams] = useState({});
  const [myScreenStream, setMyScreenStream] = useState(null);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState({});
  const [micError, setMicError] = useState(null);

  // Ekran Paylaşımı
  const [isScreenPickerOpen, setScreenPickerOpen] = useState(false);
  const [screenShareCallback, setScreenShareCallback] = useState(null);
  const [stayConnected, setStayConnected] = useState(false);
const { socket } = useSocket(); // VoiceProvider içinde

  // 1. SOCKET BAĞLANTISI (Sayfa değişse de kopmaz)
  useEffect(() => {
    // Eğer zaten bir socket varsa tekrar yaratma (Singleton)
    if (socketRef.current) return;

    console.log("[VoiceContext] Socket başlatılıyor...");

    // Backend adresini buraya yaz
    socketRef.current = io('http://localhost:4000', {
      transports: ['websocket'], // Websocket'e zorla (polling yapmasın)
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('[SOCKET] Bağlandı:', socket.id);
      setIsConnected(true);

      // Eğer bağlantı kopup geri geldiyse ve bir kanalda olmamız gerekiyorsa:
      if (stayConnected && currentVoiceChannelId) {
        console.log('[SOCKET] Bağlantı geri geldi, kanala tekrar giriliyor...');
        rejoinChannel();
      }
    });

    socket.on('disconnect', (reason) => {
      console.warn('[SOCKET] Bağlantı koptu:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[SOCKET] Bağlantı hatası:', err.message);
    });

    // Ses kanalı taşıma eventi
    socket.on('voice-channel-moved', ({ newChannelId, serverId }) => {
      console.log(`[VoiceContext] Taşındım: ${newChannelId}`);
      setCurrentVoiceChannelId(newChannelId);
      setCurrentServerId(serverId);
    });

    // Cleanup YAPMIYORUZ. Uygulama kapanmadığı sürece socket açık kalsın.
    // Profil sayfasına gidince burası unmount olursa ses giderdi.
    // Artık main.jsx'te en tepede olduğu için unmount olmayacak.
  }, []);

  // Bağlantı kopup gelirse tekrar kanala sokan fonksiyon
  const rejoinChannel = () => {
    if (!socketRef.current || !currentVoiceChannelId) return;

    socket.emit('join-voice-channel', {
      serverId: currentServerId,
      channelId: currentVoiceChannelId,
      userId: user?._id || user?.id,
      username: user?.username,
    });
  };

  // 2. KANALA KATILMA
  const joinVoiceChannel = (server, channel) => {
    if (!socketRef.current) {
      console.error('[LOG] Socket yok, bağlanılamıyor.');
      return;
    }

    const sId = server._id || server;
    const cId = channel._id || channel;

    // Zaten aynı kanaldaysak işlem yapma
    if (currentVoiceChannelId === cId && isConnected) {
      console.log('[LOG] Zaten bu kanaldasın.');
      return;
    }

    // State güncelle
    setCurrentVoiceChannelId(cId);
    setCurrentServerId(sId);
    setStayConnected(true);
    if (server.name) setCurrentServerName(server.name);
    if (channel.name) setCurrentVoiceChannelName(channel.name);

    const payload = {
      serverId: sId,
      channelId: cId,
      userId: user?._id || user?.id,
      username: user?.username,
    };

    console.log('[LOG] Kanala katılıyorum:', payload);
    socket.emit('join-voice-channel', payload);
  };

  // 3. KANALDAN AYRILMA
  const leaveVoiceChannel = () => {
    console.log('[LOG] Kanaldan ayrılınıyor...');
    setStayConnected(false);

    if (socketRef.current) {
      socket.emit('leave-voice-channel');
    }

    setCurrentVoiceChannelId(null);
    setCurrentServerId(null);
    setCurrentVoiceChannelName(null);
    setCurrentServerName(null);

    // Streamleri temizle
    if (myScreenStream) {
      myScreenStream.getTracks().forEach(track => track.stop());
      setMyScreenStream(null);
    }
    setIncomingStreams({});
  };

  // Stream Yardımcıları
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

      myScreenStream,
      setMyScreenStream,
      incomingStreams,
      addIncomingStream,
      removeIncomingStream,

      isLocalSpeaking,
      setIsLocalSpeaking,
      speakingUsers,
      setSpeakingUsers,

      micError,
      setMicError,

      isScreenPickerOpen,
      setScreenPickerOpen,
      screenShareCallback,
      setScreenShareCallback,

      stayConnected,
      setStayConnected
    }}>
      {children}
    </VoiceContext.Provider>
  );
};