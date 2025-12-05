// src/hooks/useVoiceChannel.js
import { useEffect, useRef, useContext, useState, useCallback } from 'react';
import Peer from 'simple-peer';
import { useSocket } from './useSocket';
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

// ⚠️ NOT: Prodüksiyon için mutlaka bir TURN sunucusu eklemelisin.
// Sadece STUN ile farklı ağlardaki (okul, şirket, 4G) kullanıcılar birbirini duyamaz.
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
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
  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const audioElementsRef = useRef({});
  const speakingMapRef = useRef({});
  const audioAnalyzersRef = useRef({});

  // AudioContext Refleri
  const localAudioContextRef = useRef(null);

  // State
  const [isPTTPressed, setIsPTTPressed] = useState(false);

  // --- 1. SES ANALİZİ VE KONUŞMA DURUMU ---
  const updateSpeakingState = useCallback((id, isSpeaking) => {
      if (!id) return;
      if (speakingMapRef.current[id] === isSpeaking) return;
      speakingMapRef.current[id] = isSpeaking;
      // State güncellemesini çok sık yapmamak için throttle yapılabilir ama şimdilik doğrudan set ediyoruz
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

    // Track enabled durumunu sadece değiştiyse güncelle (gereksiz işlemden kaçın)
    if (audioTrack.enabled !== shouldEnable) {
        audioTrack.enabled = shouldEnable;
    }
  }, [isMicMuted, inputMode, isPTTPressed]);

  // Her dependency değişiminde mikrofonu güncelle
  useEffect(() => { updateMicrophoneState(); }, [updateMicrophoneState]);

  // --- 3. PUSH TO TALK (KLAVYE) ---
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

  // --- 4. SES ÇIKIŞ AYARLARI (VOLUME & DEVICE) ---
  useEffect(() => {
    Object.keys(audioElementsRef.current).forEach((socketId) => {
      const audioEl = audioElementsRef.current[socketId];
      if (!audioEl) return;

      // Çıkış Cihazı (Electron/Chrome)
      if (typeof audioEl.setSinkId === 'function' && outputDeviceId) {
        audioEl.setSinkId(outputDeviceId).catch(err => console.warn("SinkId Error:", err));
      }

      // Ses Seviyesi ve Sağırlaştırma
      audioEl.muted = isDeafened; // Eğer sağırsak element tamamen sussun

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
    // Video varsa (Ekran paylaşımı)
    if (stream.getVideoTracks().length > 0) {
        addIncomingStream(socketId, stream);
        return;
    }

    // Zaten bu socket için bir ses elementi varsa ve srcObject aynıysa dokunma
    if (audioElementsRef.current[socketId] && audioElementsRef.current[socketId].srcObject?.id === stream.id) {
        return;
    }

    // Temizle ve Yeni Oluştur
    if (audioElementsRef.current[socketId]) audioElementsRef.current[socketId].remove();

    const audioEl = document.createElement('audio');
    audioEl.srcObject = stream;
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.controls = false;
    audioEl._userId = userId; // Volume kontrolü için ID'yi sakla

    // Elementi DOM'a ekle (Bazı tarayıcılar DOM'da olmayan elementin sesini kısar)
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);

    // Oynatmayı dene (Autoplay Policy Fix)
    const playPromise = audioEl.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.warn(`Autoplay engellendi (${socketId}):`, error);
            // Kullanıcı etkileşimi gerekebilir uyarısı buraya eklenebilir
        });
    }

    audioElementsRef.current[socketId] = audioEl;

    // Audio Context Analizi (Yeşil Çerçeve İçin)
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            // Eğer daha önce varsa kapatma, yeniden kullanma mantığı eklenebilir ama basit tutuyoruz
            if (audioAnalyzersRef.current[socketId]?.ctx?.state === 'running') return;

            const audioCtx = new AudioContext();

            // 📢 KRİTİK DÜZELTME: Context askıdaysa (suspended) devam ettir
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            audioAnalyzersRef.current[socketId] = { ctx: audioCtx, analyser };

            const checkLevel = () => {
                // Component unmount olduysa dur
                if (!audioAnalyzersRef.current[socketId]) return;

                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const avg = sum / dataArray.length;

                // Hassasiyet eşiği (0-255 arası değer, 10-15 iyidir)
                updateSpeakingState(userId || socketId, avg > 10);

                requestAnimationFrame(checkLevel);
            };
            checkLevel();
        }
    } catch(e) { console.error("Audio Analysis Error:", e); }
  };

  // --- 6. PEER YÖNETİMİ ---
  const createPeer = (id, userId, initiator, stream) => {
      // Eğer zaten peer varsa ve destroy olmamışsa döndür
      if (peersRef.current[id] && !peersRef.current[id].destroyed) {
          return peersRef.current[id];
      }

      const p = new Peer({
          initiator,
          trickle: false, // Simple-peer için bazen trickle:false bağlantıyı hızlandırır (ama her zaman değil)
          stream: stream || undefined, // Stream yoksa (sadece dinleyiciysek) undefined gönder
          config: rtcConfig
      });

      // Sinyal (SDP/ICE) oluşunca sunucuya gönder
      p.on('signal', data => {
          if (socket && socket.connected) {
              const type = initiator ? 'webrtc-offer' : 'webrtc-answer';
              socket.emit(type, { targetSocketId: id, sdp: data });
          }
      });

      p.on('stream', remoteStream => handleRemoteStream(remoteStream, id, userId));

      p.on('error', err => {
          console.error(`Peer error (${id}):`, err);
          // Hata durumunda peer'ı temizleyebiliriz ama simple-peer genelde kendi kapanır
      });

      p.on('close', () => {
         // console.log(`Peer closed (${id})`);
         // Cleanup buraya eklenebilir
      });

      peersRef.current[id] = p;
      return p;
  };

  // --- 7. ANA BAĞLANTI MANTIĞI (RACE CONDITION FIX) ---
  useEffect(() => {
    // Gerekli veriler yoksa çık
    if (!currentVoiceChannelId || !currentServerId || !user || !socket || !socket.connected) {
        return;
    }

    let isMounted = true;
    let localStream = null;

    const startConnection = async () => {
        // A. ÖNCE SOCKET DİNLEYİCİLERİNİ KUR (Mikrofonu beklemeden!)
        // Bu sayede mikrofon açılana kadar gelen 'offer'ları kaçırmayız.

        // 1. Yeni kullanıcı katıldı -> Biz (Initiator) teklif sunuyoruz
        socket.on('user-joined-voice', ({ socketId, userId }) => {
            if (!isMounted) return;
            console.log(`[Voice] Yeni kullanıcı: ${userId}`);
            // Peer oluştururken o anki localStreamRef.current neyse onu kullan
            createPeer(socketId, userId, true, localStreamRef.current);
        });

        // 2. Biri bize teklif sundu -> Biz (Receiver) cevaplıyoruz
        socket.on('webrtc-offer', ({ socketId, sdp }) => {
            if (!isMounted) return;
            console.log(`[Voice] Offer alındı: ${socketId}`);
            const p = createPeer(socketId, null, false, localStreamRef.current);
            p.signal(sdp);
        });

        // 3. Cevap geldi -> Peer'a sinyali işle
        socket.on('webrtc-answer', ({ socketId, sdp }) => {
            if (peersRef.current[socketId]) {
                peersRef.current[socketId].signal(sdp);
            }
        });

        // 4. ICE Adayı (Trickle açıksa kullanılır, şu an kapalı ama kalsın)
        socket.on('webrtc-ice-candidate', ({ socketId, candidate }) => {
            if (peersRef.current[socketId]) {
                peersRef.current[socketId].signal(candidate);
            }
        });

        socket.on('user-left-voice', ({ socketId }) => {
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
        });

        socket.on('voice-channel-disconnected', () => {
            addToast('Bağlantı kesildi.', 'error');
            leaveVoiceChannel();
        });

        // B. MİKROFONU AL
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
                // Component unmount olduysa stream'i hemen kapat
                localStream.getTracks().forEach(t => t.stop());
                return;
            }

            localStreamRef.current = localStream;
            updateMicrophoneState(); // İlk mute durumunu uygula

            // Kendi sesimizin analizi
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
                        const avg = sum / dataArray.length;
                        updateSpeakingState(user.id, avg > 10);
                        requestAnimationFrame(checkMyLevel);
                    };
                    checkMyLevel();
                }
            } catch (e) {}

            // C. HER ŞEY HAZIR, ŞİMDİ KATIL (Events zaten dinleniyor)
            console.log(`[Voice] Kanala katılıyorum: ${currentVoiceChannelId}`);
            socket.emit('join-voice-channel', {
                channelId: currentVoiceChannelId,
                serverId: currentServerId,
                userId: user.id,
                username: user.username
            });

        } catch (err) {
            console.error("Mikrofon hatası:", err);
            addToast("Mikrofon hatası: " + err.name, 'error');
            // Mikrofon olmasa bile odaya girip dinleyici olmak istersen
            // buradaki return'ü kaldırıp emit join yapabilirsin.
            leaveVoiceChannel();
        }
    };

    startConnection();

    // CLEANUP
    return () => {
        isMounted = false;

        // 1. Socket Dinleyicilerini Temizle
        socket.off('user-joined-voice');
        socket.off('webrtc-offer');
        socket.off('webrtc-answer');
        socket.off('webrtc-ice-candidate');
        socket.off('user-left-voice');
        socket.off('voice-channel-disconnected');

        // 2. Sunucudan Ayrıl
        socket.emit('leave-voice-channel');

        // 3. Local Stream Kapat
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }

        // 4. Peerları Kapat
        Object.values(peersRef.current).forEach(p => {
            if (p) p.destroy();
        });
        peersRef.current = {};

        // 5. Audio Elementleri Temizle
        Object.values(audioElementsRef.current).forEach(el => el.remove());
        audioElementsRef.current = {};

        // 6. Analizleri Kapat
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

  }, [currentVoiceChannelId, currentServerId, socket, socket?.connected, user, inputDeviceId]); // inputDeviceId değişince de yeniden başlar

  // --- EKRAN PAYLAŞIMI (Aynı Mantık) ---
  const startScreenShare = async (electronSourceId = null) => {
    // ... (Mevcut kodun aynısı kalabilir, sadece peersRef döngüsünde dikkatli ol)
    // Şimdilik burayı kısa tutuyorum, yukarıdaki mantıkla stream'i peer'lara eklemen yeterli.
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

        // Mevcut peerlara stream ekle
        Object.values(peersRef.current).forEach(p => {
             // Simple-peer addStream methodu
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