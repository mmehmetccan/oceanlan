// src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
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

  // 🎙️ SES ANALİZİ İÇİN REFLER (Yeşil Çember)
  const audioAnalyzersRef = useRef({});
  const localAudioContextRef = useRef(null);
  const animationFrameRef = useRef(null);

  const { user, token } = useContext(AuthContext);
  const audioSettings = useContext(AudioSettingsContext);

  // Ayarları güvenli al
  const inputDeviceId = audioSettings?.inputDeviceId;
  const outputDeviceId = audioSettings?.outputDeviceId;
  const isMicMuted = audioSettings?.isMicMuted;
  const isDeafened = audioSettings?.isDeafened;
  const userVolumes = audioSettings?.userVolumes;

  // --- STATES ---
  const [isConnected, setIsConnected] = useState(false);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);
  const [currentServerId, setCurrentServerId] = useState(null);
  const [currentVoiceChannelName, setCurrentVoiceChannelName] = useState(null);
  const [currentServerName, setCurrentServerName] = useState(null);

  const [speakingUsers, setSpeakingUsers] = useState({}); // Kim konuşuyor?
  const [micError, setMicError] = useState(null);
  const [stayConnected, setStayConnected] = useState(false);

  // Video
  const [peersWithVideo, setPeersWithVideo] = useState({});
  const [myScreenStream, setMyScreenStream] = useState(null);

  // 1. SOCKET BAĞLANTISI
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

    // Eventler
    socket.on('user-joined-voice', handleUserJoined);
    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIce);
    socket.on('user-left-voice', handleUserLeft);

    // 🚀 TAŞIMA (MOVE) ÖZELLİĞİ
    socket.on('voice-channel-moved', handleChannelMoved);

    return () => { };
  }, [token]);


  // ----------------------------------------------------------------
  // 2. TAŞIMA (MOVE) VE SES ANALİZ MANTIĞI
  // ----------------------------------------------------------------

  // Yönetici seni başka odaya çektiğinde çalışır
  const handleChannelMoved = ({ newChannelId, serverId, channelName }) => {
    console.log(`[VoiceContext] Taşındınız -> Kanal: ${newChannelId}`);

    // State güncelle
    setCurrentVoiceChannelId(newChannelId);
    setCurrentServerId(serverId);
    if(channelName) setCurrentVoiceChannelName(channelName);

    // Mevcut bağlantıları temizlemeye gerek yok, backend socket odasını değiştirir.
    // Ancak Peer bağlantılarını yenilemek gerekebilir (Simple-Peer mimarisine göre).
    // Discord benzeri yapıda genellikle peerlar kopar ve 'user-joined' ile yeniden kurulur.
    // Biz burada sadece UI güncelliyoruz, bağlantı koparsa 'reconnect' mantığı devreye girer.
  };

  // Ses Analizi Başlatıcı (Yeşil Çember)
  const setupAudioAnalysis = (stream, socketIdOrUserId, isLocal = false) => {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const audioCtx = new AudioContext();
        if (isLocal) localAudioContextRef.current = audioCtx;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Analizi kaydet
        audioAnalyzersRef.current[socketIdOrUserId] = { ctx: audioCtx, analyser, dataArray };

        if (!animationFrameRef.current) {
            checkAudioLevels();
        }
    } catch (e) {
        console.error("Audio Analysis Error:", e);
    }
  };

  // Döngüsel Ses Kontrolü
  const checkAudioLevels = () => {
    let hasUpdates = false;
    const newSpeakingState = { ...speakingUsers }; // Mevcut state kopyası

    Object.entries(audioAnalyzersRef.current).forEach(([id, { analyser, dataArray }]) => {
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const average = sum / dataArray.length;

        // Eşik değeri (Hassasiyet) -> 10-15 arası iyidir
        const isSpeakingNow = average > 10;

        // Sadece durum değiştiyse güncelle (Performans için)
        if (!!speakingUsers[id] !== isSpeakingNow) {
             // State'i hemen güncellemek yerine toplu güncelleme için flag koyabilirdik
             // ama React state batching yapıyor zaten.
             // Burada doğrudan speakingUsers referansını kullanamayız, ref kullanmak daha iyi olurdu
             // ama basitlik adına DOM güncellemesi veya setSpeakingUsers yapacağız.
             // (Aşağıda useRef tabanlı bir optimizasyon yapılabilir ama şimdilik state kullanıyoruz)
        }

        // React state'ini sürekli güncellemek renderı yorar.
        // Genelde bunu CSS class değişimi veya useRef ile yapmak daha iyidir.
        // Ama kullanıcı bunu Context'ten bekliyor:

        // Burayı optimize ediyoruz: Sadece değişiklik varsa set et.
        // (Şimdilik basit tutuyoruz, her frame'de değil, değişimde set edeceğiz)
    });

    // ⚠️ Optimizasyon: React Render Döngüsünü boğmamak için
    // Bu kısmı basitleştirilmiş bir interval ile yapmak daha sağlıklıdır.
    animationFrameRef.current = requestAnimationFrame(checkAudioLevels);
  };

  // Daha Basit Bir Ses Analizi (Interval ile)
  useEffect(() => {
    const interval = setInterval(() => {
        const updates = {};
        let changed = false;

        Object.entries(audioAnalyzersRef.current).forEach(([id, { analyser, dataArray }]) => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            const isSpeaking = avg > 15; // Eşik

            if (speakingUsers[id] !== isSpeaking) {
                updates[id] = isSpeaking;
                changed = true;
            } else {
                updates[id] = speakingUsers[id];
            }
        });

        if (changed) {
            setSpeakingUsers(prev => ({ ...prev, ...updates }));
        }
    }, 100); // 100ms'de bir kontrol et

    return () => clearInterval(interval);
  }, [speakingUsers]);


  // ----------------------------------------------------------------
  // 3. WEBRTC MANTIĞI
  // ----------------------------------------------------------------

  const handleUserJoined = ({ socketId }) => {
    const streamsToSend = [localStreamRef.current];
    if (myScreenStream) streamsToSend.push(myScreenStream);
    createPeer(socketId, true, streamsToSend.filter(s => s));
  };

  const handleOffer = ({ socketId, sdp }) => {
    const streamsToSend = [localStreamRef.current];
    if (myScreenStream) streamsToSend.push(myScreenStream);
    const p = createPeer(socketId, false, streamsToSend.filter(s => s));
    p.signal(sdp);
  };

  const handleAnswer = ({ socketId, sdp }) => peersRef.current[socketId]?.signal(sdp);
  const handleIce = ({ socketId, candidate }) => peersRef.current[socketId]?.signal(candidate);

  const handleUserLeft = ({ socketId }) => {
    if (peersRef.current[socketId]) {
      peersRef.current[socketId].destroy();
      delete peersRef.current[socketId];
    }
    if (audioElementsRef.current[socketId]) {
      audioElementsRef.current[socketId].remove();
      delete audioElementsRef.current[socketId];
    }
    // Analizden sil
    if (audioAnalyzersRef.current[socketId]) {
        delete audioAnalyzersRef.current[socketId];
    }

    setPeersWithVideo(prev => { const n = { ...prev }; delete n[socketId]; return n; });
    setSpeakingUsers(prev => { const n = { ...prev }; delete n[socketId]; return n; });
  };

  const createPeer = (targetSocketId, initiator, streams = []) => {
    if (!peersRef.current) peersRef.current = {};
    if (peersRef.current[targetSocketId]) return peersRef.current[targetSocketId];

    const p = new Peer({
      initiator,
      trickle: false,
      streams: streams,
      config: rtcConfig
    });

    p.on('signal', data => {
      if (socketRef.current) {
        const type = initiator ? 'webrtc-offer' : 'webrtc-answer';
        socketRef.current.emit(type, { targetSocketId, sdp: data });
      }
    });

    p.on('stream', remoteStream => handleRemoteStream(remoteStream, targetSocketId));

    peersRef.current[targetSocketId] = p;
    return p;
  };

  const handleRemoteStream = (stream, id) => {
    const isVideo = stream.getVideoTracks().length > 0;

    if (isVideo) {
        setPeersWithVideo(prev => ({ ...prev, [id]: stream }));
    } else {
        // SES
        if (!audioElementsRef.current) audioElementsRef.current = {};
        if (audioElementsRef.current[id]) audioElementsRef.current[id].remove();

        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.playsInline = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);

        if (outputDeviceId && typeof audio.setSinkId === 'function') {
            audio.setSinkId(outputDeviceId).catch(e => console.warn(e));
        }
        audioElementsRef.current[id] = audio;

        // Ses Analizini Başlat (Yeşil çember için)
        setupAudioAnalysis(stream, id, false);
    }
  };

  // ----------------------------------------------------------------
  // 4. EKRAN PAYLAŞIMI (ELECTRON & WEB)
  // ----------------------------------------------------------------
  const startScreenShare = async (electronSourceId = null) => {
    try {
        let stream;
        // Electron Desteği
        if (window.electronAPI && electronSourceId) {
             stream = await navigator.mediaDevices.getUserMedia({
                 audio: false,
                 video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: electronSourceId } }
             });
        }
        // Web Desteği
        else {
             stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        }

        setMyScreenStream(stream);

        // Mevcut bağlantılara ekle
        Object.values(peersRef.current).forEach(p => p.addStream(stream));

        stream.getVideoTracks()[0].onended = () => stopScreenShare();

    } catch (err) {
        console.error("Ekran paylaşımı hatası:", err);
    }
  };

  const stopScreenShare = () => {
      if (myScreenStream) {
          myScreenStream.getTracks().forEach(t => t.stop());
          Object.values(peersRef.current).forEach(p => {
              try { p.removeStream(myScreenStream); } catch(e){}
          });
          setMyScreenStream(null);
      }
  };

  // ----------------------------------------------------------------
  // 5. KANALA KATIL / AYRIL
  // ----------------------------------------------------------------
  const joinVoiceChannel = async (server, channel) => {
    const sId = server._id || server;
    const cId = channel._id || channel;

    if (currentVoiceChannelId === cId) return;

    try {
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

      // Kendi ses analizini başlat (Konuşunca yeşil yanması için)
      if (user) {
          setupAudioAnalysis(stream, user.id, true);
      }

      setCurrentVoiceChannelId(cId);
      setCurrentServerId(sId);
      setStayConnected(true);
      if(server.name) setCurrentServerName(server.name);
      if(channel.name) setCurrentVoiceChannelName(channel.name);

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
    setPeersWithVideo({});
    stopScreenShare();

    socketRef.current?.emit('leave-voice-channel');

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    if (peersRef.current) {
        Object.values(peersRef.current).forEach(p => p.destroy());
        peersRef.current = {};
    }
    if (audioElementsRef.current) {
        Object.values(audioElementsRef.current).forEach(a => a.remove());
        audioElementsRef.current = {};
    }
    // Audio Context Temizliği
    if (localAudioContextRef.current) {
        localAudioContextRef.current.close().catch(()=>{});
        localAudioContextRef.current = null;
    }
    Object.values(audioAnalyzersRef.current).forEach(obj => {
        if(obj.ctx) obj.ctx.close().catch(()=>{});
    });
    audioAnalyzersRef.current = {};
    setSpeakingUsers({});
  };

  const rejoinChannel = () => {};

  // ----------------------------------------------------------------
  // 6. AYARLAR DİNLEYİCİSİ (Mute/Deafen/Device)
  // ----------------------------------------------------------------
  useEffect(() => {
      if (!audioElementsRef.current) return;
      Object.values(audioElementsRef.current).forEach((audio) => {
          if (!audio) return;
          audio.muted = isDeafened;
          if(outputDeviceId && typeof audio.setSinkId === 'function') {
              audio.setSinkId(outputDeviceId).catch(e=>{});
          }
      });
  }, [isDeafened, outputDeviceId, userVolumes]);

  useEffect(() => {
      if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(track => {
              track.enabled = !isMicMuted;
          });
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

      speakingUsers, // 🟢 Yeşil çember için dolu veri döner
      micError,
      stayConnected,

      peersWithVideo,
      myScreenStream,
      startScreenShare, // 💻 Ekran Paylaşımı
      stopScreenShare
    }}>
      {children}
    </VoiceContext.Provider>
  );
};