// src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from './AuthContext';

export const VoiceContext = createContext();

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);
  // App.jsx sıralamasını düzelttiğimiz için artık burada user dolu gelecek!
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

    // Backend URL'ini buraya yaz
    const backendUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';
    console.log("[VoiceContext] Socket başlatılıyor:", backendUrl);

    socketRef.current = io(backendUrl, {
      transports: ['polling', 'websocket'], // Polling + Websocket = Garanti bağlantı
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      autoConnect: true,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('[SOCKET] VoiceContext Bağlandı:', socket.id);
      setIsConnected(true);

      if (stayConnected && currentVoiceChannelId) {
        console.log('[SOCKET] Reconnect sonrası kanala tekrar giriliyor...');
        rejoinChannel();
      }
    });

    socket.on('disconnect', (reason) => {
      console.warn('[SOCKET] VoiceContext Koptu:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[SOCKET] Hata:', err.message);
    });

    socket.on('voice-channel-moved', ({ newChannelId, serverId }) => {
      console.log(`[VoiceContext] Taşındım: ${newChannelId}`);
      setCurrentVoiceChannelId(newChannelId);
      setCurrentServerId(serverId);
    });

  }, []);

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
      console.error('[LOG] Socket yok veya bağlı değil. Connect deneniyor...');
      socket?.connect();
      return;
    }

    const sId = server._id || server;
    const cId = channel._id || channel;

    if (currentVoiceChannelId === cId && isConnected) {
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

    console.log('[LOG] Kanala giriş:', payload);
    socket.emit('join-voice-channel', payload);
  };

  const leaveVoiceChannel = () => {
    setStayConnected(false);
    if (socketRef.current) socketRef.current.emit('leave-voice-channel');

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