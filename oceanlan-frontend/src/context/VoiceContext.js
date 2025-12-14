// src/context/VoiceContext.js
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

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const inputGainNodeRef = useRef(null);
  const gateGainNodeRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const isPTTPressedRef = useRef(false); // PTT Durumu

  const { user, token, isAuthenticated } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const audioSettings = useContext(AudioSettingsContext);

  const {
      inputDeviceId, outputDeviceId, isMicMuted, isDeafened,
      userVolumes, isNoiseSuppression, inputVolume = 100,
      inputMode = 'VOICE_ACTIVITY',
      pttKey, pttKeyCode // 🟢 KODU ALDIK
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

  // ... (SOCKET EFFECT KISMI AYNI - DEĞİŞTİRME) ...
  // Lütfen önceki kodundaki Socket useEffect'ini buraya aynen koy veya silmediysen bırak.
  // Yer kaplamasın diye tekrar yazmıyorum, yukarıdaki versiyonlardaki "Socket Bağlantısı" kısmının aynısı.
  useEffect(() => {
    if (!token || !isAuthenticated) { if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; setIsConnected(false); } return; }
    if (socketRef.current && socketRef.current.connected) return;
    const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;
    const isProductionUrl = window.location.hostname.includes('oceanlan.com');
    let backendUrl = 'http://localhost:4000';
    if (isElectron || isProductionUrl) backendUrl = 'https://oceanlan.com';
    socketRef.current = io(backendUrl, { auth: { token }, transports: ['polling', 'websocket'], secure: true, reconnection: true, autoConnect: true });
    socketRef.current.on('connect', () => { setIsConnected(true); if (stayConnected && currentVoiceChannelId) rejoinChannel(); });
    socketRef.current.on('disconnect', () => setIsConnected(false));
    socketRef.current.on('user-joined-voice', handleUserJoined);
    socketRef.current.on('webrtc-offer', handleOffer);
    socketRef.current.on('webrtc-answer', handleAnswer);
    socketRef.current.on('webrtc-ice-candidate', handleIce);
    socketRef.current.on('user-left-voice', handleUserLeft);
    socketRef.current.on('voice-channel-moved', handleChannelMoved);
    socketRef.current.on('user-speaking-change', ({ userId, isSpeaking }) => setSpeakingUsers(prev => ({ ...prev, [userId]: isSpeaking })));
    socketRef.current.on('voiceStateUpdate', (serverState) => { if (!serverState) return; Object.values(serverState).forEach(channelUsers => channelUsers.forEach(u => socketUserMapRef.current[u.socketId] = u.userId)); applyVolumeSettings(); });
    return () => { if (socketRef.current) socketRef.current.disconnect(); };
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

  // 🟢 2. PTT DİNLEYİCİSİ (KLAVYE + MOUSE + REPEAT ENGELİ)
  useEffect(() => {
      // PTT değilse veya mute ise dinleme
      if (inputMode !== 'PUSH_TO_TALK') {
          isPTTPressedRef.current = false;
          return;
      }

      const handleDown = (e) => {
          if (isMicMuted) return;

          // Klavye Kontrolü
          if (e.type === 'keydown') {
              if (e.repeat) return; // Basılı tutarken sürekli tetiklemeyi engelle
              if (e.code === pttKeyCode) {
                  isPTTPressedRef.current = true;
                  updateSpeakingStatus(true); // Işık yansın
              }
          }
          // Mouse Kontrolü
          else if (e.type === 'mousedown') {
              if (e.button === pttKeyCode) {
                  isPTTPressedRef.current = true;
                  updateSpeakingStatus(true);
              }
          }
      };

      const handleUp = (e) => {
          // Klavye
          if (e.type === 'keyup') {
              if (e.code === pttKeyCode) {
                  isPTTPressedRef.current = false;
                  updateSpeakingStatus(false);
              }
          }
          // Mouse
          else if (e.type === 'mouseup') {
              if (e.button === pttKeyCode) {
                  isPTTPressedRef.current = false;
                  updateSpeakingStatus(false);
              }
          }
      };

      window.addEventListener('keydown', handleDown);
      window.addEventListener('keyup', handleUp);
      window.addEventListener('mousedown', handleDown);
      window.addEventListener('mouseup', handleUp);

      return () => {
          window.removeEventListener('keydown', handleDown);
          window.removeEventListener('keyup', handleUp);
          window.removeEventListener('mousedown', handleDown);
          window.removeEventListener('mouseup', handleUp);
      };
  }, [inputMode, pttKeyCode, isMicMuted]);

  // ... (SES İŞLEME AYNI - Sadece Gate Kısmı Değişti) ...
  const processAudioStream = async (rawStream) => {
      // ... (Ses işleme kodu aynı, sadece startGateAnalysis çağrılıyor) ...
      // Kodu kısaltmak için burayı atlıyorum, önceki cevaptaki logic birebir aynı.
      // Sadece startGateAnalysis içine PTT kontrolü ekleyeceğiz.
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
          let currentNode = source;
          currentNode.connect(inputGain);
          currentNode = inputGain;

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

  // 🟢 3. PTT ENTEGRELİ GATE ANALİZİ
  const startGateAnalysis = (analyser, gateGainNode, audioCtx, rawStreamForSimpleMode = null) => {
      if (rawStreamForSimpleMode) {
           // Basit mod (Mobil)
           try {
               const simpleCtx = new AudioContext(); const simpleAnalyser = simpleCtx.createAnalyser(); const simpleSrc = simpleCtx.createMediaStreamSource(rawStreamForSimpleMode); simpleSrc.connect(simpleAnalyser);
               const checkLoop = () => {
                   if (simpleCtx.state === 'closed') return;
                   // 🔴 PTT KONTROLÜ
                   if (inputMode === 'PUSH_TO_TALK') {
                       // Tuşa basılı değilse SUS
                       if (!isPTTPressedRef.current) { updateSpeakingStatus(false); requestAnimationFrame(checkLoop); return; }
                       // Tuşa basılıysa, ses var mı diye bak (Opsiyonel: PTT'de ses kontrolü istenmezse direkt true yap)
                       // Genelde PTT'de direkt ses gider:
                       updateSpeakingStatus(true);
                       requestAnimationFrame(checkLoop);
                       return;
                   }
                   const arr = new Uint8Array(simpleAnalyser.frequencyBinCount); simpleAnalyser.getByteFrequencyData(arr); let sum = 0; for(let i=0; i<arr.length; i++) sum+=arr[i];
                   updateSpeakingStatus((sum/arr.length) > 10); requestAnimationFrame(checkLoop);
               }; checkLoop();
           } catch(e){} return;
      }

      analyser.fftSize = 512;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
          if (!gateGainNode || audioCtx.state === 'closed') return;

          // 🔴 PTT KONTROLÜ (GATE İÇİN)
          if (inputMode === 'PUSH_TO_TALK') {
              if (isPTTPressedRef.current) {
                  // Tuşa basılı -> Kapıyı Sonuna Kadar Aç
                  gateGainNode.gain.setTargetAtTime(1, audioCtx.currentTime, 0.01);
                  updateSpeakingStatus(true);
              } else {
                  // Tuş Bırakıldı -> Kapat
                  gateGainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
                  updateSpeakingStatus(false);
              }
              requestAnimationFrame(checkVolume);
              return;
          }

          // Voice Activity Logic
          analyser.getByteFrequencyData(dataArray);
          let sum = 0; let count = 0; for (let i = 10; i < 50 && i < bufferLength; i++) { sum += dataArray[i]; count++; }
          const average = count > 0 ? sum / count : 0;
          const normalizedVol = average / 255;

          if (normalizedVol > GATE_THRESHOLD) {
              gateGainNode.gain.setTargetAtTime(1, audioCtx.currentTime, 0.01);
              updateSpeakingStatus(true);
          } else {
              gateGainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
              updateSpeakingStatus(false);
          }
          requestAnimationFrame(checkVolume);
      };
      checkVolume();
  };

  // ... (Geri kalan tüm fonksiyonlar: updateSpeakingStatus, handleUserJoined, createPeer vb. AYNI) ...
  const updateSpeakingStatus = (isSpeaking) => { if (isSpeakingRef.current !== isSpeaking) { isSpeakingRef.current = isSpeaking; if (currentServerId && user) { const event = isSpeaking ? 'speaking-start' : 'speaking-stop'; socketRef.current?.emit(event, { serverId: currentServerId, userId: user.id }); } if (user) setSpeakingUsers(prev => ({ ...prev, [user.id]: isSpeaking })); } };
  const cleanupMediaOnly = () => { Object.keys(peersRef.current).forEach(id => { peersRef.current[id]?.destroy(); audioElementsRef.current[id]?.remove(); }); peersRef.current = {}; audioElementsRef.current = {}; socketUserMapRef.current = {}; setPeersWithVideo({}); setSpeakingUsers({}); isSpeakingRef.current = false; if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; } if (processedStreamRef.current) processedStreamRef.current = null; if (myScreenStream) { myScreenStream.getTracks().forEach(t => t.stop()); setMyScreenStream(null); } if (audioContextRef.current) { audioContextRef.current.close().catch(()=>{}); audioContextRef.current = null; } };
  const handleChannelMoved = ({ newChannelId, serverId, channelName }) => { cleanupMediaOnly(); setCurrentVoiceChannelId(newChannelId); setCurrentServerId(serverId); if(channelName) setCurrentVoiceChannelName(channelName); joinVoiceChannel(serverId, newChannelId); };

  const joinVoiceChannel = async (server, channel) => {
    const sId = server._id || server; const cId = channel._id || channel;
    if (!window.isSecureContext && window.location.hostname !== 'localhost') { alert("HTTPS gerekli!"); return; }
    if (currentVoiceChannelId === cId) return;
    if (currentVoiceChannelId) { cleanupMediaOnly(); socketRef.current?.emit('leave-voice-channel'); }
    setCurrentVoiceChannelId(cId); setCurrentServerId(sId); setStayConnected(true);
    if(server.name) setCurrentServerName(server.name); if(channel.name) setCurrentVoiceChannelName(channel.name);
    try {
      const constraints = { audio: { deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: false, googEchoCancellation: true, googAutoGainControl: false, googNoiseSuppression: true, googHighpassFilter: true, googTypingNoiseDetection: true }, video: false };
      if (!isNoiseSuppression) { constraints.audio = { deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false }; }
      let rawStream; try { rawStream = await navigator.mediaDevices.getUserMedia(constraints); } catch (e) { rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
      localStreamRef.current = rawStream;
      let streamToSend = await processAudioStream(rawStream);
      processedStreamRef.current = streamToSend;
      const shouldEnable = !isMicMuted;
      rawStream.getAudioTracks().forEach(track => { track.enabled = shouldEnable; });
      streamToSend.getAudioTracks().forEach(track => { track.enabled = shouldEnable; });
      if (!isNoiseSuppression) startGateAnalysis(null, null, null, rawStream);
      socketRef.current.emit('join-voice-channel', { serverId: sId, channelId: cId, userId: user?._id || user?.id, username: user?.username });
    } catch (err) { setMicError("Mikrofon hatası"); addToast('Hata', 'error'); }
  };

  const leaveVoiceChannel = () => { setStayConnected(false); setCurrentVoiceChannelId(null); setCurrentServerId(null); socketRef.current?.emit('leave-voice-channel'); cleanupMediaOnly(); };
  const rejoinChannel = () => {};
  const handleUserJoined = ({ socketId, userId }) => { if (userId) socketUserMapRef.current[socketId] = userId; const stream = processedStreamRef.current || localStreamRef.current; const streams = [stream, myScreenStream].filter(Boolean); createPeer(socketId, true, streams, userId); };
  const handleOffer = ({ socketId, sdp, userId }) => { if (userId) socketUserMapRef.current[socketId] = userId; if(peersRef.current[socketId]) peersRef.current[socketId].destroy(); const streamToSend = processedStreamRef.current || localStreamRef.current; const streams = [streamToSend, myScreenStream].filter(Boolean); const p = createPeer(socketId, false, streams, userId); p.signal(sdp); };
  const handleAnswer = ({ socketId, sdp }) => peersRef.current[socketId]?.signal(sdp);
  const handleIce = ({ socketId, candidate }) => peersRef.current[socketId]?.signal(candidate);
  const handleUserLeft = ({ socketId }) => { peersRef.current[socketId]?.destroy(); delete peersRef.current[socketId]; audioElementsRef.current[socketId]?.remove(); delete audioElementsRef.current[socketId]; delete socketUserMapRef.current[socketId]; setPeersWithVideo(prev => { const n={...prev}; delete n[socketId]; return n; }); };
  const createPeer = (targetSocketId, initiator, streams = [], userId = null) => { const p = new Peer({ initiator, trickle: false, streams, config: rtcConfig }); p.on('signal', data => socketRef.current?.emit(initiator ? 'webrtc-offer' : 'webrtc-answer', { targetSocketId, sdp: data, userId: user?.id })); p.on('stream', stream => handleRemoteStream(stream, targetSocketId, userId)); peersRef.current[targetSocketId] = p; return p; };
  const handleRemoteStream = (stream, socketId, userId) => { if (userId) socketUserMapRef.current[socketId] = userId; if (stream.getVideoTracks().length > 0) { setPeersWithVideo(prev => ({ ...prev, [socketId]: stream })); } else { if (audioElementsRef.current[socketId]) audioElementsRef.current[socketId].remove(); const audio = document.createElement('audio'); audio.srcObject = stream; audio.autoplay = true; audio.style.display = 'none'; document.body.appendChild(audio); if (outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(()=>{}); audioElementsRef.current[socketId] = audio; applyVolumeSettings(); } };
  const startScreenShare = async (electronSourceId = null) => { try { let stream; if (window.electronAPI && electronSourceId) { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: electronSourceId } } }); } else { stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); } setMyScreenStream(stream); Object.values(peersRef.current).forEach(p => p.addStream(stream)); stream.getVideoTracks()[0].onended = () => stopScreenShare(); } catch (err) {} };
  const stopScreenShare = () => { if (myScreenStream) { myScreenStream.getTracks().forEach(t => t.stop()); Object.values(peersRef.current).forEach(p => { try { p.removeStream(myScreenStream); } catch(e){} }); setMyScreenStream(null); } };
  useEffect(() => { if (!audioElementsRef.current) return; Object.values(audioElementsRef.current).forEach((audio) => { if (!audio) return; audio.muted = isDeafened; if(outputDeviceId && typeof audio.setSinkId === 'function') audio.setSinkId(outputDeviceId).catch(e=>{}); }); }, [isDeafened, outputDeviceId, userVolumes]);
  useEffect(() => { const applyMute = (stream) => { if(stream) stream.getAudioTracks().forEach(track => { track.enabled = !isMicMuted; }); }; applyMute(localStreamRef.current); applyMute(processedStreamRef.current); }, [isMicMuted]);

  return (
    <VoiceContext.Provider value={{ socket: socketRef.current, isConnected, currentVoiceChannelId, currentServerId, currentVoiceChannelName, currentServerName, joinVoiceChannel, leaveVoiceChannel, speakingUsers, micError, stayConnected, peersWithVideo, myScreenStream, startScreenShare, stopScreenShare }}>
      {children}
    </VoiceContext.Provider>
  );
};