import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './AuthContext';

export const VoiceContext = createContext();

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);
  const { user } = useContext(AuthContext);

  const [isConnected, setIsConnected] = useState(false);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);
  const [currentServerId, setCurrentServerId] = useState(null);

  const [currentVoiceChannelName, setCurrentVoiceChannelName] = useState(null);
  const [currentServerName, setCurrentServerName] = useState(null);

  const [incomingStreams, setIncomingStreams] = useState({});
  const [myScreenStream, setMyScreenStream] = useState(null);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState({});
  const [micError, setMicError] = useState(null);

  const [isScreenPickerOpen, setScreenPickerOpen] = useState(false);
  const [screenShareCallback, setScreenShareCallback] = useState(null);

  const [stayConnected, setStayConnected] = useState(false);

  // 1. SOCKET BAĞLANTISI
  useEffect(() => {
    if (socketRef.current) return;

    // 🟢 KRİTİK AYAR BURASI 🟢
    // Tarayıcı adres çubuğuna bakar. "oceanlan.com" varsa canlı sunucuya bağlanır.
    const isProduction = window.location.hostname.includes('oceanlan.com');

    // Canlıdaysa https://oceanlan.com, değilse localhost:4000
    const backendUrl = isProduction
        ? 'https://oceanlan.com' 
        : 'http://localhost:4000';

    console.log(`[VoiceContext] Ortam: ${isProduction ? 'CANLI (Production)' : 'GELİŞTİRME (Local)'}`);
    console.log(`[VoiceContext] Bağlanılacak Adres: ${backendUrl}`);

    socketRef.current = io(backendUrl, {
      // Polling + Websocket kullanımı (Daha garanti bağlantı için)
      transports: ['polling', 'websocket'],
      // Canlı sunucuda HTTPS (Secure) olması önemlidir
      secure: isProduction,
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      autoConnect: true,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('[SOCKET] Bağlandı. ID:', socket.id);
      setIsConnected(true);

      // Kopup geri geldiyse odaya tekrar gir
      if (stayConnected && currentVoiceChannelId) {
        rejoinChannel();
      }
    });

    socket.on('disconnect', (reason) => {
      console.warn('[SOCKET] Bağlantı koptu:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[SOCKET] Bağlantı Hatası:', err.message);
    });

    socket.on('voice-channel-moved', ({ newChannelId, serverId }) => {
      setCurrentVoiceChannelId(newChannelId);
      setCurrentServerId(serverId);
    });

  }, []);

  // --- YARDIMCI FONKSİYONLAR ---

  const rejoinChannel = () => {
    if (!socketRef.current || !currentVoiceChannelId) return;
    socketRef.current.emit('join-voice-channel', {
      serverId: currentServerId,
      channelId: currentVoiceChannelId,
      userId: user?._id || user?.id,
      username: user?.username,
    });
  };

  const joinVoiceChannel = (server, channel) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected) {
        console.warn('[LOG] Socket bağlı değil, bağlanılıyor...');
        socket?.connect();
        // Hemen return etmiyoruz, emit'i deneyecek, olmazsa bufferlar
    }

    const sId = server._id || server;
    const cId = channel._id || channel;

    if (currentVoiceChannelId === cId && isConnected) return;

    setCurrentVoiceChannelId(cId);
    setCurrentServerId(sId);
    setStayConnected(true);

    if (server.name) setCurrentServerName(server.name);
    if (channel.name) setCurrentVoiceChannelName(channel.name);

    socket.emit('join-voice-channel', {
      serverId: sId,
      channelId: cId,
      userId: user?._id || user?.id,
      username: user?.username,
    });
  };

  const leaveVoiceChannel = () => {
    setStayConnected(false);
    if (socketRef.current) socketRef.current.emit('leave-voice-channel');
    setCurrentVoiceChannelId(null);
    setCurrentServerId(null);
    if (myScreenStream) {
      myScreenStream.getTracks().forEach(track => track.stop());
      setMyScreenStream(null);
    }
    setIncomingStreams({});
  };

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
      micError, setMicError,
      isScreenPickerOpen, setScreenPickerOpen,
      screenShareCallback, setScreenShareCallback,
      stayConnected, setStayConnected
    }}>
      {children}
    </VoiceContext.Provider>
  );
};