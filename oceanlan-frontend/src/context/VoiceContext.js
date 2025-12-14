// src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { AuthContext } from './AuthContext';
import { AudioSettingsContext } from './AudioSettingsContext';
import { ToastContext } from './ToastContext';

export const VoiceContext = createContext();

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ],
};

// ⚙️ AGRESİF AYARLAR
const GATE_THRESHOLD = 0.05; // %5'in altındaki sesleri (nefes, tıkırtı) TAMAMEN SUSTUR
const FILTER_FREQ = 200;     // 200Hz altını (klima, fan, derin nefes) kes

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);

  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const audioElementsRef = useRef({});

  const audioContextRef = useRef(null);
  const gateGainNodeRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null); // Döngüyü durdurabilmek için
  const isSpeakingRef = useRef(false);

  const { user, token } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const audioSettings = useContext(AudioSettingsContext);

  const { inputDeviceId, outputDeviceId, isMicMuted, isDeafened, userVolumes, isNoiseSuppression } = audioSettings || {};

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
    socket.on('user-joined-voice', handleUserJoined);
    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIce);
    socket.on('user-left-voice', handleUserLeft);
    socket.on('voice-channel-moved', handleChannelMoved);
    socket.on('user-speaking-change', ({ userId, isSpeaking }) => {
        setSpeakingUsers(prev => ({ ...prev, [userId]: isSpeaking }));
    });

    return () => {};
  }, [token]);

  // 🔄 GÜRÜLTÜ ENGELLEME BUTONUNA BASINCA YENİLE
  useEffect(() => {
    if (currentVoiceChannelId && stayConnected) {
        console.log("Ayar değişti, mikrofon yeniden başlatılıyor...");
        // Kanalda isek, mikrofonu yeni ayarlarla yeniden başlat
        joinVoiceChannel({ _id: currentServerId }, { _id: currentVoiceChannelId });
    }
  }, [isNoiseSuppression]); // Sadece bu ayar değişince tetikle

  // 🔊 AGRESİF SES İŞLEME (Noise Gate + Filtre)
  const processAudioStream = async (rawStream) => {
      // Eğer özellik kapalıysa ham sesi döndür ama analiz yap (yeşil ışık için)
      if (!isNoiseSuppression) {
          startGateAnalysis(null, null, null, rawStream); // Sadece analiz modunda başlat
          return rawStream;
      }

      try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return rawStream;

          const audioCtx = new AudioContext();
          if (audioCtx.state === 'suspended') await audioCtx.resume();

          const source = audioCtx.createMediaStreamSource(rawStream);
          const destination = audioCtx.createMediaStreamDestination();

          // 1. HighPass Filter (200Hz altı çöp sesleri kes)
          const highPass = audioCtx.createBiquadFilter();
          highPass.type = 'highpass';
          highPass.frequency.value = FILTER_FREQ;
          highPass.Q.value = 0.5;

          // 2. Dynamics Compressor (Ses patlamalarını engelle)
          const compressor = audioCtx.createDynamicsCompressor();
          compressor.threshold.value = -50;
          compressor.knee.value = 40;
          compressor.ratio.value = 12;
          compressor.attack.value = 0;
          compressor.release.value = 0.25;

          // 3. NOISE GATE (Kapı) - Sesi tamamen kapatıp açan vana
          const gateGain = audioCtx.createGain();
          gateGain.gain.value = 0; // Varsayılan: KAPALI (Sessiz)

          // Bağlantı: Mic -> Filtre -> Gate -> Compressor -> Çıkış
          source.connect(highPass);
          highPass.connect(gateGain);
          gateGain.connect(compressor);
          compressor.connect(destination);

          // Analiz için
          audioContextRef.current = audioCtx;
          const analyser = audioCtx.createAnalyser();
          highPass.connect(analyser); // Filtrelenmiş sesi analiz et

          // Analizi başlat (Gate'i bu yönetecek)
          startGateAnalysis(analyser, gateGain, audioCtx);

          return destination.stream;
      } catch (e) {
          console.error("Ses işleme hatası:", e);
          return rawStream;
      }
  };

  // 🚪 NOISE GATE MOTORU (Sürekli Çalışır)
  const startGateAnalysis = (analyser, gateGainNode, audioCtx, rawStreamForSimpleMode = null) => {
      // Eğer basit moddaysak (Noise Suppression KAPALI)
      if (rawStreamForSimpleMode) {
           // Sadece konuşma analizi yap (Yeşil çerçeve için)
           try {
               const simpleCtx = new AudioContext();
               const simpleAnalyser = simpleCtx.createAnalyser();
               const simpleSrc = simpleCtx.createMediaStreamSource(rawStreamForSimpleMode);
               simpleSrc.connect(simpleAnalyser);

               const checkLoop = () => {
                   if (simpleCtx.state === 'closed') return;
                   const arr = new Uint8Array(simpleAnalyser.frequencyBinCount);
                   simpleAnalyser.getByteFrequencyData(arr);
                   let sum = 0; for(let i=0; i<arr.length; i++) sum+=arr[i];
                   const avg = sum/arr.length;
                   updateSpeakingStatus(avg > 10);
                   animationFrameRef.current = requestAnimationFrame(checkLoop);
               };
               checkLoop();
               audioContextRef.current = simpleCtx; // Temizlik için kaydet
           } catch(e){}
           return;
      }

      // Gelişmiş Mod (Noise Suppression AÇIK)
      analyser.fftSize = 512;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
          if (!gateGainNode || audioCtx.state === 'closed') return;

          analyser.getByteFrequencyData(dataArray);

          let sum = 0;
          // Sadece insan sesi frekanslarına odaklan (daha doğru sonuç verir)
          // 512 FFT size'da, index 10 ile 100 arası genelde insan sesidir.
          for (let i = 10; i < 100 && i < bufferLength; i++) {
              sum += dataArray[i];
          }

          // Ortalamayı al
          const average = sum / 90; // (100-10)
          const normalizedVol = average / 255;

          // Eşik Kontrolü
          if (normalizedVol > GATE_THRESHOLD) {
              // Eşiği geçti: Kapıyı HIZLI aç (0.01s) - Ses kesilmesin
              gateGainNode.gain.setTargetAtTime(1, audioCtx.currentTime, 0.01);
              updateSpeakingStatus(true);
          } else {
              // Eşiğin altında: Kapıyı HIZLI kapat (0.1s) - Nefes sesi duyulmasın
              gateGainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
              updateSpeakingStatus(false);
          }

          animationFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
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

  const cleanupMediaOnly = () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

      Object.keys(peersRef.current).forEach(id => { peersRef.current[id]?.destroy(); audioElementsRef.current[id]?.remove(); });
      peersRef.current = {}; audioElementsRef.current = {}; setPeersWithVideo({}); setSpeakingUsers({});
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

  const joinVoiceChannel = async (server, channel) => {
    const sId = server._id || server;
    const cId = channel._id || channel;

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        alert("Mikrofon için HTTPS gereklidir!");
        return;
    }

    // Eğer zaten bağlıysak ve sadece ayar değiştiriyorsak, önce temizlik yap
    if (currentVoiceChannelId && stayConnected) {
         if (socketRef.current) socketRef.current.emit('leave-voice-channel');
         cleanupMediaOnly();
         // Kısa bir bekleme (kaynakların serbest kalması için)
         await new Promise(r => setTimeout(r, 100));
    }

    setCurrentVoiceChannelId(cId); setCurrentServerId(sId); setStayConnected(true);
    if(server.name) setCurrentServerName(server.name);
    if(channel.name) setCurrentVoiceChannelName(channel.name);

    try {
      let rawStream;

      // 🛡️ KLAVYE VE NEFES SESLERİ İÇİN AGRESİF AYARLAR
      const constraints = {
          audio: {
              deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
              // Standart
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true, // Ses seviyesini dengeler
              // Chrome Özel (Agresif)
              googEchoCancellation: true,
              googAutoGainControl: true,
              googNoiseSuppression: true,
              googHighpassFilter: true,
              googTypingNoiseDetection: true, // KLAVYE SESİ İÇİN KRİTİK
              googBeamforming: false // Bazen sorun yaratır, kapalı kalsın
          },
          video: false
      };

      // Gürültü engelleme kapalıysa constraints'i basitleştir
      if (!isNoiseSuppression) {
          constraints.audio = {
              deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
          };
      }

      try {
          rawStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err1) {
          console.warn("Gelişmiş ayarlar başarısız, standart mod deneniyor...");
          rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }

      localStreamRef.current = rawStream;

      // Yazılımsal İşleme (Noise Gate)
      let streamToSend = await processAudioStream(rawStream);
      processedStreamRef.current = streamToSend;

      rawStream.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; });
      streamToSend.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; });

      socketRef.current.emit('join-voice-channel', {
        serverId: sId, channelId: cId, userId: user?._id || user?.id, username: user?.username
      });

    } catch (err) {
      console.error("Mikrofon hatası:", err);
      setMicError("Mikrofon hatası");
      addToast("Mikrofon açılamadı.", "error");
    }
  };

  const leaveVoiceChannel = () => {
    setStayConnected(false); setCurrentVoiceChannelId(null); setCurrentServerId(null);
    socketRef.current?.emit('leave-voice-channel'); cleanupMediaOnly();
  };
  const rejoinChannel = () => {};

  const handleUserJoined = ({ socketId }) => {
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
  const handleUserLeft = ({ socketId }) => { peersRef.current[socketId]?.destroy(); delete peersRef.current[socketId]; audioElementsRef.current[socketId]?.remove(); delete audioElementsRef.current[socketId]; setPeersWithVideo(prev => { const n={...prev}; delete n[socketId]; return n; }); };
  const createPeer = (targetSocketId, initiator, streams = []) => { const p = new Peer({ initiator, trickle: false, streams, config: rtcConfig }); p.on('signal', data => socketRef.current?.emit(initiator ? 'webrtc-offer' : 'webrtc-answer', { targetSocketId, sdp: data })); p.on('stream', stream => handleRemoteStream(stream, targetSocketId)); peersRef.current[targetSocketId] = p; return p; };
  const handleRemoteStream = (stream, id) => { if (stream.getVideoTracks().length > 0) { setPeersWithVideo(prev => ({ ...prev, [id]: stream })); } else { if (audioElementsRef.current[id]) audioElementsRef.current[id].remove(); const audio = document.createElement('audio'); audio.srcObject = stream; audio.autoplay = true; audio.style.display = 'none'; document.body.appendChild(audio); if (outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(()=>{}); audioElementsRef.current[id] = audio; } };
  const startScreenShare = async (electronSourceId = null) => { try { let stream; if (window.electronAPI && electronSourceId) { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: electronSourceId } } }); } else { stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); } setMyScreenStream(stream); Object.values(peersRef.current).forEach(p => p.addStream(stream)); stream.getVideoTracks()[0].onended = () => stopScreenShare(); } catch (err) {} };
  const stopScreenShare = () => { if (myScreenStream) { myScreenStream.getTracks().forEach(t => t.stop()); Object.values(peersRef.current).forEach(p => { try { p.removeStream(myScreenStream); } catch(e){} }); setMyScreenStream(null); } };

  useEffect(() => {
      if (!audioElementsRef.current) return;
      Object.values(audioElementsRef.current).forEach((audio) => {
          if (!audio) return;
          audio.muted = isDeafened;
          if(outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(e=>{});
      });
  }, [isDeafened, outputDeviceId, userVolumes]);

  useEffect(() => { const applyMute = (stream) => { if(stream) stream.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; }); }; applyMute(localStreamRef.current); applyMute(processedStreamRef.current); }, [isMicMuted]);

  return (
    <VoiceContext.Provider value={{
      socket: socketRef.current, isConnected, currentVoiceChannelId, currentServerId, currentVoiceChannelName, currentServerName, joinVoiceChannel, leaveVoiceChannel, speakingUsers, micError, stayConnected, peersWithVideo, myScreenStream, startScreenShare, stopScreenShare
    }}>
      {children}
    </VoiceContext.Provider>
  );
};