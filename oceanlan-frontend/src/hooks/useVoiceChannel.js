// src/hooks/useVoiceChannel.js
import { useEffect, useRef, useContext, useState, useCallback } from 'react';
import { useSocket } from './useSocket';
import { VoiceContext } from '../context/VoiceContext';
import { AuthContext } from '../context/AuthContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';
import { ToastContext } from '../context/ToastContext';

// --- STUN SUNUCULARI ---
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

  // --- REFS ---
  const peersRef = useRef({}); // Peer Listesi
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const audioElementsRef = useRef({});

  // Analiz ve Durum Refleri
  const speakingMapRef = useRef({});
  const audioAnalyzersRef = useRef({});
  const localAudioContextRef = useRef(null);
  const mountRef = useRef(true); // Component hala ekranda mı?

  const [isPTTPressed, setIsPTTPressed] = useState(false);

  // --- SPEAKING INDICATOR ---
  const updateSpeakingState = useCallback((id, isSpeaking) => {
      if (!id) return;
      if (speakingMapRef.current[id] === isSpeaking) return;
      speakingMapRef.current[id] = isSpeaking;
      setSpeakingUsers({ ...speakingMapRef.current });
  }, [setSpeakingUsers]);

  // --- MİKROFON DURUMU ---
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

  // --- PUSH TO TALK ---
  useEffect(() => {
    if (inputMode !== 'PUSH_TO_TALK') {
      if (isPTTPressed) setIsPTTPressed(false);
      return;
    }
    const handleDown = (e) => { if (!e.repeat && e.code === pttKeyCode) setIsPTTPressed(true); };
    const handleUp = (e) => { if (e.code === pttKeyCode) setIsPTTPressed(false); };
    const handleBlur = () => setIsPTTPressed(false); // Pencere odağını kaybederse

    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [inputMode, pttKeyCode]);

  // --- SES ÇIKIŞI ---
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
      } else {
        audioEl.volume = 1.0;
      }
    });
  }, [outputDeviceId, isDeafened, userVolumes]);

  // --- HELPER: AUDIO ELEMENT OLUŞTURMA (ELECTRON FIX DAHİL) ---
  const handleRemoteTrack = (event, socketId, userId) => {
    const stream = event.streams[0];
    if (!stream) return;

    if (stream.getVideoTracks().length > 0) {
        addIncomingStream(socketId, stream);
        return;
    }

    // Zaten varsa ve stream aynıysa işlem yapma
    if (audioElementsRef.current[socketId] && audioElementsRef.current[socketId].srcObject === stream) {
        return;
    }

    // Varsa sil, yenisini oluştur (Temiz başlangıç)
    if (audioElementsRef.current[socketId]) {
        audioElementsRef.current[socketId].remove();
    }

    const audioEl = document.createElement('audio');
    audioEl.srcObject = stream;
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.controls = false;
    audioEl.muted = false; // Muted OLMADIĞINDAN emin ol
    audioEl._userId = userId;
    audioEl.style.display = 'none';

    if (typeof audioEl.setSinkId === 'function' && outputDeviceId) {
        audioEl.setSinkId(outputDeviceId).catch(e => console.warn("Sink ID error:", e));
    }

    document.body.appendChild(audioEl);

    // --- ELECTRON İÇİN KRİTİK KISIM ---
    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
        playPromise
            .then(() => console.log(`[Audio] ${userId} çalınıyor.`))
            .catch(error => console.warn(`[Audio] Autoplay engellendi:`, error));
    }

    audioElementsRef.current[socketId] = audioEl;

    // Analiz Başlat
    setupAudioAnalysis(stream, userId || socketId);
  };

  const setupAudioAnalysis = (stream, id) => {
      try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return;

          if(audioAnalyzersRef.current[id]) return; // Zaten varsa kurma

          const audioCtx = new AudioContext();
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          audioAnalyzersRef.current[id] = { audioCtx, analyser };

          const checkLevel = () => {
              if (!audioAnalyzersRef.current[id] || !mountRef.current) return;
              analyser.getByteFrequencyData(dataArray);
              let sum = 0; for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              updateSpeakingState(id, (sum / dataArray.length / 255) > 0.05);
              requestAnimationFrame(checkLevel);
          };
          checkLevel();
      } catch(e) {}
  };

  // --- HELPER: PEER OLUŞTURMA ---
  const createPeerConnection = (targetSocketId, userId) => {
      if (peersRef.current[targetSocketId]) return peersRef.current[targetSocketId];

      const pc = new RTCPeerConnection(rtcConfig);

      peersRef.current[targetSocketId] = {
          connection: pc,
          queue: [],
          userId: userId
      };

      if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
      }
      if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => pc.addTrack(track, screenStreamRef.current));
      }

      pc.onicecandidate = (event) => {
          if (event.candidate && socket?.connected) {
              socket.emit('webrtc-ice-candidate', { targetSocketId, candidate: event.candidate });
          }
      };

      pc.ontrack = (event) => handleRemoteTrack(event, targetSocketId, userId);

      // Bağlantı koparsa cleanup yapılabilir (Opsiyonel)
      pc.onconnectionstatechange = () => {
          // console.log(`Peer ${userId} state: ${pc.connectionState}`);
      };

      return peersRef.current[targetSocketId];
  };

  const processQueue = async (socketId) => {
      const peer = peersRef.current[socketId];
      if (!peer) return;
      while (peer.queue.length > 0) {
          const candidate = peer.queue.shift();
          try { await peer.connection.addIceCandidate(new RTCIceCandidate(candidate)); }
          catch (e) { console.warn("Queue ICE Error", e); }
      }
  };

  // --- TEMİZLİK FONKSİYONU (ZOMBİ SOKETLER İÇİN) ---
  const cleanupConnection = (fullCleanup = false) => {
      // 1. Peerları Kapat
      Object.values(peersRef.current).forEach(p => {
          if(p.connection) p.connection.close();
      });
      peersRef.current = {};

      // 2. Elementleri Sil
      Object.values(audioElementsRef.current).forEach(el => el.remove());
      audioElementsRef.current = {};

      // 3. Analizcileri Durdur
      Object.values(audioAnalyzersRef.current).forEach(a => {
          try { a.audioCtx.close(); } catch(e){}
      });
      audioAnalyzersRef.current = {};

      if (fullCleanup) {
          if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach(t => t.stop());
              localStreamRef.current = null;
          }
          setSpeakingUsers({});
      }
  };

  // ============================================================
  // ANA BAĞLANTI (SELF-HEALING / BEKÇİ KÖPEĞİ MANTIĞI)
  // ============================================================
  useEffect(() => {
    mountRef.current = true;

    if (!currentVoiceChannelId || !currentServerId) {
        cleanupConnection(true);
        return;
    }

    // Socket bağlı değilse bekle (Bağlandığı an useEffect tekrar çalışacak)
    if (!socket || !socket.connected) {
        console.log("[Voice] Socket bağlantısı bekleniyor...");
        return;
    }

    const initConnection = async () => {
        console.log(`[Voice] Kanala bağlanılıyor: ${currentVoiceChannelId}`);

        // ÖNCEKİ BAĞLANTILARI TEMİZLE (Kopma sorununu çözen yer)
        cleanupConnection(false);

        // 1. Mikrofonu Al
        try {
            if (!localStreamRef.current) {
                let stream;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
                            echoCancellation: true, noiseSuppression: true, autoGainControl: true
                        },
                        video: false
                    });
                } catch (micErr) {
                    console.warn("Mikrofon hatası, varsayılan deneniyor:", micErr);
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                }
                localStreamRef.current = stream;
                // Kendi sesimizin analizi
                setupAudioAnalysis(stream, user.id);
            }
        } catch (err) {
            console.error("Mikrofon alınamadı:", err);
            addToast("Mikrofon bulunamadı, dinleyici modundasınız.", "warning");
        }

        // 2. Socket Dinleyicileri (Tekrar tanımlamayı önlemek için önce off yapıyoruz)
        socket.off('user-joined-voice');
        socket.off('webrtc-offer');
        socket.off('webrtc-answer');
        socket.off('webrtc-ice-candidate');
        socket.off('user-left-voice');
        socket.off('voice-channel-disconnected');

        socket.on('user-joined-voice', async ({ socketId, userId }) => {
            const { connection } = createPeerConnection(socketId, userId);
            try {
                const offer = await connection.createOffer();
                await connection.setLocalDescription(offer);
                socket.emit('webrtc-offer', { targetSocketId: socketId, sdp: offer });
            } catch (e) { console.error(e); }
        });

        socket.on('webrtc-offer', async ({ socketId, sdp }) => {
            const { connection } = createPeerConnection(socketId, null);
            try {
                await connection.setRemoteDescription(new RTCSessionDescription(sdp));
                const answer = await connection.createAnswer();
                await connection.setLocalDescription(answer);
                socket.emit('webrtc-answer', { targetSocketId: socketId, sdp: answer });
                await processQueue(socketId);
            } catch (e) { console.error(e); }
        });

        socket.on('webrtc-answer', async ({ socketId, sdp }) => {
            const peer = peersRef.current[socketId];
            if (peer) {
                try {
                    await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp));
                    await processQueue(socketId);
                } catch (e) { console.error(e); }
            }
        });

        socket.on('webrtc-ice-candidate', async ({ socketId, candidate }) => {
            const peer = peersRef.current[socketId];
            if (peer) {
                if (peer.connection.remoteDescription) {
                    try { await peer.connection.addIceCandidate(new RTCIceCandidate(candidate)); } catch(e){}
                } else {
                    peer.queue.push(candidate);
                }
            }
        });

        socket.on('user-left-voice', ({ socketId }) => {
            if (peersRef.current[socketId]) {
                peersRef.current[socketId].connection.close();
                delete peersRef.current[socketId];
            }
            if (audioElementsRef.current[socketId]) {
                audioElementsRef.current[socketId].remove();
                delete audioElementsRef.current[socketId];
            }
            removeIncomingStream(socketId);
        });

        socket.on('voice-channel-disconnected', () => {
            addToast('Bağlantı kesildi.', 'error');
            leaveVoiceChannel();
        });

        // 3. Sunucuya Katıl
        socket.emit('join-voice-channel', {
            channelId: currentVoiceChannelId,
            serverId: currentServerId,
            userId: user.id,
            username: user.username
        });
    };

    initConnection();

    return () => {
        mountRef.current = false;
        if(socket) {
             socket.emit('leave-voice-channel');
             socket.off('user-joined-voice');
             socket.off('webrtc-offer');
             socket.off('webrtc-answer');
             socket.off('webrtc-ice-candidate');
             socket.off('user-left-voice');
             socket.off('voice-channel-disconnected');
        }
        cleanupConnection(true);
    };

  // BURASI KRİTİK: 'socket.connected' bağımlılığı eklendi.
  // Socket kopup geri gelirse (Electron'da sık olur), bu useEffect TEKRAR çalışır ve otomatik bağlanır.
  }, [currentVoiceChannelId, currentServerId, socket, socket?.connected, user, inputDeviceId]);


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

      // Renegotiation (Mevcut bağlantılara ekle)
      Object.values(peersRef.current).forEach(async ({ connection, userId }) => {
          stream.getTracks().forEach(track => connection.addTrack(track, stream));
          try {
              const offer = await connection.createOffer();
              await connection.setLocalDescription(offer);
              // Not: Target socket id peersRef object key'den bulunmalı, burada basitleştirildi.
              // En temizi kullanıcıya odaya gir-çık yaptırmaktır ekran paylaşınca.
          } catch(e) {}
      });

      stream.getVideoTracks()[0].onended = stopScreenShare;
      addToast('Ekran paylaşımı başlatıldı.', 'success');
    } catch (error) {
       addToast(`Hata: ${error.message}`, 'error');
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setMyScreenStream(null);
      addToast('Ekran paylaşımı durduruldu.', 'info');
    }
  };

  return { startScreenShare, stopScreenShare };
};