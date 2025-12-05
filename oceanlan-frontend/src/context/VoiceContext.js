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
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const audioElementsRef = useRef({});
  const audioAnalyzersRef = useRef({});
  const localAudioContextRef = useRef(null);

  const { user, token } = useContext(AuthContext);
  const audioSettings = useContext(AudioSettingsContext);
  const { inputDeviceId, outputDeviceId, isMicMuted, isDeafened, userVolumes } = audioSettings || {};

  // STATES
  const [isConnected, setIsConnected] = useState(false);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);
  const [currentServerId, setCurrentServerId] = useState(null);
  const [currentVoiceChannelName, setCurrentVoiceChannelName] = useState(null);
  const [currentServerName, setCurrentServerName] = useState(null);
  const [speakingUsers, setSpeakingUsers] = useState({});
  const [micError, setMicError] = useState(null);
  const [stayConnected, setStayConnected] = useState(false);
  const [peersWithVideo, setPeersWithVideo] = useState({});
  const [myScreenStream, setMyScreenStream] = useState(null);

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
      if (stayConnected && currentVoiceChannelId) rejoinChannel();
    });

    socket.on('disconnect', () => setIsConnected(false));
    socket.on('user-joined-voice', handleUserJoined);
    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIce);
    socket.on('user-left-voice', handleUserLeft);
    socket.on('voice-channel-moved', handleChannelMoved);

    return () => {};
  }, [token]);

  const cleanupMediaOnly = () => {
      Object.keys(peersRef.current).forEach(socketId => {
          if (peersRef.current[socketId]) peersRef.current[socketId].destroy();
          if (audioElementsRef.current[socketId]) audioElementsRef.current[socketId].remove();
      });
      peersRef.current = {};
      audioElementsRef.current = {};
      setPeersWithVideo({});
      setSpeakingUsers({});
      if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
          localStreamRef.current = null;
      }
      if (myScreenStream) {
          myScreenStream.getTracks().forEach(t => t.stop());
          setMyScreenStream(null);
      }
      if (localAudioContextRef.current) {
          localAudioContextRef.current.close().catch(()=>{});
          localAudioContextRef.current = null;
      }
      audioAnalyzersRef.current = {};
  };

  const handleChannelMoved = ({ newChannelId, serverId }) => {
    console.log(`[VoiceContext] Admin tarafından taşındınız: ${newChannelId}`);

    // 1. Mevcut bağlantıları temizle (State'i sıfırlama)
    cleanupMediaOnly();

    // 2. Yeni ID'yi set et (UI anında güncellenir)
    setCurrentVoiceChannelId(newChannelId);
    setCurrentServerId(serverId);

    // 3. Yeni kanala otomatik katıl
    // (Join fonksiyonunu tekrar çağırmak yerine emit yapıyoruz çünkü socket zaten odalara girdi)
    joinVoiceChannel(serverId, newChannelId);
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

  useEffect(() => {
    const interval = setInterval(() => {
        const updates = {};
        let changed = false;
        Object.entries(audioAnalyzersRef.current).forEach(([id, { analyser, dataArray }]) => {
            if(!analyser) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const isSpeaking = (sum / dataArray.length) > 15;
            if (speakingUsers[id] !== isSpeaking) {
                updates[id] = isSpeaking;
                changed = true;
            } else {
                updates[id] = speakingUsers[id];
            }
        });
        if (changed) setSpeakingUsers(prev => ({ ...prev, ...updates }));
    }, 100);
    return () => clearInterval(interval);
  }, [speakingUsers]);

  const handleUserJoined = ({ socketId }) => {
    const streams = [localStreamRef.current, myScreenStream].filter(Boolean);
    createPeer(socketId, true, streams);
  };
  const handleOffer = ({ socketId, sdp }) => {
    cleanupConnection(socketId);
    const streams = [localStreamRef.current, myScreenStream].filter(Boolean);
    const p = createPeer(socketId, false, streams);
    p.signal(sdp);
  };
  const handleAnswer = ({ socketId, sdp }) => peersRef.current[socketId]?.signal(sdp);
  const handleIce = ({ socketId, candidate }) => peersRef.current[socketId]?.signal(candidate);

  const handleUserLeft = ({ socketId }) => cleanupConnection(socketId);

  const cleanupConnection = (socketId) => {
      if (peersRef.current[socketId]) {
          peersRef.current[socketId].destroy();
          delete peersRef.current[socketId];
      }
      if (audioElementsRef.current[socketId]) {
          audioElementsRef.current[socketId].remove();
          delete audioElementsRef.current[socketId];
      }
      if (audioAnalyzersRef.current[socketId]) delete audioAnalyzersRef.current[socketId];
      setPeersWithVideo(prev => { const n={...prev}; delete n[socketId]; return n; });
      setSpeakingUsers(prev => { const n={...prev}; delete n[socketId]; return n; });
  };

  const createPeer = (targetSocketId, initiator, streams = []) => {
    if (peersRef.current[targetSocketId] && !peersRef.current[targetSocketId].destroyed) return peersRef.current[targetSocketId];
    const p = new Peer({ initiator, trickle: false, streams, config: rtcConfig });
    p.on('signal', data => socketRef.current?.emit(initiator ? 'webrtc-offer' : 'webrtc-answer', { targetSocketId, sdp: data }));
    p.on('stream', stream => handleRemoteStream(stream, targetSocketId));
    p.on('error', () => cleanupConnection(targetSocketId));
    p.on('close', () => cleanupConnection(targetSocketId));
    peersRef.current[targetSocketId] = p;
    return p;
  };

  const handleRemoteStream = (stream, id) => {
    if (stream.getVideoTracks().length > 0) {
        setPeersWithVideo(prev => ({ ...prev, [id]: stream }));
    } else {
        if (audioElementsRef.current[id]) audioElementsRef.current[id].remove();
        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        if (outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(()=>{});
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
    } catch (err) {}
  };

  const stopScreenShare = () => {
      if (myScreenStream) {
          myScreenStream.getTracks().forEach(t => t.stop());
          Object.values(peersRef.current).forEach(p => { try { p.removeStream(myScreenStream); } catch(e){} });
          setMyScreenStream(null);
      }
  };

  const joinVoiceChannel = async (server, channel) => {
    const sId = server._id || server;
    const cId = channel._id || channel;

    if (currentVoiceChannelId === cId) return;

    if (currentVoiceChannelId) {
        cleanupMediaOnly();
        socketRef.current?.emit('leave-voice-channel');
    }

    setCurrentVoiceChannelId(cId);
    setCurrentServerId(sId);
    setStayConnected(true);
    if(server.name) setCurrentServerName(server.name);
    if(channel.name) setCurrentVoiceChannelName(channel.name);

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

      // 🟢 GÜVENLİK: Socket var mı diye bak, yoksa patlamasın
      if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('join-voice-channel', {
            serverId: sId,
            channelId: cId,
            userId: user?._id || user?.id,
            username: user?.username
          });
      } else {
          console.warn("[Voice] Socket bağlı değil, bağlanmaya çalışılıyor...");
          socketRef.current?.connect();
          // Bağlantı eventinde rejoinChannel çalışacak
      }

    } catch (err) {
      console.error("Mikrofon hatası:", err);
      setMicError("Mikrofon hatası");
    }
  };

  const leaveVoiceChannel = () => {
    setStayConnected(false);
    setCurrentVoiceChannelId(null);
    setCurrentServerId(null);
    socketRef.current?.emit('leave-voice-channel');
    cleanupMediaOnly();
  };

  const rejoinChannel = () => {};

  useEffect(() => {
      if (!audioElementsRef.current) return;
      Object.values(audioElementsRef.current).forEach((audio) => {
          if (!audio) return;
          audio.muted = isDeafened;
          if(outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(e=>{});
      });
  }, [isDeafened, outputDeviceId, userVolumes]);

  useEffect(() => {
      if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; });
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