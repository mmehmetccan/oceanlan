// src/hooks/useVoiceChannel.js
import { useEffect, useRef, useContext, useState, useCallback } from 'react';
import Peer from 'simple-peer';
import { useSocket } from './useSocket';
import { VoiceContext } from '../context/VoiceContext';
import { AuthContext } from '../context/AuthContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';
import { ToastContext } from '../context/ToastContext';

// 🛠️ POLYFILL
if (typeof process === 'undefined') {
  window.process = {
    nextTick: (cb, ...args) => setTimeout(() => cb(...args), 0),
    env: {},
    browser: true
  };
} else if (!process.nextTick) {
  process.nextTick = (cb, ...args) => setTimeout(() => cb(...args), 0);
}

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Yedek sunucular
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export const useVoiceChannel = () => {
  const { socket } = useSocket();
  const { user } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);

  const {
    currentVoiceChannelId,
    currentServerId,
    leaveVoiceChannel,
    setMyScreenStream,
    addIncomingStream,
    removeIncomingStream,
    setScreenPickerOpen,
    setScreenShareCallback,
    speakingUsers,
    setSpeakingUsers,
  } = useContext(VoiceContext);

  const {
    inputMode,
    pttKeyCode,
    isMicMuted,
    isDeafened,
    userVolumes,
    outputDeviceId,
    inputDeviceId,
  } = useContext(AudioSettingsContext);

  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const audioElementsRef = useRef({});
  const connectionTimeoutRef = useRef(null);

  const speakingMapRef = useRef({});
  const audioAnalyzersRef = useRef({});
  const localAudioContextRef = useRef(null);

  const [isPTTPressed, setIsPTTPressed] = useState(false);

  const updateSpeakingState = useCallback((id, isSpeaking) => {
      if (!id) return;
      if (speakingMapRef.current[id] === isSpeaking) return;
      speakingMapRef.current[id] = isSpeaking;
      setSpeakingUsers({ ...speakingMapRef.current });
  }, [setSpeakingUsers]);

  const updateMicrophoneState = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;

    if (isMicMuted) audioTrack.enabled = false;
    else if (inputMode === 'VOICE_ACTIVITY') audioTrack.enabled = true;
    else if (inputMode === 'PUSH_TO_TALK') audioTrack.enabled = !!isPTTPressed;
  }, [isMicMuted, inputMode, isPTTPressed]);

  useEffect(() => { updateMicrophoneState(); }, [updateMicrophoneState]);

  useEffect(() => {
    if (inputMode !== 'PUSH_TO_TALK') {
      if (isPTTPressed) setIsPTTPressed(false);
      return;
    }
    const handleDown = (e) => { if (!e.repeat && e.code === pttKeyCode) setIsPTTPressed(true); };
    const handleUp = (e) => { if (e.code === pttKeyCode) setIsPTTPressed(false); };
    const handleBlur = () => setIsPTTPressed(false);
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [inputMode, pttKeyCode]);

  useEffect(() => {
    Object.keys(audioElementsRef.current).forEach((socketId) => {
      const audioEl = audioElementsRef.current[socketId];
      if (typeof audioEl.setSinkId === 'function' && outputDeviceId) {
        audioEl.setSinkId(outputDeviceId).catch(() => {});
      }
      audioEl.muted = isDeafened;
      const uid = audioEl._userId;
      if (!isDeafened && uid && userVolumes[uid] !== undefined) {
        let vol = userVolumes[uid] / 100;
        audioEl.volume = Math.max(0, Math.min(1, vol));
      }
    });
  }, [outputDeviceId, isDeafened, userVolumes]);

  const startScreenShare = async (electronSourceId = null) => {
    if (window.electronAPI && !electronSourceId) {
        setScreenShareCallback(() => (sourceId) => startScreenShare(sourceId));
        setScreenPickerOpen(true);
        return;
    }
    if (!window.electronAPI && location.protocol !== 'https:' && location.hostname !== 'localhost') {
        addToast('Ekran paylaşımı için HTTPS gereklidir.', 'error');
        return;
    }
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
      screenStreamRef.current = stream;
      setMyScreenStream(stream);
      Object.values(peersRef.current).forEach(p => { try { p.addStream(stream); } catch(e){} });
      stream.getVideoTracks()[0].onended = stopScreenShare;
      addToast('Ekran paylaşımı başlatıldı.', 'success');
    } catch (error) {
      if (error.name !== 'NotAllowedError') addToast(`Hata: ${error.message}`, 'error');
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      Object.values(peersRef.current).forEach(p => { try { p.removeStream(screenStreamRef.current); } catch(e){} });
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setMyScreenStream(null);
      addToast('Ekran paylaşımı durduruldu.', 'info');
    }
  };

  const handleRemoteStream = (remoteStream, socketId, userId) => {
    if (remoteStream.getVideoTracks().length > 0) {
        addIncomingStream(socketId, remoteStream);
    } else if (remoteStream.getAudioTracks().length > 0) {
        if (audioElementsRef.current[socketId]) {
            audioElementsRef.current[socketId].srcObject = null;
            audioElementsRef.current[socketId].remove();
        }
        const audioEl = document.createElement('audio');
        audioEl.srcObject = remoteStream;
        audioEl.autoplay = true;
        audioEl.playsInline = true;
        audioEl.controls = false;
        audioEl._userId = userId;
        audioEl.muted = isDeafened;
        if (typeof audioEl.setSinkId === 'function' && outputDeviceId) {
            audioEl.setSinkId(outputDeviceId).catch(() => {});
        }
        document.body.appendChild(audioEl);
        audioEl.play().catch(() => {});
        audioElementsRef.current[socketId] = audioEl;

        // Remote Analiz
        const id = userId || socketId;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const audioCtx = new AudioContext();
                const source = audioCtx.createMediaStreamSource(remoteStream);
                const analyser = audioCtx.createAnalyser();
                analyser.fftSize = 512;
                source.connect(analyser);
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                audioAnalyzersRef.current[id] = { audioCtx, analyser };
                const checkLevel = () => {
                    if (!audioAnalyzersRef.current[id]) return;
                    analyser.getByteFrequencyData(dataArray);
                    let sum = 0; for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                    updateSpeakingState(id, (sum / dataArray.length / 255) > 0.05);
                    requestAnimationFrame(checkLevel);
                };
                checkLevel();
            }
        } catch (e) {}
    }
  };

  // --- ANA BAĞLANTI ---
  useEffect(() => {
    if (!currentVoiceChannelId || !currentServerId || !user) return;
    if (!socket || !socket.connected) return;

    let isMounted = true;
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);

    // Bağlantı uzun sürerse uyar
    connectionTimeoutRef.current = setTimeout(() => {
        if (isMounted && !localStreamRef.current) {
            addToast('Bağlantı bekleniyor (İzinleri kontrol edin)...', 'warning');
        }
    }, 15000);

    const initVoiceConnection = async () => {
        try {
            // 1. Mikrofonu Al (YEDEK PLANLI)
            let stream;
            try {
                // Önce seçili cihazı dene
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
                        echoCancellation: true, noiseSuppression: true, autoGainControl: true
                    },
                    video: false
                });
            } catch (err1) {
                console.warn("Seçili mikrofonla bağlanılamadı, varsayılan deneniyor...", err1);
                // Hata verirse varsayılan ayarlarla dene
                stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            }

            if (!isMounted) { stream.getTracks().forEach(t => t.stop()); return; }

            localStreamRef.current = stream;
            updateMicrophoneState();

            // 2. Local Ses Analizi
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) {
                    const audioCtx = new AudioContext();
                    const source = audioCtx.createMediaStreamSource(stream);
                    const analyser = audioCtx.createAnalyser();
                    analyser.fftSize = 512;
                    source.connect(analyser);
                    const dataArray = new Uint8Array(analyser.frequencyBinCount);
                    localAudioContextRef.current = audioCtx;
                    const checkLevel = () => {
                        if (!localAudioContextRef.current) return;
                        analyser.getByteFrequencyData(dataArray);
                        let sum = 0; for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                        updateSpeakingState(user.id, (sum / dataArray.length / 255) > 0.05);
                        requestAnimationFrame(checkLevel);
                    };
                    checkLevel();
                }
            } catch (e) {}

            // 3. Socket Olayları
            const onUserJoinedVoice = ({ socketId, userId }) => {
                const p = new Peer({ initiator: true, stream, config: rtcConfig });
                if(screenStreamRef.current) p.addStream(screenStreamRef.current);
                p.on('signal', d => socket.emit('webrtc-offer', { targetSocketId: socketId, sdp: d }));
                p.on('stream', s => handleRemoteStream(s, socketId, userId));
                peersRef.current[socketId] = p;
            };
            const onOffer = ({ socketId, sdp }) => {
                const p = new Peer({ initiator: false, stream, config: rtcConfig });
                if(screenStreamRef.current) p.addStream(screenStreamRef.current);
                p.signal(sdp);
                p.on('signal', d => socket.emit('webrtc-answer', { targetSocketId: socketId, sdp: d }));
                p.on('stream', s => handleRemoteStream(s, socketId, null));
                peersRef.current[socketId] = p;
            };
            const onAnswer = ({ socketId, sdp }) => peersRef.current[socketId]?.signal(sdp);
            const onIce = ({ socketId, candidate }) => peersRef.current[socketId]?.signal(candidate);
            const onLeft = ({ socketId }) => {
                if(peersRef.current[socketId]) { peersRef.current[socketId].destroy(); delete peersRef.current[socketId]; }
                if(audioElementsRef.current[socketId]) { audioElementsRef.current[socketId].remove(); delete audioElementsRef.current[socketId]; }
                // Analyser temizliği
                Object.keys(audioAnalyzersRef.current).forEach(id => { /* Socket ID mapping zor olduğu için burada bırakıyoruz */ });
                removeIncomingStream(socketId);
            };

            socket.on('user-joined-voice', onUserJoinedVoice);
            socket.on('webrtc-offer', onOffer);
            socket.on('webrtc-answer', onAnswer);
            socket.on('webrtc-ice-candidate', onIce);
            socket.on('user-left-voice', onLeft);

            socket.emit('join-voice-channel', { channelId: currentVoiceChannelId, serverId: currentServerId, userId: user.id, username: user.username });
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);

        } catch (err) {
            console.error('Ses hatası:', err);
            let msg = `Bağlantı Hatası: ${err.name}`; // Hata adını gösterelim

            if (err.name === 'NotAllowedError') msg = 'Mikrofon izni reddedildi!';
            else if (err.name === 'NotFoundError') msg = 'Mikrofon bulunamadı!';
            else if (err.name === 'NotReadableError') msg = 'Mikrofon başka programda!';
            else if (err.name === 'SecurityError') msg = 'Güvenlik hatası (HTTPS gerekli!)';

            addToast(msg, 'error');
            leaveVoiceChannel();
        }
    };

    initVoiceConnection();

    return () => {
        isMounted = false;
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        if (socket) {
            socket.emit('leave-voice-channel');
            socket.off('user-joined-voice'); socket.off('webrtc-offer'); socket.off('webrtc-answer'); socket.off('webrtc-ice-candidate'); socket.off('user-left-voice');
        }
        if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
        if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t => t.stop()); screenStreamRef.current = null; setMyScreenStream(null); }
        if (localAudioContextRef.current) { localAudioContextRef.current.close(); localAudioContextRef.current = null; }

        Object.values(peersRef.current).forEach(p => p.destroy()); peersRef.current = {};
        Object.values(audioElementsRef.current).forEach(e => e.remove()); audioElementsRef.current = {};
        setSpeakingUsers({});
    };
  }, [currentVoiceChannelId, currentServerId, socket, socket?.connected, user, inputDeviceId]);

  return { startScreenShare, stopScreenShare };
};