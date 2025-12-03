// src/hooks/useVoiceChannel.js
import { useEffect, useRef, useContext, useState, useCallback } from 'react';
import Peer from 'simple-peer';
import { useSocket } from './useSocket';
import { VoiceContext } from '../context/VoiceContext';
import { AuthContext } from '../context/AuthContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';
import { ToastContext } from '../context/ToastContext';

// 🛠️ POLYFILL: WebRTC ve simple-peer için gerekli
if (typeof process === 'undefined') {
  window.process = {
    nextTick: (cb, ...args) => setTimeout(() => cb(...args), 0),
    env: {},
    browser: true,
  };
} else if (!process.nextTick) {
  process.nextTick = (cb, ...args) => setTimeout(() => cb(...args), 0);
}

// 🌍 GENİŞLETİLMİŞ STUN SUNUCULARI (Bağlantı başarısını artırır)
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
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

  // Konuşan kullanıcı takibi için
  const speakingMapRef = useRef({});
  const audioAnalyzersRef = useRef({});
  const localAudioContextRef = useRef(null);

  const [isPTTPressed, setIsPTTPressed] = useState(false);

  // -------------------- 0. KONUŞAN KULLANICI STATE YARDIMCI FONKSİYONU --------------------
  const updateSpeakingState = useCallback(
    (id, isSpeaking) => {
      if (!id) return;

      if (speakingMapRef.current[id] === isSpeaking) return;

      speakingMapRef.current[id] = isSpeaking;
      // Yeni bir obje oluşturarak React state tetikleyelim
      setSpeakingUsers({ ...speakingMapRef.current });
    },
    [setSpeakingUsers]
  );

  // -------------------- 1. MİKROFON DURUMU --------------------
  const updateMicrophoneState = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;

    if (isMicMuted) {
      audioTrack.enabled = false;
    } else if (inputMode === 'VOICE_ACTIVITY') {
      audioTrack.enabled = true;
    } else if (inputMode === 'PUSH_TO_TALK') {
      audioTrack.enabled = !!isPTTPressed;
    }
  }, [isMicMuted, inputMode, isPTTPressed]);

  useEffect(() => {
    updateMicrophoneState();
  }, [updateMicrophoneState]);

  // -------------------- 2. BAS-KONUŞ (PTT) --------------------
  useEffect(() => {
    if (inputMode !== 'PUSH_TO_TALK') {
      if (isPTTPressed) setIsPTTPressed(false);
      return;
    }

    const handleKeyDown = (e) => {
      if (!e.repeat && e.code === pttKeyCode) setIsPTTPressed(true);
    };
    const handleKeyUp = (e) => {
      if (e.code === pttKeyCode) setIsPTTPressed(false);
    };
    const handleBlur = () => setIsPTTPressed(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [inputMode, pttKeyCode, isPTTPressed]);

  // -------------------- 3. HOPARLÖR & SAĞIRLAŞTIRMA --------------------
  useEffect(() => {
    Object.keys(audioElementsRef.current).forEach((socketId) => {
      const audioEl = audioElementsRef.current[socketId];
      if (!audioEl) return;

      // Çıkış Cihazı
      if (typeof audioEl.setSinkId === 'function' && outputDeviceId) {
        audioEl.setSinkId(outputDeviceId).catch(() => {});
      }

      // Sağırlaştırma
      audioEl.muted = isDeafened;

      // Ses Seviyesi
      const uid = audioEl._userId;
      if (!isDeafened && uid && userVolumes[uid] !== undefined) {
        let vol = userVolumes[uid] / 100;
        audioEl.volume = Math.max(0, Math.min(1, vol));
      }
    });
  }, [outputDeviceId, isDeafened, userVolumes]);

  // -------------------- 4. EKRAN PAYLAŞIMI --------------------
  const startScreenShare = async (electronSourceId = null) => {
    // A. APP (Electron) Modal Kontrolü
    if (window.electronAPI && !electronSourceId) {
      setScreenShareCallback(() => (sourceId) => startScreenShare(sourceId));
      setScreenPickerOpen(true);
      return;
    }

    // B. WEB HTTPS Kontrolü
    if (!window.electronAPI && location.protocol !== 'https:' && location.hostname !== 'localhost') {
      addToast('Ekran paylaşımı için HTTPS gereklidir.', 'error');
      return;
    }

    try {
      let stream;
      if (window.electronAPI && electronSourceId) {
        // ELECTRON
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: electronSourceId,
              minWidth: 1280,
              maxWidth: 1920,
            },
          },
        });
      } else {
        // WEB
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: true,
        });
      }

      screenStreamRef.current = stream;
      setMyScreenStream(stream);

      // Mevcut bağlantılara akışı ekle
      Object.values(peersRef.current).forEach((peer) => {
        try {
          peer.addStream(stream);
        } catch (e) {
          console.warn(e);
        }
      });

      stream.getVideoTracks()[0].onended = () => stopScreenShare();
      addToast('Ekran paylaşımı başlatıldı.', 'success');
    } catch (error) {
      console.error('Ekran paylaşımı hatası:', error);
      if (error.name !== 'NotAllowedError') {
        addToast(`Hata: ${error.message}`, 'error');
      }
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      Object.values(peersRef.current).forEach((peer) => {
        try {
          peer.removeStream(screenStreamRef.current);
        } catch (err) {}
      });
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setMyScreenStream(null);
      addToast('Ekran paylaşımı durduruldu.', 'info');
    }
  };

  // -------------------- 5. REMOTE STREAM (GELEN SES/VİDEO + SPEAKING) --------------------
  const handleRemoteStream = (remoteStream, socketId, userId) => {
    // Video
    if (remoteStream.getVideoTracks().length > 0) {
      addIncomingStream(socketId, remoteStream);
    }
    // Ses
    else if (remoteStream.getAudioTracks().length > 0) {
      if (audioElementsRef.current[socketId]) {
        audioElementsRef.current[socketId].srcObject = null;
        audioElementsRef.current[socketId].remove();
      }

      const audioEl = document.createElement('audio');
      audioEl.srcObject = remoteStream;
      audioEl.autoplay = true;
      audioEl.playsInline = true; // Mobil için önemli
      audioEl.controls = false;
      audioEl._userId = userId;
      audioEl.muted = isDeafened;

      if (typeof audioEl.setSinkId === 'function' && outputDeviceId) {
        audioEl.setSinkId(outputDeviceId).catch(() => {});
      }

      document.body.appendChild(audioEl);

      // Otomatik oynatma hatasını yakala (Kullanıcı etkileşimi gerekebilir)
      audioEl.play().catch((e) =>
        console.warn('Ses oynatma hatası (Otomatik Oynatma İzni Gerekebilir):', e)
      );

      audioElementsRef.current[socketId] = audioEl;

      // --- REMOTE SPEAKING DETECTION ---
      const id = userId || socketId;
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(remoteStream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        audioAnalyzersRef.current[id] = { audioCtx, analyser };

        const checkLevel = () => {
          const entry = audioAnalyzersRef.current[id];
          if (!entry) return;

          entry.analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          const normalized = avg / 255; // 0–1 arası

          const isSpeaking = normalized > 0.05; // Eşiği istersen değiştir
          updateSpeakingState(id, isSpeaking);

          requestAnimationFrame(checkLevel);
        };
        checkLevel();
      } catch (e) {
        console.warn('Remote speaking analyser oluşturulamadı:', e);
      }
    }
  };

  // -------------------- 6. ANA BAĞLANTI MANTIĞI (SOCKET CONNECT BEKLEYEN) --------------------
  useEffect(() => {
    if (!currentVoiceChannelId || !currentServerId || !user) return;
    if (!socket) return;

    let isMounted = true;
    let started = false;

    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);

    const startVoiceConnection = async () => {
      if (started || !isMounted) return;
      started = true;

      // Zaman aşımı kontrolü (20 saniye)
      connectionTimeoutRef.current = setTimeout(() => {
        if (isMounted && !localStreamRef.current) {
          addToast('Ses kanalına bağlanmak uzun sürüyor, lütfen bekleyin...', 'warning');
        }
      }, 20000);

      try {
        // Mikrofonu al
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        updateMicrophoneState();

        // --- LOCAL SPEAKING DETECTION ---
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          localAudioContextRef.current = audioCtx;

          const checkLevel = () => {
            if (!localAudioContextRef.current) return;

            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            const normalized = avg / 255;
            const isSpeaking = normalized > 0.05; // Eşik

            updateSpeakingState(user.id, isSpeaking);
            requestAnimationFrame(checkLevel);
          };
          checkLevel();
        } catch (e) {
          console.warn('Local speaking analyser oluşturulamadı:', e);
        }

        // --- Socket Olayları ---
        const onUserJoinedVoice = ({ socketId, userId }) => {
          const peer = new Peer({ initiator: true, stream, config: rtcConfig });
          if (screenStreamRef.current) peer.addStream(screenStreamRef.current);

          peer.on('signal', (data) =>
            socket.emit('webrtc-offer', { targetSocketId: socketId, sdp: data })
          );
          peer.on('stream', (rs) => handleRemoteStream(rs, socketId, userId));
          peersRef.current[socketId] = peer;
        };

        const onWebrtcOffer = ({ socketId, sdp }) => {
          const peer = new Peer({ initiator: false, stream, config: rtcConfig });
          if (screenStreamRef.current) peer.addStream(screenStreamRef.current);

          peer.signal(sdp);
          peer.on('signal', (data) =>
            socket.emit('webrtc-answer', { targetSocketId: socketId, sdp: data })
          );
          peer.on('stream', (rs) => handleRemoteStream(rs, socketId, null));
          peersRef.current[socketId] = peer;
        };

        const onWebrtcAnswer = ({ socketId, sdp }) => {
          peersRef.current[socketId]?.signal(sdp);
        };

        const onWebrtcIceCandidate = ({ socketId, candidate }) => {
          peersRef.current[socketId]?.signal(candidate);
        };

        const onUserLeftVoice = ({ socketId }) => {
          if (peersRef.current[socketId]) {
            peersRef.current[socketId].destroy();
            delete peersRef.current[socketId];
          }
          if (audioElementsRef.current[socketId]) {
            audioElementsRef.current[socketId].srcObject = null;
            audioElementsRef.current[socketId].remove();
            delete audioElementsRef.current[socketId];
          }

          // Analyzer ve speaking state temizle
          const id = socketId; // veya userId
          if (audioAnalyzersRef.current[id]) {
            audioAnalyzersRef.current[id].audioCtx.close();
            delete audioAnalyzersRef.current[id];
          }
          updateSpeakingState(id, false);

          removeIncomingStream(socketId);
        };

        socket.on('user-joined-voice', onUserJoinedVoice);
        socket.on('webrtc-offer', onWebrtcOffer);
        socket.on('webrtc-answer', onWebrtcAnswer);
        socket.on('webrtc-ice-candidate', onWebrtcIceCandidate);
        socket.on('user-left-voice', onUserLeftVoice);

        // Odaya Katıl
        socket.emit('join-voice-channel', {
          channelId: currentVoiceChannelId,
          serverId: currentServerId,
          userId: user.id,
          username: user.username,
        });

        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      } catch (err) {
        console.error('Ses bağlantı hatası:', err);
        let msg = 'Ses kanalına bağlanılamadı.';
        if (err.name === 'NotAllowedError') msg = 'Mikrofon izni verilmedi.';
        else if (err.name === 'NotFoundError') msg = 'Mikrofon bulunamadı.';
        else if (err.name === 'NotReadableError')
          msg = 'Mikrofon başka uygulama tarafından kullanılıyor.';

        addToast(msg, 'error');
          setMicError(err.message);
        leaveVoiceChannel();
      }
    };

    // Bağlantıyı başlat (Eğer socket bağlıysa hemen, değilse 'connect' olunca)
    if (socket.connected) {
      startVoiceConnection();
    } else {
      socket.once('connect', startVoiceConnection);
    }

    // --- CLEANUP ---
    return () => {
      isMounted = false;
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);

      if (socket) {
        socket.off('connect', startVoiceConnection);
        socket.emit('leave-voice-channel');
        socket.off('user-joined-voice');
        socket.off('webrtc-offer');
        socket.off('webrtc-answer');
        socket.off('webrtc-ice-candidate');
        socket.off('user-left-voice');
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
        setMyScreenStream(null);
      }

      if (localAudioContextRef.current) {
        localAudioContextRef.current.close();
        localAudioContextRef.current = null;
      }

      Object.values(peersRef.current).forEach((p) => p.destroy());
      peersRef.current = {};

      Object.values(audioElementsRef.current).forEach((el) => {
        el.srcObject = null;
        el.remove();
      });
      audioElementsRef.current = {};

      Object.keys(audioAnalyzersRef.current).forEach((id) => {
        try { audioAnalyzersRef.current[id].audioCtx.close(); } catch(e){}
      });
      audioAnalyzersRef.current = {};

      // Konuşan kullanıcı map'ini sıfırla
      speakingMapRef.current = {};
      setSpeakingUsers({});
    };
  }, [currentVoiceChannelId, currentServerId, socket, user, inputDeviceId, updateMicrophoneState, addToast, leaveVoiceChannel, setMyScreenStream, updateSpeakingState]); // Bağımlılıklar güncellendi

  return { startScreenShare, stopScreenShare };
};