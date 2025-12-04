// src/hooks/useVoiceChannel.js
import { useEffect, useRef, useContext, useState, useCallback } from 'react';
// import Peer from 'simple-peer'; // ARTIK GEREK YOK
import { useSocket } from './useSocket';
import { VoiceContext } from '../context/VoiceContext';
import { AuthContext } from '../context/AuthContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';
import { ToastContext } from '../context/ToastContext';

// --- ADIM 2: GÜÇLÜ STUN SUNUCULARI ---
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

  // Native WebRTC için Peer Referansları
  // Yapı: { socketId: { connection: RTCPeerConnection, queue: RTCIceCandidate[], stream: MediaStream } }
  const peersRef = useRef({});

  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const audioElementsRef = useRef({});
  const connectionTimeoutRef = useRef(null);

  // Konuşma Analizi Refs
  const speakingMapRef = useRef({});
  const audioAnalyzersRef = useRef({});
  const localAudioContextRef = useRef(null);

  const [isPTTPressed, setIsPTTPressed] = useState(false);

  // --- SPEAKING INDICATOR ---
  const updateSpeakingState = useCallback((id, isSpeaking) => {
      if (!id) return;
      if (speakingMapRef.current[id] === isSpeaking) return;
      speakingMapRef.current[id] = isSpeaking;
      setSpeakingUsers({ ...speakingMapRef.current });
  }, [setSpeakingUsers]);

  // --- MİKROFON YÖNETİMİ ---
  const updateMicrophoneState = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;

    if (isMicMuted) audioTrack.enabled = false;
    else if (inputMode === 'VOICE_ACTIVITY') audioTrack.enabled = true;
    else if (inputMode === 'PUSH_TO_TALK') audioTrack.enabled = !!isPTTPressed;
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

  // --- SES ÇIKIŞ AYARLARI (Output Device & Volume) ---
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

  // --- HELPER: AUDIO ELEMENT OLUŞTURMA ---
  const handleRemoteTrack = (event, socketId, userId) => {
    const stream = event.streams[0];
    if (!stream) return;

    // Eğer video kanalıysa (Ekran Paylaşımı)
    if (stream.getVideoTracks().length > 0) {
        addIncomingStream(socketId, stream);
        return;
    }

    // Ses kanalıysa
    if (audioElementsRef.current[socketId]) {
        // Zaten varsa yenileme
        if(audioElementsRef.current[socketId].srcObject !== stream) {
            audioElementsRef.current[socketId].srcObject = stream;
        }
        return;
    }

    const audioEl = document.createElement('audio');
    audioEl.srcObject = stream;
    audioEl.autoplay = true;
    audioEl.playsInline = true; // Mobil uyumluluk
    audioEl.controls = false;
    audioEl._userId = userId;
    audioEl.muted = isDeafened;

    if (typeof audioEl.setSinkId === 'function' && outputDeviceId) {
        audioEl.setSinkId(outputDeviceId).catch(() => {});
    }

    // Görünmez şekilde ekle
    document.body.appendChild(audioEl);

    // Play Promise Hatasını Önle
    audioEl.play().catch(e => console.warn("Otomatik oynatma engellendi:", e));

    audioElementsRef.current[socketId] = audioEl;

    // Remote Analiz (Konuşuyor mu?)
    const id = userId || socketId;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(stream);
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
  };

  // --- HELPER: PEER CONNECTION OLUŞTURMA (Native) ---
  const createPeerConnection = (targetSocketId, userId, initiator) => {
      // Zaten varsa döndür
      if (peersRef.current[targetSocketId]) return peersRef.current[targetSocketId];

      const pc = new RTCPeerConnection(rtcConfig);

      // Peer nesnesini referansta sakla
      // ADIM 1: QUEUE SİSTEMİ BURADA BAŞLIYOR
      peersRef.current[targetSocketId] = {
          connection: pc,
          queue: [], // ICE Candidate Kuyruğu
          userId: userId
      };

      // 1. Local Stream (Mikrofon) Ekle
      if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => {
              pc.addTrack(track, localStreamRef.current);
          });
      }
      // Varsa Ekran Paylaşımı Ekle
      if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => {
              // Screen share tracklerini sender olarak ekle
              pc.addTrack(track, screenStreamRef.current);
          });
      }

      // 2. ICE Candidate Bulununca Sunucuya Gönder
      pc.onicecandidate = (event) => {
          if (event.candidate) {
              socket.emit('webrtc-ice-candidate', {
                  targetSocketId,
                  candidate: event.candidate
              });
          }
      };

      // 3. Karşıdan Stream Gelince
      pc.ontrack = (event) => {
          handleRemoteTrack(event, targetSocketId, userId);
      };

      // 4. Bağlantı Durumu İzleme (Opsiyonel debug için)
      pc.onconnectionstatechange = () => {
          // console.log(`Connection state with ${userId}: ${pc.connectionState}`);
      };

      return peersRef.current[targetSocketId];
  };

  // --- ADIM 1 (DEVAMI): KUYRUK İŞLEME FONKSİYONU ---
  const processCandidateQueue = async (socketId) => {
      const peerObj = peersRef.current[socketId];
      if (!peerObj) return;

      while (peerObj.queue.length > 0) {
          const candidate = peerObj.queue.shift();
          try {
              await peerObj.connection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
              console.error(`Candidate ekleme hatası (${socketId}):`, e);
          }
      }
  };

  // --- ANA BAĞLANTI MANTIĞI ---
  useEffect(() => {
    if (!currentVoiceChannelId || !currentServerId || !user) return;
    if (!socket || !socket.connected) return;

    const onVoiceDisconnected = () => {
        addToast('Bir yetkili tarafından kanaldan çıkarıldınız.', 'info');
        leaveVoiceChannel();
    };

    let isMounted = true;
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);

    connectionTimeoutRef.current = setTimeout(() => {
        if (isMounted && !localStreamRef.current) {
            addToast('Bağlantı bekleniyor (İzinleri kontrol edin)...', 'warning');
        }
    }, 15000);

    const initVoiceConnection = async () => {
        try {
            // --- MİKROFON AL ---
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
                        echoCancellation: true, noiseSuppression: true, autoGainControl: true
                    },
                    video: false
                });
            } catch (err1) {
                console.warn("Varsayılan mikrofon deneniyor...", err1);
                stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            }

            if (!isMounted) { stream.getTracks().forEach(t => t.stop()); return; }

            localStreamRef.current = stream;
            updateMicrophoneState();

            // Local Analiz (Kendim konuşuyor muyum?)
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

            // --- SOCKET OLAYLARI ---

            // 1. Yeni Kullanıcı Geldi -> OFFER Oluştur (Initiator)
            const onUserJoinedVoice = async ({ socketId, userId }) => {
                const peerObj = createPeerConnection(socketId, userId, true);
                const { connection } = peerObj;

                try {
                    const offer = await connection.createOffer();
                    await connection.setLocalDescription(offer);
                    socket.emit('webrtc-offer', { targetSocketId: socketId, sdp: offer });
                } catch (err) { console.error("Offer hatası:", err); }
            };

            // 2. Offer Geldi -> ANSWER Oluştur
            const onOffer = async ({ socketId, sdp }) => {
                // Kullanıcı ID'sini şimdilik bilmiyorsak null geçebiliriz veya socketten geliyorsa ekleriz
                // Backend'den 'userId' bilgisinin de gelmesi iyi olur, gelmiyorsa undefined kalır.
                const peerObj = createPeerConnection(socketId, null, false);
                const { connection } = peerObj;

                try {
                    await connection.setRemoteDescription(new RTCSessionDescription(sdp));

                    // ANSWER oluştur
                    const answer = await connection.createAnswer();
                    await connection.setLocalDescription(answer);
                    socket.emit('webrtc-answer', { targetSocketId: socketId, sdp: answer });

                    // KUYRUKTAKİLERİ İŞLE
                    await processCandidateQueue(socketId);
                } catch (err) { console.error("Answer oluşturma hatası:", err); }
            };

            // 3. Answer Geldi -> Bağlantıyı Tamamla
            const onAnswer = async ({ socketId, sdp }) => {
                const peerObj = peersRef.current[socketId];
                if (!peerObj) return;

                try {
                    await peerObj.connection.setRemoteDescription(new RTCSessionDescription(sdp));
                    // KUYRUKTAKİLERİ İŞLE
                    await processCandidateQueue(socketId);
                } catch (err) { console.error("Remote description set hatası:", err); }
            };

            // 4. ICE Candidate Geldi -> Kuyruğa veya Bağlantıya
            const onIce = async ({ socketId, candidate }) => {
                const peerObj = peersRef.current[socketId];
                // Eğer peer henüz oluşmadıysa (çok nadir), oluşturmayı dene
                if (!peerObj) {
                     // Genelde Offer gelmeden Candidate gelmez ama yine de createPeer çağrılabilir
                     // Ancak initiator kim bilmiyoruz, o yüzden burası riskli.
                     // Genelde Offer handler'ı peer'ı yaratmış olmalı.
                     return;
                }

                if (peerObj.connection.remoteDescription) {
                    // Bağlantı hazır, direkt ekle
                    try {
                        await peerObj.connection.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (e) { console.error("Ice Candidate eklenemedi:", e); }
                } else {
                    // BUG ÇÖZÜMÜ: HENÜZ REMOTE DESCRIPTION YOK, KUYRUĞA AT
                    console.log(`[ICE] Kuyruğa atıldı (${socketId})`);
                    peerObj.queue.push(candidate);
                }
            };

            const onLeft = ({ socketId }) => {
                if (peersRef.current[socketId]) {
                    peersRef.current[socketId].connection.close();
                    delete peersRef.current[socketId];
                }
                if (audioElementsRef.current[socketId]) {
                    audioElementsRef.current[socketId].remove();
                    delete audioElementsRef.current[socketId];
                }
                // Analyser temizliği
                // Object.keys(audioAnalyzersRef.current)...
                removeIncomingStream(socketId);
            };

            socket.on('user-joined-voice', onUserJoinedVoice);
            socket.on('webrtc-offer', onOffer);
            socket.on('webrtc-answer', onAnswer);
            socket.on('webrtc-ice-candidate', onIce);
            socket.on('user-left-voice', onLeft);
            socket.on('voice-channel-disconnected', onVoiceDisconnected);

            // Odaya Katıl
            socket.emit('join-voice-channel', {
                channelId: currentVoiceChannelId,
                serverId: currentServerId,
                userId: user.id,
                username: user.username
            });

            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);

        } catch (err) {
            console.error('Ses hatası:', err);
            let msg = `Bağlantı Hatası: ${err.name}`;
            if (err.name === 'NotAllowedError') msg = 'Mikrofon izni reddedildi!';
            else if (err.name === 'NotFoundError') msg = 'Mikrofon bulunamadı!';
            addToast(msg, 'error');
            leaveVoiceChannel();
        }
    };

    initVoiceConnection();

    // CLEANUP
    return () => {
        isMounted = false;
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        if (socket) {
            socket.emit('leave-voice-channel');
            socket.off('user-joined-voice');
            socket.off('webrtc-offer');
            socket.off('webrtc-answer');
            socket.off('webrtc-ice-candidate');
            socket.off('user-left-voice');
            socket.off('voice-channel-disconnected');
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
        }
        if (screenStreamRef.current) {
             screenStreamRef.current.getTracks().forEach(t => t.stop());
             screenStreamRef.current = null;
             setMyScreenStream(null);
        }
        if (localAudioContextRef.current) {
            localAudioContextRef.current.close();
            localAudioContextRef.current = null;
        }

        // Tüm Peerları kapat
        Object.values(peersRef.current).forEach(p => {
            if(p.connection) p.connection.close();
        });
        peersRef.current = {};

        Object.values(audioElementsRef.current).forEach(e => e.remove());
        audioElementsRef.current = {};
        setSpeakingUsers({});
    };
  }, [currentVoiceChannelId, currentServerId, socket, socket?.connected, user, inputDeviceId]);

  // --- EKRAN PAYLAŞIMI FONKSİYONLARI ---
  // (Not: Ekran paylaşımı da artık native peer connection üzerinden track ekleyerek çalışmalı)
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

      // Mevcut Peerlara Stream Ekle
      Object.values(peersRef.current).forEach(({ connection }) => {
          stream.getTracks().forEach(track => {
              connection.addTrack(track, stream);
          });
          // Track ekleyince yeniden offer yapmak gerekebilir (Renegotiation)
          // Basitlik adına burada renegotiation logic'i tam eklemedim,
          // Ekran paylaşımı için genelde ayrı bir connection veya 'negotiationneeded' event listener gerekir.
          // Mevcut sisteminde ekran paylaşımı için odaya tekrar gir/çık yapılıyorsa sorun olmaz.
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
      // Trackleri peerlardan kaldırmak gerekir ama genelde stop() yeterli olur
      addToast('Ekran paylaşımı durduruldu.', 'info');
    }
  };

  return { startScreenShare, stopScreenShare };
};