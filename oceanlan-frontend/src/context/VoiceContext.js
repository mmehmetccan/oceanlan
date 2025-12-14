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

const GATE_THRESHOLD = 0.03;
const LOW_CUT_FREQ = 120;
const VOCAL_BOOST_FREQ = 3000;

export const VoiceProvider = ({ children }) => {
  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const processedStreamRef = useRef(null);
  const audioElementsRef = useRef({}); // <audio> elementlerini tutar

  const audioContextRef = useRef(null);
  const gateGainNodeRef = useRef(null);
  // 🟢 YENİ: Kendi mikrofon sesimizi açıp kısmak için GainNode
  const inputGainNodeRef = useRef(null);

  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const isPTTPressedRef = useRef(false);

  const { user, token } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const audioSettings = useContext(AudioSettingsContext);

  const {
      inputDeviceId, outputDeviceId, isMicMuted, isDeafened,
      userVolumes, // 🟢 Başkalarının sesi
      inputVolume, // 🟢 Kendi mikrofon seviyemiz
      isNoiseSuppression, inputMode = 'VOICE_ACTIVITY', pushToTalkKey = 'Space'
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

  useEffect(() => {
    if (!token || socketRef.current) return;
    const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;
    const isProductionUrl = window.location.hostname.includes('oceanlan.com');
    let backendUrl = (isElectron || isProductionUrl) ? 'https://oceanlan.com' : 'http://localhost:4000';
    socketRef.current = io(backendUrl, { auth: { token }, transports: ['polling', 'websocket'], secure: true, reconnection: true });

    socketRef.current.on('connect', () => { setIsConnected(true); if (stayConnected && currentVoiceChannelId) rejoinChannel(); });
    socketRef.current.on('disconnect', () => setIsConnected(false));
    socketRef.current.on('user-joined-voice', handleUserJoined);
    socketRef.current.on('webrtc-offer', handleOffer);
    socketRef.current.on('webrtc-answer', handleAnswer);
    socketRef.current.on('webrtc-ice-candidate', handleIce);
    socketRef.current.on('user-left-voice', handleUserLeft);
    socketRef.current.on('voice-channel-moved', handleChannelMoved);
    socketRef.current.on('user-speaking-change', ({ userId, isSpeaking }) => setSpeakingUsers(prev => ({ ...prev, [userId]: isSpeaking })));
    return () => {};
  }, [token]);

  // Ayar değişince mikrofonu yenile
  useEffect(() => {
    if (currentVoiceChannelId && stayConnected) {
        joinVoiceChannel({ _id: currentServerId }, { _id: currentVoiceChannelId });
    }
  }, [isNoiseSuppression]);

  // 🟢 1. DÜZELTME: BAŞKALARININ SES SEVİYESİNİ CANLI UYGULA
  // userVolumes state'i değiştiğinde (MemberContextMenu'dan), audio elementinin sesini güncelle
  useEffect(() => {
      if (!audioElementsRef.current) return;

      Object.keys(userVolumes).forEach(userId => {
          const audioElement = audioElementsRef.current[userId];
          if (audioElement) {
              const volume = userVolumes[userId]; // 0 ile 200 arası
              // HTML Audio volume 0.0 ile 1.0 arasındadır.
              // 100 üstü için yazılımsal gain gerekir ama basit çözüm: 100 = 1.0
              // Eğer 200'e kadar boost istiyorsan WebAudioAPI gain node gerekir,
              // şimdilik basit volume kontrolü:
              audioElement.volume = Math.min(volume / 100, 1.0);
          }
      });
  }, [userVolumes]);

  // 🟢 2. DÜZELTME: KENDİ MİKROFON SESİMİZİ (GAIN) CANLI UYGULA
  useEffect(() => {
      if (inputGainNodeRef.current && audioContextRef.current) {
          // inputVolume 0-200 arası geliyor.
          // 100 = 1.0 (Normal), 200 = 2.0 (İki kat ses), 50 = 0.5 (Yarı ses)
          const gainValue = inputVolume / 100;
          inputGainNodeRef.current.gain.setTargetAtTime(gainValue, audioContextRef.current.currentTime, 0.1);
      }
  }, [inputVolume]);

  // PTT Dinleyicisi
  useEffect(() => {
      const handleKeyDown = (e) => {
          if (inputMode !== 'PUSH_TO_TALK' || isMicMuted) return;
          if (e.code === pushToTalkKey || e.key === pushToTalkKey) {
              if (!isPTTPressedRef.current) { isPTTPressedRef.current = true; setMicEnabled(true); updateSpeakingStatus(true); }
          }
      };
      const handleKeyUp = (e) => {
          if (inputMode !== 'PUSH_TO_TALK') return;
          if (e.code === pushToTalkKey || e.key === pushToTalkKey) { isPTTPressedRef.current = false; setMicEnabled(false); updateSpeakingStatus(false); }
      };
      window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
      if (inputMode === 'PUSH_TO_TALK') setMicEnabled(false); else setMicEnabled(!isMicMuted);
      return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [inputMode, pushToTalkKey, isMicMuted]);

  const setMicEnabled = (enabled) => {
      [localStreamRef.current, processedStreamRef.current].forEach(s => s?.getAudioTracks().forEach(t => t.enabled = enabled));
  };

  const processAudioStream = async (rawStream) => {
      // 🟢 Gürültü engelleme kapalı olsa bile MİKROFON SES AYARI (Gain) çalışmalı
      // Bu yüzden AudioContext her zaman gerekli
      try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return rawStream;
          const audioCtx = new AudioContext();
          if (audioCtx.state === 'suspended') await audioCtx.resume();

          const source = audioCtx.createMediaStreamSource(rawStream);
          const destination = audioCtx.createMediaStreamDestination();

          // 🟢 INPUT GAIN NODE (Mikrofon Sesi Ayarı İçin)
          const inputGain = audioCtx.createGain();
          inputGain.gain.value = inputVolume / 100; // Başlangıç seviyesi
          inputGainNodeRef.current = inputGain;

          // Zincir başlangıcı
          let currentNode = source;

          // Eğer gürültü engelleme açıksa filtreleri ekle
          if (isNoiseSuppression) {
              const highPass = audioCtx.createBiquadFilter();
              highPass.type = 'highpass'; highPass.frequency.value = LOW_CUT_FREQ; highPass.Q.value = 0.7;

              const vocalBoost = audioCtx.createBiquadFilter();
              vocalBoost.type = 'peaking'; vocalBoost.frequency.value = VOCAL_BOOST_FREQ; vocalBoost.Q.value = 1; vocalBoost.gain.value = 3;

              const compressor = audioCtx.createDynamicsCompressor();
              compressor.threshold.value = -45; compressor.knee.value = 30; compressor.ratio.value = 8; compressor.attack.value = 0.01; compressor.release.value = 0.20;

              const gateGain = audioCtx.createGain();
              gateGain.gain.value = 0;
              gateGainNodeRef.current = gateGain;

              // Bağlantı: Source -> InputGain -> HighPass -> VocalBoost -> Gate -> Compressor -> Dest
              currentNode.connect(inputGain);
              inputGain.connect(highPass);
              highPass.connect(vocalBoost);
              vocalBoost.connect(gateGain);
              gateGain.connect(compressor);
              compressor.connect(destination);

              // Analiz (Gate için)
              const analyser = audioCtx.createAnalyser();
              vocalBoost.connect(analyser);
              startGateAnalysis(analyser, gateGain, audioCtx);
          } else {
              // Gürültü engelleme KAPALIYSA: Source -> InputGain -> Dest
              // Sadece ses açıp kısma çalışır, filtreler çalışmaz.
              currentNode.connect(inputGain);
              inputGain.connect(destination);

              // Basit analiz (Yeşil ışık için)
              startGateAnalysis(null, null, null, rawStream);
          }

          audioContextRef.current = audioCtx;
          return destination.stream;

      } catch (e) { console.error("Ses işleme hatası:", e); return rawStream; }
  };

  const startGateAnalysis = (analyser, gateGainNode, audioCtx, rawStreamForSimpleMode = null) => {
      if (rawStreamForSimpleMode) {
           try {
               const simpleCtx = new AudioContext();
               const simpleAnalyser = simpleCtx.createAnalyser();
               const simpleSrc = simpleCtx.createMediaStreamSource(rawStreamForSimpleMode);
               simpleSrc.connect(simpleAnalyser);
               const checkLoop = () => {
                   if (simpleCtx.state === 'closed') return;
                   if (inputMode === 'PUSH_TO_TALK' && !isPTTPressedRef.current) { updateSpeakingStatus(false); animationFrameRef.current = requestAnimationFrame(checkLoop); return; }
                   const arr = new Uint8Array(simpleAnalyser.frequencyBinCount);
                   simpleAnalyser.getByteFrequencyData(arr);
                   let sum = 0; for(let i=0; i<arr.length; i++) sum+=arr[i];
                   updateSpeakingStatus((sum/arr.length) > 10);
                   animationFrameRef.current = requestAnimationFrame(checkLoop);
               };
               checkLoop();
           } catch(e){}
           return;
      }

      analyser.fftSize = 512;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
          if (!gateGainNode || audioCtx.state === 'closed') return;
          if (inputMode === 'PUSH_TO_TALK' && !isPTTPressedRef.current) {
              gateGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
              updateSpeakingStatus(false);
              animationFrameRef.current = requestAnimationFrame(checkVolume);
              return;
          }

          analyser.getByteFrequencyData(dataArray);
          let sum = 0; let count = 0;
          for (let i = 1; i < 40 && i < bufferLength; i++) { sum += dataArray[i]; count++; }
          const average = count > 0 ? sum / count : 0;
          const normalizedVol = average / 255;

          if (normalizedVol > GATE_THRESHOLD) {
              gateGainNode.gain.setTargetAtTime(1, audioCtx.currentTime, 0.02);
              updateSpeakingStatus(true);
          } else {
              gateGainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.15);
              updateSpeakingStatus(false);
          }
          animationFrameRef.current = requestAnimationFrame(checkVolume);
      };
      checkVolume();
  };

  const updateSpeakingStatus = (isSpeaking) => {
      if (inputMode === 'PUSH_TO_TALK' && !isPTTPressedRef.current) isSpeaking = false;
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
      peersRef.current = {}; audioElementsRef.current = {}; setPeersWithVideo({}); setSpeakingUsers({}); isSpeakingRef.current = false;
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
    if (!window.isSecureContext && window.location.hostname !== 'localhost') { alert("HTTPS gerekli!"); return; }
    if (currentVoiceChannelId && stayConnected) { if (socketRef.current) socketRef.current.emit('leave-voice-channel'); cleanupMediaOnly(); await new Promise(r => setTimeout(r, 100)); }
    setCurrentVoiceChannelId(cId); setCurrentServerId(sId); setStayConnected(true);
    if(server.name) setCurrentServerName(server.name);
    if(channel.name) setCurrentVoiceChannelName(channel.name);
    try {
      let rawStream;
      const constraints = { audio: { deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true, googEchoCancellation: true, googAutoGainControl: true, googNoiseSuppression: true, googHighpassFilter: true, googTypingNoiseDetection: true }, video: false };
      if (!isNoiseSuppression) { constraints.audio = { deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false }; }

      try { rawStream = await navigator.mediaDevices.getUserMedia(constraints); } catch (err1) { rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
      localStreamRef.current = rawStream;

      // 🟢 SES İŞLEME DEVREYE GİRİYOR (Gain için her zaman çalışır)
      let streamToSend = await processAudioStream(rawStream);
      processedStreamRef.current = streamToSend;

      const shouldEnable = inputMode === 'PUSH_TO_TALK' ? false : !isMicMuted;
      rawStream.getAudioTracks().forEach(track => { track.enabled = shouldEnable; });
      streamToSend.getAudioTracks().forEach(track => { track.enabled = shouldEnable; });

      socketRef.current.emit('join-voice-channel', { serverId: sId, channelId: cId, userId: user?._id || user?.id, username: user?.username });
    } catch (err) { console.error("Mic Error:", err); setMicError("Mikrofon hatası"); addToast("Mikrofon açılamadı.", "error"); }
  };

  const leaveVoiceChannel = () => { setStayConnected(false); setCurrentVoiceChannelId(null); setCurrentServerId(null); socketRef.current?.emit('leave-voice-channel'); cleanupMediaOnly(); };
  const rejoinChannel = () => {};
  const handleUserJoined = ({ socketId }) => { const stream = processedStreamRef.current || localStreamRef.current; const streams = [stream, myScreenStream].filter(Boolean); createPeer(socketId, true, streams); };
  const handleOffer = ({ socketId, sdp }) => { if(peersRef.current[socketId]) peersRef.current[socketId].destroy(); const stream = processedStreamRef.current || localStreamRef.current; const streams = [stream, myScreenStream].filter(Boolean); const p = createPeer(socketId, false, streams); p.signal(sdp); };
  const handleAnswer = ({ socketId, sdp }) => peersRef.current[socketId]?.signal(sdp);
  const handleIce = ({ socketId, candidate }) => peersRef.current[socketId]?.signal(candidate);
  const handleUserLeft = ({ socketId }) => { peersRef.current[socketId]?.destroy(); delete peersRef.current[socketId]; audioElementsRef.current[socketId]?.remove(); delete audioElementsRef.current[socketId]; setPeersWithVideo(prev => { const n={...prev}; delete n[socketId]; return n; }); };
  const createPeer = (targetSocketId, initiator, streams = []) => { const p = new Peer({ initiator, trickle: false, streams, config: rtcConfig }); p.on('signal', data => socketRef.current?.emit(initiator ? 'webrtc-offer' : 'webrtc-answer', { targetSocketId, sdp: data })); p.on('stream', stream => handleRemoteStream(stream, targetSocketId)); peersRef.current[targetSocketId] = p; return p; };

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

          // 🟢 YENİ GELEN KULLANICININ SESİNİ DE AYARLA
          // Eğer bu kullanıcı için daha önceden ayarlanmış bir ses seviyesi varsa uygula
          const userId = Object.keys(userVolumes).find(uid => uid === id); // ID eşleşmesi backend'e göre değişebilir
          // Basitçe:
          const initialVolume = userVolumes[id] !== undefined ? userVolumes[id] / 100 : 1.0;
          audio.volume = initialVolume;

          audioElementsRef.current[id] = audio;
      }
  };

  const startScreenShare = async (electronSourceId = null) => { try { let stream; if (window.electronAPI && electronSourceId) { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: electronSourceId } } }); } else { stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); } setMyScreenStream(stream); Object.values(peersRef.current).forEach(p => p.addStream(stream)); stream.getVideoTracks()[0].onended = () => stopScreenShare(); } catch (err) {} };
  const stopScreenShare = () => { if (myScreenStream) { myScreenStream.getTracks().forEach(t => t.stop()); Object.values(peersRef.current).forEach(p => { try { p.removeStream(myScreenStream); } catch(e){} }); setMyScreenStream(null); } };
  useEffect(() => { if (!audioElementsRef.current) return; Object.values(audioElementsRef.current).forEach((audio) => { if (!audio) return; audio.muted = isDeafened; if(outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(e=>{}); }); }, [isDeafened, outputDeviceId, userVolumes]);
  useEffect(() => { const applyMute = (stream) => { if(stream) stream.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; }); }; applyMute(localStreamRef.current); applyMute(processedStreamRef.current); }, [isMicMuted]);

  return (
    <VoiceContext.Provider value={{
      socket: socketRef.current, isConnected, currentVoiceChannelId, currentServerId, currentVoiceChannelName, currentServerName, joinVoiceChannel, leaveVoiceChannel, speakingUsers, micError, stayConnected, peersWithVideo, myScreenStream, startScreenShare, stopScreenShare
    }}>
      {children}
    </VoiceContext.Provider>
  );
};