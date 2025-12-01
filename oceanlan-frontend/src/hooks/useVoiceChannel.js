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
    setScreenShareCallback
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

  const [isPTTPressed, setIsPTTPressed] = useState(false);

  // -------------------- MİKROFON DURUMU --------------------
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

  // -------------------- BAS-KONUŞ (PTT) --------------------
  useEffect(() => {
    if (inputMode !== 'PUSH_TO_TALK') {
      if (isPTTPressed) setIsPTTPressed(false);
      return;
    }

    const handleKeyDown = (e) => { if (!e.repeat && e.code === pttKeyCode) setIsPTTPressed(true); };
    const handleKeyUp = (e) => { if (e.code === pttKeyCode) setIsPTTPressed(false); };
    const handleBlur = () => setIsPTTPressed(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [inputMode, pttKeyCode]);

  // -------------------- HOPARLÖR & SAĞIRLAŞTIRMA --------------------
  useEffect(() => {
    Object.keys(audioElementsRef.current).forEach((socketId) => {
        const audioEl = audioElementsRef.current[socketId];

        // Çıkış Cihazı
        if (typeof audioEl.setSinkId === 'function' && outputDeviceId) {
            audioEl.setSinkId(outputDeviceId).catch((err) => console.warn('Hoparlör hatası:', err));
        }

        // Sağırlaştırma
        audioEl.muted = isDeafened;

        // Ses Seviyesi
        const uid = audioEl._userId;
        if (!isDeafened && uid && userVolumes[uid] !== undefined) {
            const vol = Math.max(0, Math.min(1, userVolumes[uid] / 100));
            audioEl.volume = vol;
        }
    });
  }, [outputDeviceId, isDeafened, userVolumes]);

  // -------------------- EKRAN PAYLAŞIMI --------------------
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
          stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: true });
      }

      screenStreamRef.current = stream;
      setMyScreenStream(stream);

      Object.values(peersRef.current).forEach((peer) => {
        try { peer.addStream(stream); } catch (e) { console.warn(e); }
      });

      stream.getVideoTracks()[0].onended = stopScreenShare;
      addToast('Ekran paylaşımı başlatıldı.', 'success');
    } catch (error) {
      console.error('Ekran paylaşımı hatası:', error);
      if (error.name !== 'NotAllowedError') addToast('Ekran paylaşımı başlatılamadı.', 'error');
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      Object.values(peersRef.current).forEach((peer) => {
        try { peer.removeStream(screenStreamRef.current); } catch (err) {}
      });
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setMyScreenStream(null);
      addToast('Ekran paylaşımı durduruldu.', 'info');
    }
  };

  // -------------------- REMOTE STREAM --------------------
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
      audioEl.play().catch((e) => console.error('Ses oynatma hatası:', e));
      audioElementsRef.current[socketId] = audioEl;
    }
  };

  // -------------------- ANA BAĞLANTI MANTIĞI --------------------
  useEffect(() => {
    // Eğer kanal seçili değilse veya kullanıcı yoksa çalışmasın
    if (!currentVoiceChannelId || !currentServerId || !user) return;

    // Socket yoksa, kullanıcıya bildir ama hemen pes etme (reconnect olabilir)
    if (!socket || !socket.connected) {
        addToast('Sunucu bağlantısı bekleniyor...', 'warning');
        // return; // DİKKAT: Burada return yaparsak, socket bağlanınca bu effect tekrar çalışmazsa sorun olur.
        // Ancak socket bağımlılık dizisinde olduğu için, socket.connected değişince burası tekrar çalışacaktır.
        // O yüzden burada return yapmak güvenlidir, çünkü socket.connected değişince React bu effecti tekrar çalıştırır.
        return;
    }

    let isMounted = true;

    // Bağlantı zaman aşımı kontrolü
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    connectionTimeoutRef.current = setTimeout(() => {
        if (isMounted && !localStreamRef.current) {
            addToast('Ses kanalına bağlanmak uzun sürüyor...', 'warning');
        }
    }, 12000);

    const initVoiceConnection = async () => {
        try {
            // Mikrofonu başlat
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            if (!isMounted) {
                stream.getTracks().forEach(t => t.stop());
                return;
            }

            localStreamRef.current = stream;
            updateMicrophoneState();

            // --- Socket Event Tanımları ---

            const onUserJoinedVoice = ({ socketId, userId }) => {
                console.log(`[Voice] Kullanıcı katıldı: ${userId}`);
                const peer = new Peer({ initiator: true, stream, config: rtcConfig });
                if (screenStreamRef.current) peer.addStream(screenStreamRef.current);

                peer.on('signal', (data) => socket.emit('webrtc-offer', { targetSocketId: socketId, sdp: data }));
                peer.on('stream', (rs) => handleRemoteStream(rs, socketId, userId));
                peer.on('error', (err) => console.warn(`Peer hatası (${userId}):`, err));

                peersRef.current[socketId] = peer;
            };

            const onWebrtcOffer = ({ socketId, sdp }) => {
                const peer = new Peer({ initiator: false, stream, config: rtcConfig });
                if (screenStreamRef.current) peer.addStream(screenStreamRef.current);

                peer.signal(sdp);
                peer.on('signal', (data) => socket.emit('webrtc-answer', { targetSocketId: socketId, sdp: data }));
                peer.on('stream', (rs) => handleRemoteStream(rs, socketId, null));
                peer.on('error', (err) => console.warn('Peer hatası (receiver):', err));

                peersRef.current[socketId] = peer;
            };

            const onWebrtcAnswer = ({ socketId, sdp }) => {
                const peer = peersRef.current[socketId];
                if (peer) peer.signal(sdp);
            };

            const onWebrtcIceCandidate = ({ socketId, candidate }) => {
                const peer = peersRef.current[socketId];
                if (peer) peer.signal(candidate);
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
                removeIncomingStream(socketId);
            };

            // Olayları Dinle
            socket.on('user-joined-voice', onUserJoinedVoice);
            socket.on('webrtc-offer', onWebrtcOffer);
            socket.on('webrtc-answer', onWebrtcAnswer);
            socket.on('webrtc-ice-candidate', onWebrtcIceCandidate);
            socket.on('user-left-voice', onUserLeftVoice);

            // Sunucuya Katılma İsteği
            socket.emit('join-voice-channel', {
                channelId: currentVoiceChannelId,
                serverId: currentServerId,
                userId: user.id,
                username: user.username,
            });

            // Başarılı olursa timeout'u temizle
            if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
            // addToast('Ses kanalına bağlanıldı.', 'success'); // İsteğe bağlı bildirim

        } catch (err) {
            console.error('Ses bağlantı hatası:', err);
            let msg = 'Ses kanalına bağlanılamadı.';

            if (err.name === 'NotAllowedError') msg = 'Mikrofon izni verilmedi. Lütfen tarayıcı ayarlarını kontrol edin.';
            else if (err.name === 'NotFoundError') msg = 'Mikrofon cihazı bulunamadı.';
            else if (err.name === 'NotReadableError') msg = 'Mikrofon başka bir uygulama tarafından kullanılıyor.';

            addToast(msg, 'error');
            leaveVoiceChannel(); // Hata durumunda temizle ve çık
        }
    };

    initVoiceConnection();

    // --- TEMİZLİK (CLEANUP) ---
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

        Object.values(peersRef.current).forEach((p) => p.destroy());
        peersRef.current = {};

        Object.values(audioElementsRef.current).forEach((el) => {
            el.srcObject = null;
            el.remove();
        });
        audioElementsRef.current = {};
    };

  // 🔥 Kritik: socket.connected değişince de bu hook tekrar çalışsın ki yeniden bağlansın
  }, [currentVoiceChannelId, currentServerId, socket, socket?.connected, user, inputDeviceId]);

  return { startScreenShare, stopScreenShare };
};