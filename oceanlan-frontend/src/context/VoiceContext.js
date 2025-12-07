// src/context/VoiceContext.js
import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { AuthContext } from './AuthContext';
import { AudioSettingsContext } from './AudioSettingsContext';
import { ToastContext } from './ToastContext';

export const VoiceContext = createContext();

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);

  const peersRef = useRef({});
  const localStreamRef = useRef(null); // Ham (Raw) Mikrofon
  const processedStreamRef = useRef(null); // İşlenmiş (Temiz) Ses
  const audioElementsRef = useRef({});

  const userSocketMapRef = useRef({});

  // Ses İşleme ve Analiz Refleri
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const checkIntervalRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const processingNodesRef = useRef(null); // Filtreler burada tutulacak

  const { user, token } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const audioSettings = useContext(AudioSettingsContext);
  const { inputDeviceId, outputDeviceId, isMicMuted, isDeafened, userVolumes,isNoiseSuppression } = audioSettings || {};
  // --- STATES ---
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
    socket.on('user-speaking-change', ({ userId, isSpeaking }) => {
        setSpeakingUsers(prev => ({ ...prev, [userId]: isSpeaking }));
    });



    socket.on('voiceStateUpdate', (serverState) => {
        if (!serverState) return;
        // Tüm kanalları gez ve haritayı güncelle
        Object.values(serverState).forEach(channelUsers => {
            channelUsers.forEach(u => {
                // userId -> socketId eşleşmesi
                userSocketMapRef.current[u.userId] = u.socketId;
            });
        });

        // Ses ayarlarını hemen uygula (Yeni girenler için)
        applyVolumeSettings();
    });

    return () => {};
  }, [token]);

  const applyVolumeSettings = () => {
      if (!userVolumes || !audioElementsRef.current) return;

      // Kayıtlı tüm kullanıcıların ses ayarlarını uygula
      Object.keys(userVolumes).forEach(targetUserId => {
          const targetSocketId = userSocketMapRef.current[targetUserId];
          const volume = userVolumes[targetUserId]; // 0 ile 100 arası

          if (targetSocketId && audioElementsRef.current[targetSocketId]) {
              // HTML Audio elementinin volume özelliği 0.0 ile 1.0 arasındadır
              const normalizedVolume = Math.max(0, Math.min(1, volume / 100));
              audioElementsRef.current[targetSocketId].volume = normalizedVolume;
          }
      });
  };

useEffect(() => {
      applyVolumeSettings();
  }, [userVolumes]);


  useEffect(() => {
      // Sadece bağlıysak ve bir kanaldaysak çalışsın
      if (!currentVoiceChannelId || !socketRef.current) return;

      const switchAudioMode = async () => {
          console.log(`[Voice] Gürültü Engelleme: ${isNoiseSuppression ? 'AÇIK' : 'KAPALI'}`);

          try {
              // 1. Yeni Ham Akışı Al
              const newRawStream = await navigator.mediaDevices.getUserMedia({
                  audio: {
                      deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
                      // Eğer kapalıysa donanımsal özellikleri de kapatabiliriz, ama genelde açık tutmak iyidir
                      echoCancellation: true,
                      noiseSuppression: true,
                      autoGainControl: true
                  },
                  video: false
              });

              // 2. İşle (veya İşleme)
              let finalStream = newRawStream;
              if (isNoiseSuppression) {
                  finalStream = await processAudioStream(newRawStream);
              }

              // Mute durumunu koru
              finalStream.getAudioTracks().forEach(t => t.enabled = !isMicMuted);

              // 3. Eski Analizi Durdur ve Yenisini Başlat
              stopAudioAnalysis();
              startAudioAnalysis(finalStream);

              // 4. Peer Bağlantılarını Güncelle (Replace Track)
              const oldTrack = processedStreamRef.current?.getAudioTracks()[0] || localStreamRef.current?.getAudioTracks()[0];
              const newTrack = finalStream.getAudioTracks()[0];

              if (oldTrack && newTrack) {
                  Object.values(peersRef.current).forEach(peer => {
                      if (!peer.destroyed) {
                          // Simple-peer replaceTrack: (oldTrack, newTrack, newStream)
                          peer.replaceTrack(oldTrack, newTrack, finalStream);
                      }
                  });
              }

              // 5. Eski streamleri durdur
              if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());

              // 6. Refleri Güncelle
              localStreamRef.current = newRawStream;
              processedStreamRef.current = finalStream;

          } catch (e) {
              console.error("Audio switch error:", e);
          }
      };

      switchAudioMode();

      // Cleanup
      return () => {
          // Buraya cleanup koymuyoruz, aksi takdirde her toggle'da bağlantı kopar
      };
  }, [isNoiseSuppression]);

  // ----------------------------------------------------------------
  // 🎛️ SES İŞLEME MOTORU (NOISE CANCELLATION)
  // ----------------------------------------------------------------
  const processAudioStream = async (rawStream) => {
      try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return rawStream; // Desteklemiyorsa ham sesi döndür

          const audioCtx = new AudioContext();
          if (audioCtx.state === 'suspended') await audioCtx.resume();

          const source = audioCtx.createMediaStreamSource(rawStream);
          const destination = audioCtx.createMediaStreamDestination();

          // 1. High-Pass Filter (Uğultu ve Fan seslerini keser - 100Hz altı)
          const highPassFilter = audioCtx.createBiquadFilter();
          highPassFilter.type = 'highpass';
          highPassFilter.frequency.value = 85; // İnsan sesi genelde 85Hz üstüdür
          highPassFilter.Q.value = 0.7;

          // 2. Compressor (Ani patlamaları engeller ve sesi dengeler)
          const compressor = audioCtx.createDynamicsCompressor();
          compressor.threshold.value = -20;
          compressor.knee.value = 40;
          compressor.ratio.value = 12;
          compressor.attack.value = 0;
          compressor.release.value = 0.25;

          // Bağlantıları Kur: Kaynak -> Filtre -> Compressor -> Çıkış
          source.connect(highPassFilter);
          highPassFilter.connect(compressor);
          compressor.connect(destination);

          // Referansları sakla (Temizlik için)
          audioContextRef.current = audioCtx;
          processingNodesRef.current = { source, highPassFilter, compressor, destination };

          return destination.stream; // Temizlenmiş ses akışı
      } catch (e) {
          console.error("Ses işleme hatası:", e);
          return rawStream; // Hata olursa ham sesi kullan
      }
  };

  // ----------------------------------------------------------------
  // 🔊 MİKROFON ANALİZİ (YEŞİL IŞIK)
  // ----------------------------------------------------------------
  const startAudioAnalysis = async (stream) => {
      try {
          // Analiz için mevcut context'i kullan veya yeni oluştur
          let audioCtx = audioContextRef.current;

          if (!audioCtx) {
              const AudioContext = window.AudioContext || window.webkitAudioContext;
              if (!AudioContext) return;
              audioCtx = new AudioContext();
              audioContextRef.current = audioCtx;
          }

          if (audioCtx.state === 'suspended') await audioCtx.resume();

          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512;

          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);

          analyserRef.current = analyser;

          if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);

          checkIntervalRef.current = setInterval(() => {
              // Mute ise veya context kapandıysa dur
              if (isMicMuted || !analyserRef.current || audioCtx.state === 'closed') {
                  updateSpeakingStatus(false);
                  return;
              }
              if (audioCtx.state === 'suspended') audioCtx.resume();

              const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
              analyserRef.current.getByteFrequencyData(dataArray);

              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              const average = sum / dataArray.length;

              // EŞİK DEĞERİ (Hassasiyet 10)
              const threshold = 10;
              updateSpeakingStatus(average > threshold);

          }, 100);

      } catch (e) {
          console.error("Analiz hatası:", e);
      }
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

  const stopAudioAnalysis = () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
      // Context'i hemen kapatmıyoruz, işleme motoru da kullanıyor olabilir
      isSpeakingRef.current = false;
  };

  // ----------------------------------------------------------------
  // TEMİZLİK
  // ----------------------------------------------------------------
  const cleanupMediaOnly = () => {
      Object.keys(peersRef.current).forEach(id => {
          peersRef.current[id]?.destroy();
          audioElementsRef.current[id]?.remove();
      });
      peersRef.current = {};
      audioElementsRef.current = {};
      setPeersWithVideo({});
      setSpeakingUsers({});
      stopAudioAnalysis();

      if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
          localStreamRef.current = null;
      }
      if (processedStreamRef.current) {
          // İşlenmiş akışı da temizle
          processedStreamRef.current = null;
      }
      if (myScreenStream) {
          myScreenStream.getTracks().forEach(t => t.stop());
          setMyScreenStream(null);
      }

      // AudioContext'i temizle
      if (audioContextRef.current) {
          audioContextRef.current.close().catch(()=>{});
          audioContextRef.current = null;
      }
  };

  const handleChannelMoved = ({ newChannelId, serverId, channelName }) => {
    cleanupMediaOnly();
    setCurrentVoiceChannelId(newChannelId);
    setCurrentServerId(serverId);
    if(channelName) setCurrentVoiceChannelName(channelName);
    joinVoiceChannel(serverId, newChannelId);
  };

  // ----------------------------------------------------------------
  // JOIN VOICE CHANNEL
  // ----------------------------------------------------------------
  const joinVoiceChannel = async (server, channel) => {
    const sId = server._id || server;
    const cId = channel._id || channel;

    // HTTPS Kontrolü
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        alert("Mikrofon kullanımı için sitenin HTTPS olması zorunludur!");
        addToast('Mikrofon hatası: Güvenli bağlantı (HTTPS) gerekli.', 'error');
        return;
    }

    if (currentVoiceChannelId === cId) return;
    if (currentVoiceChannelId) { cleanupMediaOnly(); socketRef.current?.emit('leave-voice-channel'); }

    setCurrentVoiceChannelId(cId);
    setCurrentServerId(sId);
    setStayConnected(true);
    if(server.name) setCurrentServerName(server.name);
    if(channel.name) setCurrentVoiceChannelName(channel.name);

    try {
      // 1. Ham Mikrofonu Al (Gelişmiş Gürültü Engelleme Parametreleri ile)
      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
          echoCancellation: true,      // Yankı Önleme (Donanımsal)
          noiseSuppression: true,      // Gürültü Bastırma (Donanımsal)
          autoGainControl: true,       // Otomatik Ses Seviyesi
          channelCount: 1,             // Mono (Konuşma için daha iyidir)
          sampleRate: 48000            // Yüksek kalite
        },
        video: false
      });

      localStreamRef.current = rawStream;

      // 2. Sesi İşle (Yazılımsal Gürültü Temizleme)
      let streamToSend = rawStream;
      if (isNoiseSuppression) {
          streamToSend = await processAudioStream(rawStream);
      }
      processedStreamRef.current = streamToSend;

      // Mute kontrolü (Hem ham hem işlenmiş akışta)
      rawStream.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; });
      streamToSend.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; });

      startAudioAnalysis(streamToSend);

      socketRef.current.emit('join-voice-channel', {
        serverId: sId,
        channelId: cId,
        userId: user?._id || user?.id,
        username: user?.username
      });

    } catch (err) {
      console.error("Mikrofon hatası:", err);
      if (err.name === 'NotAllowedError') addToast('Mikrofon izni reddedildi.', 'error');
      else if (err.name === 'NotFoundError') addToast('Mikrofon bulunamadı.', 'error');
      else addToast(`Mikrofon hatası: ${err.name}`, 'error');
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

  // WebRTC Handlers
  const handleUserJoined = ({ socketId }) => {
      const stream = processedStreamRef.current || localStreamRef.current;
      const streams = [stream, myScreenStream].filter(Boolean);
      createPeer(socketId, true, streams);
  };

  const handleOffer = ({ socketId, sdp }) => {
    if(peersRef.current[socketId]) peersRef.current[socketId].destroy();
    // İşlenmiş (Temiz) sesi gönder
    const streamToSend = processedStreamRef.current || localStreamRef.current;
    const streams = [streamToSend, myScreenStream].filter(Boolean);
    const p = createPeer(socketId, false, streams);
    p.signal(sdp);
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
    const p = new Peer({ initiator, trickle: false, streams, config: rtcConfig });
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

          // İlk açılışta ses seviyesini uygula
          applyVolumeSettings();
      }
  };

  // Screen Share
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
      // İşlenmiş akışı da mute/unmute yap
      if (processedStreamRef.current) {
          processedStreamRef.current.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; });
      }
  }, [isMicMuted]);

  return (
    <VoiceContext.Provider value={{
      socket: socketRef.current, isConnected,
        currentVoiceChannelId, currentServerId,
        currentVoiceChannelName, currentServerName, joinVoiceChannel, leaveVoiceChannel, speakingUsers, micError, stayConnected, peersWithVideo, myScreenStream, startScreenShare, stopScreenShare
    }}>
      {children}
    </VoiceContext.Provider>
  );
};