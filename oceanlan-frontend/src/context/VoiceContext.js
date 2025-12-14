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

// 🛡️ AGRESİF GÜRÜLTÜ ENGELLEME AYARLARI
const GATE_THRESHOLD = 0.12; // Eşik Yükseltildi (Nefes sesini bile almaz)
const LOW_CUT_FREQ = 300;    // 300Hz altını (TV, Uğultu, Klima) tamamen öldür
const HIGH_CUT_FREQ = 3500;  // 3500Hz üstünü (Klavye tıkırtısı, Cızırtı) kes

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);

  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const audioElementsRef = useRef({});
  const socketUserMapRef = useRef({});

  // Ses İşleme Refleri
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const inputGainNodeRef = useRef(null); // Ses Seviyesi Kontrolü
  const gateGainNodeRef = useRef(null);  // Gürültü Kapısı (Gate)
  const checkIntervalRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const isPTTPressedRef = useRef(false);

  const { user, token, isAuthenticated } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const audioSettings = useContext(AudioSettingsContext);

  const {
      inputDeviceId, outputDeviceId, isMicMuted, isDeafened,
      userVolumes, isNoiseSuppression, inputVolume = 100, // Varsayılan 100
      inputMode = 'VOICE_ACTIVITY', pushToTalkKey = 'Space'
  } = audioSettings || {};

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
    if (!token || !isAuthenticated) {
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
            setIsConnected(false);
        }
        return;
    }

    if (socketRef.current && socketRef.current.connected) return;

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
        Object.values(serverState).forEach(channelUsers => {
            channelUsers.forEach(u => {
                socketUserMapRef.current[u.userId] = u.socketId;
            });
        });
        applyVolumeSettings();
    });

    return () => { if (newSocket) newSocket.disconnect(); };
  }, [token, isAuthenticated]);

  // Başkalarının ses ayarını uygula
  const applyVolumeSettings = () => {
      if (!userVolumes || !audioElementsRef.current) return;
      Object.keys(userVolumes).forEach(targetUserId => {
          const targetSocketId = Object.keys(socketUserMapRef.current).find(key => socketUserMapRef.current[key] === targetUserId) ||
                                 (audioElementsRef.current[targetUserId] ? targetUserId : null);

          if (targetSocketId && audioElementsRef.current[targetSocketId]) {
              const vol = userVolumes[targetUserId];
              audioElementsRef.current[targetSocketId].volume = vol === 0 ? 0 : Math.min(vol / 100, 1.0);
          }
      });
  };

  useEffect(() => { applyVolumeSettings(); }, [userVolumes]);

  // 🟢 KENDİ MİKROFON SES SEVİYEMİZ (GÜÇLENDİRİLMİŞ)
  useEffect(() => {
      if (inputGainNodeRef.current && audioContextRef.current) {
          let gainValue = 1.0;

          if (inputVolume === 0) {
              gainValue = 0; // TAM SESSİZLİK
          } else if (inputVolume <= 100) {
              gainValue = inputVolume / 100; // 0.0 - 1.0 arası normal
          } else {
              // 100'den sonrası için Logaritmik Artış (Daha güçlü hissettirir)
              // 200 yapınca Gain 3.0 (3 kat ses) olur.
              const boost = (inputVolume - 100) / 50; // 0 ile 2 arası ekle
              gainValue = 1.0 + boost;
          }

          // Anlık tepki için süreyi kısalttım (0.05s)
          inputGainNodeRef.current.gain.setTargetAtTime(gainValue, audioContextRef.current.currentTime, 0.05);
      }
  }, [inputVolume]);

  // Gürültü Engelleme Toggle (Yeniden Başlat)
  useEffect(() => {
      if (!currentVoiceChannelId || !socketRef.current) return;
      const switchAudioMode = async () => {
          if (localStreamRef.current) {
             joinVoiceChannel({ _id: currentServerId }, { _id: currentVoiceChannelId });
          }
      };
      switchAudioMode();
  }, [isNoiseSuppression]);

  // ----------------------------------------------------------------
  // 🎛️ SES İŞLEME MOTORU (ÇİFT KATMANLI FİLTRE)
  // ----------------------------------------------------------------
  const processAudioStream = async (rawStream) => {
      try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return rawStream;

          const audioCtx = new AudioContext();
          if (audioCtx.state === 'suspended') await audioCtx.resume();

          const source = audioCtx.createMediaStreamSource(rawStream);
          const destination = audioCtx.createMediaStreamDestination();

          // 1. SES SEVİYESİ (GAIN)
          const inputGain = audioCtx.createGain();
          const startVol = inputVolume > 100 ? 1.0 + ((inputVolume - 100) / 50) : inputVolume / 100;
          inputGain.gain.value = inputVolume === 0 ? 0 : startVol;
          inputGainNodeRef.current = inputGain;

          let currentNode = source;
          currentNode.connect(inputGain);
          currentNode = inputGain;

          if (isNoiseSuppression) {
              // 🛡️ ÇİFT KATMANLI FİLTRE (TV ve Klavye Düşmanı)

              // 2. High-Pass 1 (Kaba temizlik)
              const highPass1 = audioCtx.createBiquadFilter();
              highPass1.type = 'highpass';
              highPass1.frequency.value = LOW_CUT_FREQ;
              highPass1.Q.value = 0.7;

              // 3. High-Pass 2 (İnce temizlik - TV uğultusunu bitirir)
              const highPass2 = audioCtx.createBiquadFilter();
              highPass2.type = 'highpass';
              highPass2.frequency.value = LOW_CUT_FREQ; // Aynı frekans, 2 kat güç
              highPass2.Q.value = 0.7;

              // 4. Low-Pass (Klavye tıkırtısı kesici)
              const lowPass = audioCtx.createBiquadFilter();
              lowPass.type = 'lowpass';
              lowPass.frequency.value = HIGH_CUT_FREQ;
              lowPass.Q.value = 0.7;

              // 5. Noise Gate (Sessizken tam kapat)
              const gateGain = audioCtx.createGain();
              gateGain.gain.value = 0; // Varsayılan kapalı
              gateGainNodeRef.current = gateGain;

              // 6. Compressor (Patlamaları engelle)
              const compressor = audioCtx.createDynamicsCompressor();
              compressor.threshold.value = -24;
              compressor.knee.value = 30;
              compressor.ratio.value = 12;
              compressor.attack.value = 0.003;
              compressor.release.value = 0.25;

              // ZİNCİRİ BAĞLA:
              // Source -> Gain -> HP1 -> HP2 -> LP -> Gate -> Compressor -> Dest
              currentNode.connect(highPass1);
              highPass1.connect(highPass2);
              highPass2.connect(lowPass);
              lowPass.connect(gateGain);
              gateGain.connect(compressor);
              compressor.connect(destination);

              // Analiz için LowPass çıkışını kullan (Filtrelenmiş sese göre karar ver)
              const analyser = audioCtx.createAnalyser();
              lowPass.connect(analyser);
              startGateAnalysis(analyser, gateGain, audioCtx);
          } else {
              // Gürültü engelleme yoksa sadece Gain ile çıkışa ver
              currentNode.connect(destination);
              startGateAnalysis(null, null, null, rawStream); // Işık için analiz
          }

          audioContextRef.current = audioCtx;
          return destination.stream;
      } catch (e) {
          console.error("Ses işleme hatası:", e);
          return rawStream;
      }
  };

  // ----------------------------------------------------------------
  // 🔊 AKILLI GATE ANALİZİ (GÜRÜLTÜ KAPISI)
  // ----------------------------------------------------------------
  const startGateAnalysis = (analyser, gateGainNode, audioCtx, rawStreamForSimpleMode = null) => {
      // Mobil/Basit Mod Analizi
      if (rawStreamForSimpleMode) {
           try {
               const simpleCtx = new AudioContext();
               const simpleAnalyser = simpleCtx.createAnalyser();
               const simpleSrc = simpleCtx.createMediaStreamSource(rawStreamForSimpleMode);
               simpleSrc.connect(simpleAnalyser);
               const checkLoop = () => {
                   if (simpleCtx.state === 'closed') return;
                   if (inputMode === 'PUSH_TO_TALK' && !isPTTPressedRef.current) { updateSpeakingStatus(false); requestAnimationFrame(checkLoop); return; }
                   const arr = new Uint8Array(simpleAnalyser.frequencyBinCount);
                   simpleAnalyser.getByteFrequencyData(arr);
                   let sum = 0; for(let i=0; i<arr.length; i++) sum+=arr[i];
                   updateSpeakingStatus((sum/arr.length) > 10);
                   requestAnimationFrame(checkLoop);
               }; checkLoop();
           } catch(e){} return;
      }

      // Gelişmiş Gate Analizi
      analyser.fftSize = 512;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
          if (!gateGainNode || audioCtx.state === 'closed') return;

          // PTT Kontrolü
          if (inputMode === 'PUSH_TO_TALK' && !isPTTPressedRef.current) {
              gateGainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05); // Hızlı kapan
              updateSpeakingStatus(false);
              requestAnimationFrame(checkVolume);
              return;
          }

          analyser.getByteFrequencyData(dataArray);

          // İnsan sesi aralığına odaklan (Düşük frekansları yoksay)
          let sum = 0; let count = 0;
          for (let i = 5; i < 60 && i < bufferLength; i++) { sum += dataArray[i]; count++; }
          const average = count > 0 ? sum / count : 0;
          const normalizedVol = average / 255;

          if (normalizedVol > GATE_THRESHOLD) {
              // Konuşma algılandı -> Kapıyı aç
              gateGainNode.gain.setTargetAtTime(1, audioCtx.currentTime, 0.01);
              updateSpeakingStatus(true);
          } else {
              // Sessizlik -> Kapıyı kapat (Hızlıca)
              gateGainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
              updateSpeakingStatus(false);
          }
          requestAnimationFrame(checkVolume);
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

  const stopAudioAnalysis = () => {
      isSpeakingRef.current = false;
  };

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
      if (processedStreamRef.current) processedStreamRef.current = null;
      if (myScreenStream) {
          myScreenStream.getTracks().forEach(t => t.stop());
          setMyScreenStream(null);
      }
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

  // 🟢 MOBİL FALLBACK UYUMLU JOIN
  const joinVoiceChannel = async (server, channel) => {
    const sId = server._id || server;
    const cId = channel._id || channel;

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        alert("Mikrofon için HTTPS gereklidir!");
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
      let rawStream;
      const constraints = {
          audio: {
            deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false, // Bizim gain'imiz çakışmasın diye kapattık
          },
          video: false
      };

      try {
          if (!isNoiseSuppression) {
             constraints.audio = { deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined };
          }
          rawStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (advancedErr) {
          console.warn("Gelişmiş mod başarısız, basit moda geçiliyor...", advancedErr);
          rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }

      localStreamRef.current = rawStream;

      // İşlenmiş Sesi Hazırla
      let streamToSend = await processAudioStream(rawStream);
      processedStreamRef.current = streamToSend;

      const shouldEnable = !isMicMuted;
      rawStream.getAudioTracks().forEach(track => { track.enabled = shouldEnable; });
      streamToSend.getAudioTracks().forEach(track => { track.enabled = shouldEnable; });

      // Basit mod için ışık analizi
      if (!isNoiseSuppression) startGateAnalysis(null, null, null, rawStream);

      socketRef.current.emit('join-voice-channel', {
        serverId: sId,
        channelId: cId,
        userId: user?._id || user?.id,
        username: user?.username
      });

    } catch (err) {
      console.error("Mikrofon hatası:", err);
      setMicError("Mikrofon açılamadı");
      addToast('Mikrofon hatası: İzin verilmedi.', 'error');
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

  const handleUserJoined = ({ socketId }) => {
      const stream = processedStreamRef.current || localStreamRef.current;
      const streams = [stream, myScreenStream].filter(Boolean);
      createPeer(socketId, true, streams);
  };

  const handleOffer = ({ socketId, sdp }) => {
    if(peersRef.current[socketId]) peersRef.current[socketId].destroy();
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
          applyVolumeSettings();
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

  useEffect(() => {
      if (!audioElementsRef.current) return;
      Object.values(audioElementsRef.current).forEach((audio) => {
          if (!audio) return;
          audio.muted = isDeafened;
          if(outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(e=>{});
      });
  }, [isDeafened, outputDeviceId, userVolumes]);

  useEffect(() => {
      const applyMute = (stream) => { if(stream) stream.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; }); };
      applyMute(localStreamRef.current);
      applyMute(processedStreamRef.current);
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