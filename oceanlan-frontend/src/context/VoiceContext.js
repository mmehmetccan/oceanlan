// src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { AuthContext } from './AuthContext';
import { AudioSettingsContext } from './AudioSettingsContext';
import { ToastContext } from './ToastContext';

export const VoiceContext = createContext();

// WebRTC Bağlantı Ayarları
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ],
};

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);

  // Referanslar
  const peersRef = useRef({});
  const localStreamRef = useRef(null);     // Ham mikrofon sesi
  const processedStreamRef = useRef(null); // İşlenmiş (Gürültü engellenmiş) ses
  const audioElementsRef = useRef({});

  // Ses Analizi ve İşleme
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const checkIntervalRef = useRef(null);
  const isSpeakingRef = useRef(false);

  const { user, token } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const audioSettings = useContext(AudioSettingsContext);

  // Ayarları güvenli al
  const { inputDeviceId, outputDeviceId, isMicMuted, isDeafened, userVolumes, isNoiseSuppression } = audioSettings || {};

  // State'ler
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

  // 1. SOCKET BAĞLANTISI
  useEffect(() => {
    if (!token || socketRef.current) return;

    const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;
    const isProductionUrl = window.location.hostname.includes('oceanlan.com');
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    let backendUrl = 'http://localhost:4000';
    if (isElectron || isProductionUrl) {
        backendUrl = 'https://oceanlan.com';
    } else if (!isLocalhost) {
        backendUrl = `http://${window.location.hostname}:4000`;
    }

    socketRef.current = io(backendUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
      secure: true,
      reconnection: true,
      autoConnect: true,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('[SOCKET] Voice Connected:', socket.id);
      setIsConnected(true);
      if (stayConnected && currentVoiceChannelId) rejoinChannel();
    });

    socket.on('disconnect', () => setIsConnected(false));

    // WebRTC Sinyalleri
    socket.on('user-joined-voice', handleUserJoined);
    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIce);
    socket.on('user-left-voice', handleUserLeft);
    socket.on('voice-channel-moved', handleChannelMoved);

    // Konuşma Göstergesi
    socket.on('user-speaking-change', ({ userId, isSpeaking }) => {
        setSpeakingUsers(prev => ({ ...prev, [userId]: isSpeaking }));
    });

    return () => {};
  }, [token]);

  // 🔊 2. SES İŞLEME VE GÜRÜLTÜ FİLTRESİ
  const processAudioStream = async (rawStream) => {
      // Eğer gürültü engelleme kapalıysa veya AudioContext yoksa ham sesi döndür
      if (!isNoiseSuppression) return rawStream;

      try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return rawStream;

          const audioCtx = new AudioContext();
          if (audioCtx.state === 'suspended') await audioCtx.resume();

          const source = audioCtx.createMediaStreamSource(rawStream);
          const destination = audioCtx.createMediaStreamDestination();

          // A) Highpass Filter (Düşük frekanslı uğultuları keser - Klima, fan sesi vb.)
          const highPassFilter = audioCtx.createBiquadFilter();
          highPassFilter.type = 'highpass';
          highPassFilter.frequency.value = 100; // 100Hz altını kes
          highPassFilter.Q.value = 0.7;

          // B) Compressor (Ani ses patlamalarını ve dip gürültüsünü dengeler)
          const compressor = audioCtx.createDynamicsCompressor();
          compressor.threshold.value = -50;
          compressor.knee.value = 40;
          compressor.ratio.value = 12;
          compressor.attack.value = 0;
          compressor.release.value = 0.25;

          // Bağlantıyı Kur: Kaynak -> Filtre -> Kompresör -> Çıkış
          source.connect(highPassFilter);
          highPassFilter.connect(compressor);
          compressor.connect(destination);

          audioContextRef.current = audioCtx;
          return destination.stream;
      } catch (e) {
          console.error("Ses işleme hatası:", e);
          return rawStream;
      }
  };

  // 🎙️ 3. KONUŞMA ANALİZİ (Yeşil Çerçeve İçin)
  const startAudioAnalysis = async (stream) => {
      try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return;

          // Mevcut context varsa onu kullan, yoksa yeni aç
          let audioCtx = audioContextRef.current;
          if (!audioCtx) {
              audioCtx = new AudioContext();
              audioContextRef.current = audioCtx;
          }
          if (audioCtx.state === 'suspended') await audioCtx.resume();

          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256; // Daha küçük FFT daha hızlı tepki verir

          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);

          analyserRef.current = analyser;

          if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);

          checkIntervalRef.current = setInterval(() => {
              if (isMicMuted || !analyserRef.current || audioCtx.state === 'closed') {
                  updateSpeakingStatus(false);
                  return;
              }

              const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
              analyserRef.current.getByteFrequencyData(dataArray);

              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              const average = sum / dataArray.length;

              // Eşik değeri (Hassasiyet)
              const threshold = 15;
              updateSpeakingStatus(average > threshold);
          }, 100);

      } catch (e) { console.error("Analiz hatası:", e); }
  };

  const updateSpeakingStatus = (isSpeaking) => {
      if (isSpeakingRef.current !== isSpeaking) {
          isSpeakingRef.current = isSpeaking;
          if (currentServerId && user) {
              const event = isSpeaking ? 'speaking-start' : 'speaking-stop';
              socketRef.current?.emit(event, { serverId: currentServerId, userId: user.id });
          }
          if (user) setSpeakingUsers(prev => ({ ...prev, [user.id]: isSpeaking }));
      }
  };

  // Temizlik Fonksiyonu
  const cleanupMediaOnly = () => {
      Object.keys(peersRef.current).forEach(id => { peersRef.current[id]?.destroy(); audioElementsRef.current[id]?.remove(); });
      peersRef.current = {};
      audioElementsRef.current = {};
      setPeersWithVideo({});
      setSpeakingUsers({});

      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
      isSpeakingRef.current = false;

      if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
      if (processedStreamRef.current) { processedStreamRef.current = null; }
      if (myScreenStream) { myScreenStream.getTracks().forEach(t => t.stop()); setMyScreenStream(null); }
      if (audioContextRef.current) { audioContextRef.current.close().catch(()=>{}); audioContextRef.current = null; }
  };

  const handleChannelMoved = ({ newChannelId, serverId, channelName }) => {
    cleanupMediaOnly(); setCurrentVoiceChannelId(newChannelId); setCurrentServerId(serverId);
    if(channelName) setCurrentVoiceChannelName(channelName);
    joinVoiceChannel(serverId, newChannelId);
  };

  // ----------------------------------------------------------------
  // JOIN VOICE CHANNEL (GÜÇLÜ GÜRÜLTÜ ENGELLEME AYARLARI)
  // ----------------------------------------------------------------
  const joinVoiceChannel = async (server, channel) => {
    const sId = server._id || server;
    const cId = channel._id || channel;

    // HTTPS Kontrolü
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        alert("Mikrofon için HTTPS gereklidir!");
        return;
    }

    if (currentVoiceChannelId === cId) return;
    if (currentVoiceChannelId) { cleanupMediaOnly(); socketRef.current?.emit('leave-voice-channel'); }

    setCurrentVoiceChannelId(cId); setCurrentServerId(sId); setStayConnected(true);
    if(server.name) setCurrentServerName(server.name);
    if(channel.name) setCurrentVoiceChannelName(channel.name);

    try {
      let rawStream;

      // 🛡️ 1. GÜRÜLTÜ ENGELLEME ZORLAYAN AYARLAR
      const constraints = {
          audio: {
              deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
              // Standart WebRTC Ayarları
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              // Chrome Özel Ayarları (Zorla Aç)
              googEchoCancellation: true,
              googAutoGainControl: true,
              googNoiseSuppression: true,
              googHighpassFilter: true
          },
          video: false
      };

      try {
          rawStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err1) {
          console.warn("Gelişmiş ayarlar başarısız, standart mod deneniyor...");
          // Yedek Mod: Sadece ses iste, ayar verme (Mobilde çalışması için)
          rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }

      localStreamRef.current = rawStream;

      // 🎛️ Yazılımsal Filtre Uygula (Eğer ayar açıksa)
      let streamToSend = rawStream;
      if (isNoiseSuppression) {
          streamToSend = await processAudioStream(rawStream);
      }
      processedStreamRef.current = streamToSend;

      // Mute Durumunu Uygula
      rawStream.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; });
      streamToSend.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; });

      // Konuşma Analizini Başlat (Yeşil Çerçeve)
      startAudioAnalysis(streamToSend);

      socketRef.current.emit('join-voice-channel', {
        serverId: sId, channelId: cId, userId: user?._id || user?.id, username: user?.username
      });

    } catch (err) {
      console.error("Mikrofon hatası:", err);
      setMicError("Mikrofon hatası");
      addToast("Mikrofon açılamadı. İzinleri kontrol edin.", "error");
    }
  };

  const leaveVoiceChannel = () => {
    setStayConnected(false); setCurrentVoiceChannelId(null); setCurrentServerId(null);
    socketRef.current?.emit('leave-voice-channel'); cleanupMediaOnly();
  };
  const rejoinChannel = () => {};

  // ----------------------------------------------------------------
  // WEBRTC PEER MANAGEMENT
  // ----------------------------------------------------------------
  const handleUserJoined = ({ socketId }) => {
      // Hangi stream'i göndereceğiz? (İşlenmiş veya Ham)
      const stream = processedStreamRef.current || localStreamRef.current;
      const streams = [stream, myScreenStream].filter(Boolean);
      createPeer(socketId, true, streams);
  };

  const handleOffer = ({ socketId, sdp }) => {
      if(peersRef.current[socketId]) peersRef.current[socketId].destroy();
      const stream = processedStreamRef.current || localStreamRef.current;
      const streams = [stream, myScreenStream].filter(Boolean);
      const p = createPeer(socketId, false, streams); p.signal(sdp);
  };

  const handleAnswer = ({ socketId, sdp }) => peersRef.current[socketId]?.signal(sdp);
  const handleIce = ({ socketId, candidate }) => peersRef.current[socketId]?.signal(candidate);

  const handleUserLeft = ({ socketId }) => {
      peersRef.current[socketId]?.destroy();
      delete peersRef.current[socketId];
      audioElementsRef.current[socketId]?.remove();
      delete audioElementsRef.current[socketId];
      setPeersWithVideo(prev => { const n={...prev}; delete n[socketId]; return n; });
  };

  const createPeer = (targetSocketId, initiator, streams = []) => {
      const p = new Peer({
          initiator,
          trickle: false,
          streams,
          config: rtcConfig
      });

      p.on('signal', data => socketRef.current?.emit(initiator ? 'webrtc-offer' : 'webrtc-answer', { targetSocketId, sdp: data }));
      p.on('stream', stream => handleRemoteStream(stream, targetSocketId));

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
      }
  };

  const startScreenShare = async (electronSourceId = null) => {
      try {
          let stream;
          if (window.electronAPI && electronSourceId) {
              stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: electronSourceId } } });
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

  useEffect(() => {
      if (!audioElementsRef.current) return;
      Object.values(audioElementsRef.current).forEach((audio) => {
          if (!audio) return;
          audio.muted = isDeafened;
          if(outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(e=>{});
      });
  }, [isDeafened, outputDeviceId, userVolumes]);

  useEffect(() => {
      // Mute işlemini hem ham hem de işlenmiş stream'e uygula
      const applyMute = (stream) => {
          if(stream) stream.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; });
      };

      applyMute(localStreamRef.current);
      applyMute(processedStreamRef.current);

  }, [isMicMuted]);

  return (
    <VoiceContext.Provider value={{
      socket: socketRef.current, isConnected, currentVoiceChannelId, currentServerId, currentVoiceChannelName, currentServerName, joinVoiceChannel, leaveVoiceChannel, speakingUsers, micError, stayConnected, peersWithVideo, myScreenStream, startScreenShare, stopScreenShare
    }}>
      {children}
    </VoiceContext.Provider>
  );
};