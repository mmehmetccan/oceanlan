// src/hooks/useVoiceChannel.js
import { useEffect, useRef, useContext, useState, useCallback } from 'react';
import Peer from 'simple-peer';
// ❌ import { useSocket } from './useSocket'; // BUNU SİLİYORUZ
import { VoiceContext } from '../context/VoiceContext';
import { AuthContext } from '../context/AuthContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';
import { ToastContext } from '../context/ToastContext';

// 🛠️ POLYFILL (Global)
if (typeof process === 'undefined') {
  window.process = { nextTick: (cb, ...args) => setTimeout(() => cb(...args), 0), env: {}, browser: true };
} else if (!process.nextTick) {
  process.nextTick = (cb, ...args) => setTimeout(() => cb(...args), 0);
}

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const useVoiceChannel = () => {
  // 🟢 DEĞİŞİKLİK BURADA: Soketi VoiceContext'ten çekiyoruz
  // const { socket } = useSocket(); // ESKİ
  const {
    socket, // YENİ: VoiceContext içindeki sağlam soketi kullan
    currentVoiceChannelId,
    currentServerId,
    leaveVoiceChannel,
    setMyScreenStream,
    addIncomingStream,
    removeIncomingStream,
    setScreenPickerOpen,
    setScreenShareCallback,
    setSpeakingUsers,
    stayConnected,
  } = useContext(VoiceContext);

  const { user } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);

  const {
    inputMode,
    pttKeyCode,
    isMicMuted,
    isDeafened,
    userVolumes,
    outputDeviceId,
    inputDeviceId,
  } = useContext(AudioSettingsContext);

  // --- REFS ---
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const audioElementsRef = useRef({});
  const speakingMapRef = useRef({});
  const audioAnalyzersRef = useRef({});
  const localAudioContextRef = useRef(null);
  const [isPTTPressed, setIsPTTPressed] = useState(false);

  // --- 1. SES ANALİZİ VE KONUŞMA DURUMU ---
  const updateSpeakingState = useCallback((id, isSpeaking) => {
      if (!id) return;
      if (speakingMapRef.current[id] === isSpeaking) return;
      speakingMapRef.current[id] = isSpeaking;
      setSpeakingUsers({ ...speakingMapRef.current });
  }, [setSpeakingUsers]);

  // --- 2. MİKROFON SUSTURMA/AÇMA ---
  const updateMicrophoneState = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;

    let shouldEnable = true;
    if (isMicMuted) shouldEnable = false;
    else if (inputMode === 'PUSH_TO_TALK' && !isPTTPressed) shouldEnable = false;

    if (audioTrack.enabled !== shouldEnable) {
        audioTrack.enabled = shouldEnable;
    }
  }, [isMicMuted, inputMode, isPTTPressed]);

  useEffect(() => { updateMicrophoneState(); }, [updateMicrophoneState]);

  // --- 3. PUSH TO TALK ---
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
      window.removeEventListener('keyup', handleUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [inputMode, pttKeyCode]);

  // --- 4. SES ÇIKIŞ AYARLARI ---
  useEffect(() => {
    Object.keys(audioElementsRef.current).forEach((socketId) => {
      const audioEl = audioElementsRef.current[socketId];
      if (!audioEl) return;
      if (typeof audioEl.setSinkId === 'function' && outputDeviceId) {
        audioEl.setSinkId(outputDeviceId).catch(err => console.warn("SinkId Error:", err));
      }
      audioEl.muted = isDeafened;
      const uid = audioEl._userId;
      if (!isDeafened && uid && userVolumes[uid] !== undefined) {
        let vol = userVolumes[uid] / 100;
        audioEl.volume = Math.max(0, Math.min(1, vol));
      } else if (!isDeafened) {
        audioEl.volume = 1.0;
      }
    });
  }, [outputDeviceId, isDeafened, userVolumes]);

  // --- 5. YARDIMCI: UZAK SES VE ANALİZ ---
  const handleRemoteStream = (stream, socketId, userId) => {
    if (stream.getVideoTracks().length > 0) {
        addIncomingStream(socketId, stream);
        return;
    }
    if (audioElementsRef.current[socketId] && audioElementsRef.current[socketId].srcObject?.id === stream.id) return;

    if (audioElementsRef.current[socketId]) audioElementsRef.current[socketId].remove();

    const audioEl = document.createElement('audio');
    audioEl.srcObject = stream;
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.controls = false;
    audioEl._userId = userId;
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);

    const playPromise = audioEl.play();
    if (playPromise !== undefined) playPromise.catch(() => {});

    audioElementsRef.current[socketId] = audioEl;

    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            if (audioAnalyzersRef.current[socketId]?.ctx?.state === 'running') return;
            const audioCtx = new AudioContext();
            if (audioCtx.state === 'suspended') audioCtx.resume();

            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            audioAnalyzersRef.current[socketId] = { ctx: audioCtx, analyser };

            const checkLevel = () => {
                if (!audioAnalyzersRef.current[socketId]) return;
                analyser.getByteFrequencyData(dataArray);
                let sum = 0; for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const avg = sum / dataArray.length;
                updateSpeakingState(userId || socketId, avg > 10);
                requestAnimationFrame(checkLevel);
            };
            checkLevel();
        }
    } catch(e) {}
  };

  // --- 6. PEER YÖNETİMİ ---
  const createPeer = (id, userId, initiator, stream) => {
      if (peersRef.current[id] && !peersRef.current[id].destroyed) return peersRef.current[id];

      const p = new Peer({
          initiator,
          trickle: false,
          stream: stream || undefined,
          config: rtcConfig
      });

      p.on('signal', data => {
          if (socket && socket.connected) {
              const type = initiator ? 'webrtc-offer' : 'webrtc-answer';
              socket.emit(type, { targetSocketId: id, sdp: data });
          }
      });

      p.on('stream', remoteStream => handleRemoteStream(remoteStream, id, userId));
      p.on('error', err => console.error(`Peer error (${id}):`, err));
      peersRef.current[id] = p;
      return p;
  };

  // --- 7. ANA BAĞLANTI MANTIĞI ---
  useEffect(() => {
    // Socket yoksa veya bağlı değilse veya kanal seçilmediyse dur
    if (!stayConnected || !currentVoiceChannelId || !currentServerId || !user || !socket || !socket.connected) return;

    let isMounted = true;
    let localStream = null;

    const startConnection = async () => {
        // --- EVENT LISTENERLAR ---
        // Bu listener'ları socket.off ile temizlemek çok önemli
        const handleUserJoined = ({ socketId, userId }) => {
            if (!isMounted) return;
            createPeer(socketId, userId, true, localStreamRef.current);
        };

        const handleOffer = ({ socketId, sdp }) => {
            if (!isMounted) return;
            const p = createPeer(socketId, null, false, localStreamRef.current);
            p.signal(sdp);
        };

        const handleAnswer = ({ socketId, sdp }) => {
            if (peersRef.current[socketId]) peersRef.current[socketId].signal(sdp);
        };

        const handleIce = ({ socketId, candidate }) => {
            if (peersRef.current[socketId]) peersRef.current[socketId].signal(candidate);
        };

        const handleUserLeft = ({ socketId }) => {
            if (peersRef.current[socketId]) {
                peersRef.current[socketId].destroy();
                delete peersRef.current[socketId];
            }
            if (audioElementsRef.current[socketId]) {
                audioElementsRef.current[socketId].remove();
                delete audioElementsRef.current[socketId];
            }
            if (audioAnalyzersRef.current[socketId]) {
                try { audioAnalyzersRef.current[socketId].ctx.close(); } catch(e){}
                delete audioAnalyzersRef.current[socketId];
            }
            removeIncomingStream(socketId);
        };

        const handleDisconnect = () => {
             addToast('Ses bağlantısı koptu.', 'error');
             // Bağlantı koparsa manuel çıkış yapmıyoruz, VoiceContext otomatik rejoin deneyecek
        };

        socket.on('user-joined-voice', handleUserJoined);
        socket.on('webrtc-offer', handleOffer);
        socket.on('webrtc-answer', handleAnswer);
        socket.on('webrtc-ice-candidate', handleIce);
        socket.on('user-left-voice', handleUserLeft);
        socket.on('voice-channel-disconnected', handleDisconnect);


        // --- MİKROFONU AL ---
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            if (!isMounted) {
                localStream.getTracks().forEach(t => t.stop());
                return;
            }

            localStreamRef.current = localStream;
            updateMicrophoneState();

            // Kendi Ses Analizi
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) {
                    const audioCtx = new AudioContext();
                    const source = audioCtx.createMediaStreamSource(localStream);
                    const analyser = audioCtx.createAnalyser();
                    analyser.fftSize = 512;
                    source.connect(analyser);
                    const dataArray = new Uint8Array(analyser.frequencyBinCount);
                    localAudioContextRef.current = audioCtx;
                    const checkMyLevel = () => {
                        if (!isMounted || !localAudioContextRef.current) return;
                        analyser.getByteFrequencyData(dataArray);
                        let sum = 0; for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                        updateSpeakingState(user.id, (sum / dataArray.length) > 10);
                        requestAnimationFrame(checkMyLevel);
                    };
                    checkMyLevel();
                }
            } catch (e) {}

            // Katılma isteği gönder (Eğer zaten bağlıysak VoiceContext bunu yönetir ama eventleri dinlemek için burası önemli)
            console.log(`[VoiceHook] Eventler hazır, bağlantı aktif.`);
            // NOT: join-voice-channel emit işlemini VoiceContext yapıyor.
            // Biz burada sadece medya hazırlayıp eventleri dinliyoruz.

        } catch (err) {
            console.error("Mikrofon hatası:", err);
            addToast("Mikrofon hatası: " + err.name, 'error');
            leaveVoiceChannel();
        }
    };

    startConnection();

    return () => {
        isMounted = false;
        // Eventleri temizle
        socket.off('user-joined-voice');
        socket.off('webrtc-offer');
        socket.off('webrtc-answer');
        socket.off('webrtc-ice-candidate');
        socket.off('user-left-voice');
        socket.off('voice-channel-disconnected');

        // Local Stream Kapat
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        // Peerları Temizle
        Object.values(peersRef.current).forEach(p => p.destroy());
        peersRef.current = {};
        // Audio Elementleri Temizle
        Object.values(audioElementsRef.current).forEach(el => el.remove());
        audioElementsRef.current = {};
        // Contextleri Temizle
        if (localAudioContextRef.current) {
            localAudioContextRef.current.close().catch(()=>{});
            localAudioContextRef.current = null;
        }
        Object.values(audioAnalyzersRef.current).forEach(a => {
            if(a.ctx) a.ctx.close().catch(()=>{});
        });
        audioAnalyzersRef.current = {};
        setSpeakingUsers({});
    };

}, [stayConnected, currentVoiceChannelId, currentServerId, socket, user, inputDeviceId]);
// Dependency array'e 'socket' ve 'socket.connected' eklemek yerine sadece 'socket' yeterli,
// içeride kontrol ediyoruz.

  // --- EKRAN PAYLAŞIMI ---
  const startScreenShare = async (electronSourceId = null) => {
    if (window.electronAPI && !electronSourceId) {
        setScreenShareCallback(() => (sourceId) => startScreenShare(sourceId));
        setScreenPickerOpen(true);
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

        Object.values(peersRef.current).forEach(p => {
             p.addStream(stream);
        });

        stream.getVideoTracks()[0].onended = stopScreenShare;
        addToast('Ekran paylaşımı başlatıldı.', 'success');
    } catch(e) {
        addToast("Ekran paylaşımı hatası", 'error');
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
        Object.values(peersRef.current).forEach(p => {
            try { p.removeStream(screenStreamRef.current); } catch(e){}
        });
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
        setMyScreenStream(null);
    }
  };

  return { startScreenShare, stopScreenShare };
};