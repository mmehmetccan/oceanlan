// src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { io } from 'socket.io-client'; // useSocket yerine direkt io kullanıyoruz
import { AuthContext } from './AuthContext';

export const VoiceContext = createContext();

export const VoiceProvider = ({ children }) => {
  // Socket'i state yerine ref içinde tutuyoruz (Bağlantı kopmaması için kritik)
  const socketRef = useRef(null);

  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);
  const [currentServerId, setCurrentServerId] = useState(null);

  // İsim state'leri
  const [currentVoiceChannelName, setCurrentVoiceChannelName] = useState(null);
  const [currentServerName, setCurrentServerName] = useState(null);

  const [myScreenStream, setMyScreenStream] = useState(null);
  const [incomingStreams, setIncomingStreams] = useState({});
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);

  const [isScreenPickerOpen, setScreenPickerOpen] = useState(false);
  const [screenShareCallback, setScreenShareCallback] = useState(null);

  const [micError, setMicError] = useState(null);
  const { user } = useContext(AuthContext);

  const [speakingUsers, setSpeakingUsers] = useState({});
  const [stayConnected, setStayConnected] = useState(false);

  // 1. SOCKET BAĞLANTISINI BAŞLAT (Sayfa değişse de kopmaz)
  useEffect(() => {
    // Eğer socket yoksa oluştur
    if (!socketRef.current) {
      console.log("[VoiceContext] Socket başlatılıyor...");

      // Backend adresini buraya yaz (Loglarda 4000 portu görünüyordu)
      socketRef.current = io('http://localhost:4000', {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
      });

      const socket = socketRef.current;

      socket.on('connect', () => {
        console.log('[SOCKET] VoiceContext Bağlandı:', socket.id);
      });

      socket.on('voice-channel-moved', ({ newChannelId, serverId }) => {
        console.log(`[VoiceContext] Taşındım: ${newChannelId}`);
        setCurrentVoiceChannelId(newChannelId);
        setCurrentServerId(serverId);
      });

      socket.on('disconnect', () => {
        console.log('[SOCKET] Bağlantı koptu.');
      });
    }

    // Component tamamen yok olduğunda (Uygulama kapandığında) temizle
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // 2. KANAL KATILMA FONKSİYONU
  const joinVoiceChannel = (server, channel) => {
    console.log('[LOG] joinVoiceChannel çağrıldı', { server, channel });

    if (!socketRef.current) {
      console.error('[LOG] Socket henüz hazır değil!');
      return;
    }

    const sId = server._id || server;
    const cId = channel._id || channel;

    if (currentVoiceChannelId === cId) {
      console.log('[LOG] Zaten bu kanaldasın.');
      return;
    }

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

    console.log('[LOG] socket.emit -> join-voice-channel', payload);
    socketRef.current.emit('join-voice-channel', payload);
  };

  // 3. KANALDAN AYRILMA
  const leaveVoiceChannel = () => {
    setStayConnected(false);

    if (socketRef.current) {
      socketRef.current.emit('leave-voice-channel'); // Backend'de varsa tetikle
    }

    setCurrentVoiceChannelId(null);
    setCurrentServerId(null);
    setCurrentVoiceChannelName(null);
    setCurrentServerName(null);

    if (myScreenStream) {
      myScreenStream.getTracks().forEach(track => track.stop());
      setMyScreenStream(null);
    }
    setIncomingStreams({});
  };

  // 4. STREAM YÖNETİMİ
  const addIncomingStream = (socketId, stream) => {
    setIncomingStreams(prev => ({ ...prev, [socketId]: stream }));
  };

  const removeIncomingStream = (socketId) => {
    setIncomingStreams(prev => {
      const newStreams = { ...prev };
      delete newStreams[socketId];
      return newStreams;
    });
  };

  return (
    <VoiceContext.Provider value={{
      socket: socketRef.current, // Dışarıya ref'teki socketi veriyoruz
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