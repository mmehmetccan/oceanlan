import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './AuthContext';

export const VoiceContext = createContext();

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);

  // 1. TOKEN'I BURADAN ALIYORUZ
  const { user, token } = useContext(AuthContext);

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

  // 1. SOCKET BAĞLANTISI (Token değişirse yeniden bağlanır)
  useEffect(() => {
    // Eğer token yoksa socket açmaya çalışma (Login olmamış kullanıcı)
    if (!token) return;

    // Eğer socket zaten varsa ve bağlıysa dokunma, ama token değiştiyse yenilemek gerekebilir.
    // Şimdilik basitlik adına: Eğer socket varsa return ediyoruz.
    if (socketRef.current) return;

    const isProduction = window.location.hostname.includes('oceanlan.com');
    const backendUrl = isProduction
        ? 'https://oceanlan.com'
        : 'http://localhost:4000';

    console.log(`[VoiceContext] Bağlanılıyor: ${backendUrl}`);

    socketRef.current = io(backendUrl, {
      // 🟢 KRİTİK DÜZELTME: Token'ı buraya ekledik 🟢
      auth: { token: token },

      transports: ['polling', 'websocket'],
      secure: isProduction,
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      autoConnect: true,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('[SOCKET] Voice Bağlandı. ID:', socket.id);
      setIsConnected(true);

      if (stayConnected && currentVoiceChannelId) {
        rejoinChannel();
      }
    });

    // Backend authentication hatası verirse
    socket.on('connect_error', (err) => {
      console.error('[SOCKET] Bağlantı Hatası:', err.message); // Burada "Token not provided" hatasını göreceğiz
      setIsConnected(false);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[SOCKET] Bağlantı koptu:', reason);
      setIsConnected(false);
    });

    socket.on('voice-channel-moved', ({ newChannelId, serverId }) => {
      setCurrentVoiceChannelId(newChannelId);
      setCurrentServerId(serverId);
    });

    // Component unmount olduğunda veya token null olduğunda (logout) temizle
    return () => {
        // İsteğe bağlı: Logout olunca socket'i kapatabiliriz
        // if (socketRef.current) socketRef.current.disconnect();
    };

  }, [token]); // 👈 Token değişince (Login olunca) bu useEffect tekrar çalışır

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

    // Socket kopuksa tekrar bağlanmayı dene
    if (!socket || !socket.connected) {
        console.warn('[LOG] Socket bağlı değil. Bağlanmaya çalışılıyor...');
        socket?.connect();
    }

    const sId = server._id || server;
    const cId = channel._id || channel;

    if (currentVoiceChannelId === cId && isConnected) return;

    setCurrentVoiceChannelId(cId);
    setCurrentServerId(sId);
    setStayConnected(true);

    if (server.name) setCurrentServerName(server.name);
    if (channel.name) setCurrentVoiceChannelName(channel.name);

    // Emit ederken de garanti olsun
    if (socket) {
        socket.emit('join-voice-channel', {
        serverId: sId,
        channelId: cId,
        userId: user?._id || user?.id,
        username: user?.username,
        });
    }
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