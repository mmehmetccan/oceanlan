// src/context/VoiceContext.js
import React, { createContext, useState, useEffect ,useContext} from 'react';
import { useSocket } from '../hooks/useSocket';
import { AuthContext } from './AuthContext'; // yolun doğru olduğundan emin ol

export const VoiceContext = createContext();

export const VoiceProvider = ({ children }) => {
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);
  const [currentServerId, setCurrentServerId] = useState(null);

  // 📢 YENİ: İsimleri tutacak state'ler
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

  const [stayConnected, setStayConnected] = useState(false); // YENİ: Kalıcılık kontrolü


  const { socket } = useSocket();

  useEffect(() => {
      if(!socket) return;

      const handleVoiceMoved = ({ newChannelId, serverId }) => {
          console.log(`[VoiceContext] Taşındım: ${newChannelId}`);
          setCurrentVoiceChannelId(newChannelId);
          setCurrentServerId(serverId);
          // Taşınma durumunda isimleri güncellemek için backend'den veri gelmesi gerekir.
          // Şimdilik isimler eski kalabilir veya manuel tetiklenebilir.
      };

      socket.on('voice-channel-moved', handleVoiceMoved);

      return () => {
          socket.off('voice-channel-moved', handleVoiceMoved);
      };
  }, [socket]);


  useEffect(() => {
  return () => {
    if (!stayConnected) {
      leaveVoiceChannel();
    }
  };
}, [stayConnected]);

  useEffect(() => {
  if (stayConnected && currentVoiceChannelId && currentServerId && socket?.connected) {
    socket.emit('join-voice-channel', {
      serverId: currentServerId,
      channelId: currentVoiceChannelId
    });
    console.log('[SOCKET] Re-joined voice channel after reconnect:', currentVoiceChannelId);
  }
}, [stayConnected, currentVoiceChannelId, currentServerId, socket?.connected]);




  // 📢 GÜNCELLENDİ: Artık obje (isimli) veya sadece ID kabul ediyor
  const joinVoiceChannel = (server, channel) => {
  const sId = server._id || server;
  const cId = channel._id || channel;

  if (currentVoiceChannelId === cId) return;

  setCurrentVoiceChannelId(cId);
  setCurrentServerId(sId);
  setStayConnected(true);

  if (server.name) setCurrentServerName(server.name);
  if (channel.name) setCurrentVoiceChannelName(channel.name);

  // ✅ BACKEND'E SÖYLE: Bu kanala katıl
  if (socket) {
    socket.emit('join-voice-channel', {
    serverId: sId,
    channelId: cId,
    userId: user?._id || user?.id,
    username: user?.username,
    });
    console.log('[SOCKET] join-voice-channel emit edildi:', sId, cId);
  }
};


  const leaveVoiceChannel = () => {
  setStayConnected(false); // YENİ: Manuel çıkışta artık bağlantı koparılabilir

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
          const newStreams = { ...prev };
          delete newStreams[socketId];
          return newStreams;
      });
  };

  return (
    <VoiceContext.Provider value={{
        currentVoiceChannelId,
        currentServerId,
        currentVoiceChannelName, // 👈
        currentServerName,       // 👈
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

        isScreenPickerOpen,
        setScreenPickerOpen,
        screenShareCallback,
        setScreenShareCallback,

         stayConnected,          // ⬅️ BUNU EKLE
    setStayConnected
    }}>
      {children}
    </VoiceContext.Provider>
  );
};