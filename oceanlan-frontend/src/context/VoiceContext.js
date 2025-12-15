import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { io } from 'socket.io-client';
import Peer from 'simple-peer';
import { AuthContext } from './AuthContext';
import { AudioSettingsContext } from './AudioSettingsContext';
import { ToastContext } from './ToastContext';

export const VoiceContext = createContext();

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const GATE_THRESHOLD = 0.08;
const LOW_CUT_FREQ = 150;
const HIGH_CUT_FREQ = 6000;

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const audioElementsRef = useRef({});
  const socketUserMapRef = useRef({});

  // 🟢 YENİ: Yayını Ref içinde de tutuyoruz (Sonradan girenler için şart!)
  // State anlık render içindir, Ref ise callback fonksiyonları içindir.
  const myScreenStreamRef = useRef(null);
  const [myScreenStream, setMyScreenStream] = useState(null);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const inputGainNodeRef = useRef(null);
  const gateGainNodeRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const isPTTPressedRef = useRef(false);

  const { user, token, isAuthenticated } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const audioSettings = useContext(AudioSettingsContext);

  const {
      inputDeviceId, outputDeviceId, isMicMuted, isDeafened,
      userVolumes, isNoiseSuppression, inputVolume = 100,
      inputMode = 'VOICE_ACTIVITY',
      pttKeyCode
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
    let backendUrl = 'http://localhost:4000';
    if (isElectron || isProductionUrl) backendUrl = 'https://oceanlan.com';

    const newSocket = io(backendUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
      secure: true,
      reconnection: true,
      autoConnect: true,
    });

    socketRef.current = newSocket;

    newSocket.on('connect', () => {
        console.log('[SOCKET] Bağlandı:', newSocket.id);
        setIsConnected(true);
        if (stayConnected && currentVoiceChannelId) rejoinChannel();
    });

    newSocket.on('disconnect', () => setIsConnected(false));

    newSocket.on('user-joined-voice', handleUserJoined);
    newSocket.on('webrtc-offer', handleOffer);
    newSocket.on('webrtc-answer', handleAnswer);
    newSocket.on('webrtc-ice-candidate', handleIce);
    newSocket.on('user-left-voice', handleUserLeft);
    newSocket.on('voice-channel-moved', handleChannelMoved);
    newSocket.on('user-speaking-change', ({ userId, isSpeaking }) => {
        setSpeakingUsers(prev => ({ ...prev, [userId]: isSpeaking }));
    });

    // 🟢 YENİ: Biri yayını kapatırsa, onun videosunu sil (Donmayı önler)
    newSocket.on('screen-share-stopped', ({ socketId }) => {
        setPeersWithVideo(prev => {
            const copy = { ...prev };
            delete copy[socketId];
            return copy;
        });
    });

    newSocket.on('voiceStateUpdate', (serverState) => {
        if (!serverState) return;
        Object.values(serverState).forEach(channelUsers => {
            channelUsers.forEach(u => {
                socketUserMapRef.current[u.socketId] = u.userId;
            });
        });
        applyVolumeSettings();
    });

    return () => { if (newSocket) newSocket.disconnect(); };
  }, [token, isAuthenticated]);

  const applyVolumeSettings = () => {
      Object.keys(audioElementsRef.current).forEach(socketId => {
          const el = audioElementsRef.current[socketId];
          const uid = socketUserMapRef.current[socketId];
          if (uid && el && userVolumes[uid] !== undefined) {
              const vol = userVolumes[uid];
              el.volume = vol === 0 ? 0 : Math.min(vol / 100, 1.0);
          }
      });
  };
  useEffect(() => { applyVolumeSettings(); }, [userVolumes]);

  useEffect(() => {
      if (inputGainNodeRef.current && audioContextRef.current) {
          let gainValue = 1.0;
          if (inputVolume === 0) gainValue = 0;
          else if (inputVolume <= 100) gainValue = inputVolume / 100;
          else gainValue = 1.0 + ((inputVolume - 100) / 30);
          inputGainNodeRef.current.gain.setTargetAtTime(gainValue, audioContextRef.current.currentTime, 0.05);
      }
  }, [inputVolume]);

  // PTT Dinleyicisi
  useEffect(() => {
      if (inputMode !== 'PUSH_TO_TALK') { isPTTPressedRef.current = false; return; }
      const handleDown = (e) => {
          if (isMicMuted) return;
          if ((e.type === 'keydown' && e.code === pttKeyCode && !e.repeat) || (e.type === 'mousedown' && e.button === pttKeyCode)) {
              isPTTPressedRef.current = true; updateSpeakingStatus(true);
          }
      };
      const handleUp = (e) => {
          if ((e.type === 'keyup' && e.code === pttKeyCode) || (e.type === 'mouseup' && e.button === pttKeyCode)) {
              isPTTPressedRef.current = false; updateSpeakingStatus(false);
          }
      };
      window.addEventListener('keydown', handleDown); window.addEventListener('keyup', handleUp);
      window.addEventListener('mousedown', handleDown); window.addEventListener('mouseup', handleUp);
      return () => {
          window.removeEventListener('keydown', handleDown); window.removeEventListener('keyup', handleUp);
          window.removeEventListener('mousedown', handleDown); window.removeEventListener('mouseup', handleUp);
      };
  }, [inputMode, pttKeyCode, isMicMuted]);

  // EKRAN PAYLAŞIMI BAŞLATMA
  const startScreenShare = async (electronSourceId = null) => {
    try {
        let stream;
        if (window.electronAPI && electronSourceId) {
             stream = await navigator.mediaDevices.getUserMedia({
                 audio: false,
                 video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: electronSourceId, minWidth: 1280, maxWidth: 1920, minHeight: 720, maxHeight: 1080 } }
             });
        } else {
             stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        }

        // 🟢 Hem State'i hem Ref'i güncelle
        setMyScreenStream(stream);
        myScreenStreamRef.current = stream;

        // Mevcut kullanıcılara gönder
        Object.values(peersRef.current).forEach(peer => {
            try { if (peer && !peer.destroyed) peer.addStream(stream); } catch (err) {}
        });

        stream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) { addToast("Ekran paylaşımı başlatılamadı", "error"); }
  };

  // EKRAN PAYLAŞIMI DURDURMA
  const stopScreenShare = () => {
      // 🟢 1. Önce Socket'e "Durdurdum" sinyali gönder (İzleyicilerde donmasın)
      if (socketRef.current) {
          socketRef.current.emit('screen-share-stopped', {
              serverId: currentServerId,
              channelId: currentVoiceChannelId
          });
      }

      const stream = myScreenStreamRef.current;
      if (stream) {
          stream.getTracks().forEach(t => t.stop());

          Object.values(peersRef.current).forEach(p => {
              try { p.removeStream(stream); } catch(e){}
          });

          setMyScreenStream(null);
          myScreenStreamRef.current = null;
      }
  };

  // KULLANICI KATILDIĞINDA (Kritik Nokta)
  const handleUserJoined = ({ socketId, userId }) => {
      if (userId) socketUserMapRef.current[socketId] = userId;

      const audioStream = processedStreamRef.current || localStreamRef.current;

      // 🟢 KRİTİK: Burada state yerine REF kullanıyoruz.
      // Çünkü bu fonksiyon useEffect içinde tanımlandığı için state'in eski (null) halini görüyor olabilir.
      // Ref ise her zaman güncel değeri verir.
      const screenStream = myScreenStreamRef.current;

      const streams = [audioStream, screenStream].filter(Boolean);

      createPeer(socketId, true, streams, userId);
  };

  // ... (Ses İşleme, Gate, Join/Leave fonksiyonları aynı kalacak) ...
  // Yer tasarrufu için değişmeyen kısımları kısa tutuyorum, lütfen önceki VoiceContext'in geri kalanını koru.
  // processAudioStream, startGateAnalysis, updateSpeakingStatus, cleanupMediaOnly, joinVoiceChannel vb.
  // Sadece yukarıdaki startScreenShare, stopScreenShare ve handleUserJoined değişti.

  // --- KOPYALA YAPIŞTIR İÇİN GEREKLİ ALT FONKSİYONLAR (Eksiksiz olsun diye ekliyorum) ---
  const processAudioStream = async (rawStream) => {
      try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return rawStream;
          const audioCtx = new AudioContext();
          if (audioCtx.state === 'suspended') await audioCtx.resume();
          const source = audioCtx.createMediaStreamSource(rawStream);
          const destination = audioCtx.createMediaStreamDestination();
          const inputGain = audioCtx.createGain();
          const startVol = inputVolume > 100 ? 1.0 + ((inputVolume - 100) / 30) : inputVolume / 100;
          inputGain.gain.value = inputVolume === 0 ? 0 : startVol;
          inputGainNodeRef.current = inputGain;
          let currentNode = source; currentNode.connect(inputGain); currentNode = inputGain;

          if (isNoiseSuppression) {
              const highPass = audioCtx.createBiquadFilter(); highPass.type = 'highpass'; highPass.frequency.value = LOW_CUT_FREQ; highPass.Q.value = 0.7;
              const lowPass = audioCtx.createBiquadFilter(); lowPass.type = 'lowpass'; lowPass.frequency.value = HIGH_CUT_FREQ; lowPass.Q.value = 0.6;
              const gateGain = audioCtx.createGain(); gateGain.gain.value = 0; gateGainNodeRef.current = gateGain;
              const compressor = audioCtx.createDynamicsCompressor(); compressor.threshold.value = -30; compressor.ratio.value = 12;
              currentNode.connect(highPass); highPass.connect(lowPass); lowPass.connect(gateGain); gateGain.connect(compressor); compressor.connect(destination);
              const analyser = audioCtx.createAnalyser(); lowPass.connect(analyser);
              startGateAnalysis(analyser, gateGain, audioCtx);
          } else {
              currentNode.connect(destination);
              startGateAnalysis(null, null, null, rawStream);
          }
          audioContextRef.current = audioCtx;
          return destination.stream;
      } catch (e) { return rawStream; }
  };

  const startGateAnalysis = (analyser, gateGainNode, audioCtx, rawStreamForSimpleMode = null) => {
      if (rawStreamForSimpleMode) {
           try {
               const simpleCtx = new AudioContext(); const simpleAnalyser = simpleCtx.createAnalyser(); const simpleSrc = simpleCtx.createMediaStreamSource(rawStreamForSimpleMode); simpleSrc.connect(simpleAnalyser);
               const checkLoop = () => {
                   if (simpleCtx.state === 'closed') return;
                   if (inputMode === 'PUSH_TO_TALK') {
                       if (!isPTTPressedRef.current) { updateSpeakingStatus(false); requestAnimationFrame(checkLoop); return; }
                       updateSpeakingStatus(true); requestAnimationFrame(checkLoop); return;
                   }
                   const arr = new Uint8Array(simpleAnalyser.frequencyBinCount); simpleAnalyser.getByteFrequencyData(arr); let sum = 0; for(let i=0; i<arr.length; i++) sum+=arr[i];
                   updateSpeakingStatus((sum/arr.length) > 10); requestAnimationFrame(checkLoop);
               }; checkLoop();
           } catch(e){} return;
      }
      analyser.fftSize = 512; const bufferLength = analyser.frequencyBinCount; const dataArray = new Uint8Array(bufferLength);
      const checkVolume = () => {
          if (!gateGainNode || audioCtx.state === 'closed') return;
          if (inputMode === 'PUSH_TO_TALK') {
              gateGainNode.gain.setTargetAtTime(isPTTPressedRef.current ? 1 : 0, audioCtx.currentTime, isPTTPressedRef.current ? 0.01 : 0.05);
              updateSpeakingStatus(isPTTPressedRef.current);
              requestAnimationFrame(checkVolume); return;
          }
          analyser.getByteFrequencyData(dataArray);
          let sum = 0; let count = 0; for (let i = 10; i < 50 && i < bufferLength; i++) { sum += dataArray[i]; count++; }
          const average = count > 0 ? sum / count : 0;
          if ((average / 255) > GATE_THRESHOLD) { gateGainNode.gain.setTargetAtTime(1, audioCtx.currentTime, 0.01); updateSpeakingStatus(true); }
          else { gateGainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1); updateSpeakingStatus(false); }
          requestAnimationFrame(checkVolume);
      }; checkVolume();
  };

  const updateSpeakingStatus = (isSpeaking) => { if (isSpeakingRef.current !== isSpeaking) { isSpeakingRef.current = isSpeaking; if (currentServerId && user) { const event = isSpeaking ? 'speaking-start' : 'speaking-stop'; socketRef.current?.emit(event, { serverId: currentServerId, userId: user.id }); } if (user) setSpeakingUsers(prev => ({ ...prev, [user.id]: isSpeaking })); } };
  const cleanupMediaOnly = () => {
      Object.keys(peersRef.current).forEach(id => { peersRef.current[id]?.destroy(); audioElementsRef.current[id]?.remove(); });
      peersRef.current = {}; audioElementsRef.current = {}; socketUserMapRef.current = {}; setPeersWithVideo({}); setSpeakingUsers({}); isSpeakingRef.current = false;
      if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
      if (processedStreamRef.current) processedStreamRef.current = null;
      // Ekran paylaşımı temizliği
      if (myScreenStreamRef.current) { myScreenStreamRef.current.getTracks().forEach(t => t.stop()); myScreenStreamRef.current = null; setMyScreenStream(null); }
      if (audioContextRef.current) { audioContextRef.current.close().catch(()=>{}); audioContextRef.current = null; }
  };
  const handleChannelMoved = ({ newChannelId, serverId, channelName }) => { cleanupMediaOnly(); setCurrentVoiceChannelId(newChannelId); setCurrentServerId(serverId); if(channelName) setCurrentVoiceChannelName(channelName); joinVoiceChannel(serverId, newChannelId); };

  const joinVoiceChannel = async (server, channel) => {
    const sId = server._id || server; const cId = channel._id || channel;
    if (!window.isSecureContext && window.location.hostname !== 'localhost') { alert("HTTPS gerekli!"); return; }
    if (currentVoiceChannelId === cId) return;
    if (currentVoiceChannelId) { cleanupMediaOnly(); socketRef.current?.emit('leave-voice-channel'); }
    setCurrentVoiceChannelId(cId); setCurrentServerId(sId); setStayConnected(true);
    if(server.name) setCurrentServerName(server.name); if(channel.name) setCurrentVoiceChannelName(channel.name);
    try {
      const constraints = { audio: { deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined, echoCancellation: !!isNoiseSuppression, noiseSuppression: !!isNoiseSuppression, autoGainControl: false, googEchoCancellation: true, googNoiseSuppression: true, googTypingNoiseDetection: true }, video: false };
      if (!isNoiseSuppression) { constraints.audio = { deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined }; }
      let rawStream; try { rawStream = await navigator.mediaDevices.getUserMedia(constraints); } catch (e) { rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
      localStreamRef.current = rawStream;
      let streamToSend = await processAudioStream(rawStream);
      processedStreamRef.current = streamToSend;
      const shouldEnable = !isMicMuted; rawStream.getAudioTracks().forEach(track => { track.enabled = shouldEnable; }); streamToSend.getAudioTracks().forEach(track => { track.enabled = shouldEnable; });
      if (!isNoiseSuppression) startGateAnalysis(null, null, null, rawStream);
      socketRef.current.emit('join-voice-channel', { serverId: sId, channelId: cId, userId: user?._id || user?.id, username: user?.username });
    } catch (err) { setMicError("Mikrofon hatası"); addToast('Hata', 'error'); }
  };

  const leaveVoiceChannel = () => { setStayConnected(false); setCurrentVoiceChannelId(null); setCurrentServerId(null); socketRef.current?.emit('leave-voice-channel'); cleanupMediaOnly(); };
  const rejoinChannel = () => {};

  // Peer Oluşturma (Değişiklik yok, handleUserJoined'dan gelen streamleri kullanır)
  const createPeer = (targetSocketId, initiator, streams = [], userId = null) => {
      const p = new Peer({ initiator, trickle: false, streams, config: rtcConfig });
      p.on('signal', data => socketRef.current?.emit(initiator ? 'webrtc-offer' : 'webrtc-answer', { targetSocketId, sdp: data, userId: user?.id }));
      p.on('stream', stream => handleRemoteStream(stream, targetSocketId, userId));
      peersRef.current[targetSocketId] = p; return p;
  };

  const handleOffer = ({ socketId, sdp, userId }) => {
      if (userId) socketUserMapRef.current[socketId] = userId;
      if(peersRef.current[socketId]) peersRef.current[socketId].destroy();
      const audioStream = processedStreamRef.current || localStreamRef.current;
      const screenStream = myScreenStreamRef.current; // Ref Kullanımı
      const streams = [audioStream, screenStream].filter(Boolean);
      const p = createPeer(socketId, false, streams, userId);
      p.signal(sdp);
  };

  const handleAnswer = ({ socketId, sdp }) => peersRef.current[socketId]?.signal(sdp);
  const handleIce = ({ socketId, candidate }) => peersRef.current[socketId]?.signal(candidate);

  const handleUserLeft = ({ socketId }) => {
      peersRef.current[socketId]?.destroy(); delete peersRef.current[socketId];
      audioElementsRef.current[socketId]?.remove(); delete audioElementsRef.current[socketId];
      delete socketUserMapRef.current[socketId];
      setPeersWithVideo(prev => { const n={...prev}; delete n[socketId]; return n; });
  };

  const handleRemoteStream = (stream, socketId, userId) => {
      if (userId) socketUserMapRef.current[socketId] = userId;
      if (stream.getVideoTracks().length > 0) { setPeersWithVideo(prev => ({ ...prev, [socketId]: stream })); }
      else {
          if (audioElementsRef.current[socketId]) audioElementsRef.current[socketId].remove();
          const audio = document.createElement('audio'); audio.srcObject = stream; audio.autoplay = true; audio.style.display = 'none'; document.body.appendChild(audio);
          if (outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(()=>{});
          audioElementsRef.current[socketId] = audio; applyVolumeSettings();
      }
  };

  useEffect(() => { if (!audioElementsRef.current) return; Object.values(audioElementsRef.current).forEach((audio) => { if (!audio) return; audio.muted = isDeafened; if(outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(e=>{}); }); }, [isDeafened, outputDeviceId, userVolumes]);
  useEffect(() => { const applyMute = (stream) => { if(stream) stream.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; }); }; applyMute(localStreamRef.current); applyMute(processedStreamRef.current); }, [isMicMuted]);

  return (
    <VoiceContext.Provider value={{ socket: socketRef.current, isConnected, currentVoiceChannelId, currentServerId, currentVoiceChannelName, currentServerName, joinVoiceChannel, leaveVoiceChannel, speakingUsers, micError, stayConnected, peersWithVideo, myScreenStream, startScreenShare, stopScreenShare }}>
      {children}
    </VoiceContext.Provider>
  );
};