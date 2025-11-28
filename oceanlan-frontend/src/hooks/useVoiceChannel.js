// src/hooks/useVoiceChannel.js
import { useEffect, useRef, useContext, useState } from 'react';
import Peer from 'simple-peer';
import { useSocket } from './useSocket';
import { VoiceContext } from '../context/VoiceContext';
import { AuthContext } from '../context/AuthContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';

// 🛠️ POLYFILL: simple-peer için process.nextTick yaması (Çok Önemli!)
if (typeof process === 'undefined') {
  window.process = {
    nextTick: (cb, ...args) => setTimeout(() => cb(...args), 0),
    env: {},
    browser: true
  };
} else if (!process.nextTick) {
  process.nextTick = (cb, ...args) => setTimeout(() => cb(...args), 0);
}

// ---------------------------------------------------------

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export const useVoiceChannel = () => {
  const { socket } = useSocket();
  const { user } = useContext(AuthContext);

  const {
    currentVoiceChannelId,
    currentServerId,
    joinVoiceChannel,
    leaveVoiceChannel,
    setMyScreenStream,
    addIncomingStream,
    removeIncomingStream,
  } = useContext(VoiceContext);

  const {
    inputMode,
    pttKeyCode,
    isMicMuted,
    userVolumes,
    outputDeviceId,
    inputDeviceId,
  } = useContext(AudioSettingsContext);

  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const audioElementsRef = useRef({});
  const audioContextRef = useRef(null); // AudioContext ref'i eklendi
  const gainNodesRef = useRef({}); // GainNodes ref'i eklendi

  const [isPTTPressed, setIsPTTPressed] = useState(false);

  // -------------------- MİKROFON DURUMU --------------------
  const updateMicrophoneState = () => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;

    if (isMicMuted) {
      audioTrack.enabled = false;
      return;
    }

    if (inputMode === 'VOICE_ACTIVITY') {
      audioTrack.enabled = true;
      return;
    }

    if (inputMode === 'PUSH_TO_TALK') {
      audioTrack.enabled = !!isPTTPressed;
      return;
    }
  };

  useEffect(() => {
    updateMicrophoneState();
  }, [inputMode, isPTTPressed, isMicMuted]);

  // -------------------- HOPARLÖR (ÇIKIŞ) AYARI --------------------
  useEffect(() => {
    Object.values(audioElementsRef.current).forEach((audioEl) => {
      // setSinkId sadece bazı tarayıcılarda (Chrome/Edge) var
      if (typeof audioEl.setSinkId === 'function' && outputDeviceId) {
        audioEl
          .setSinkId(outputDeviceId)
          .catch((err) => console.warn('Hoparlör seçilemedi:', err));
      }
    });
  }, [outputDeviceId]);

  // -------------------- KULLANICI SES SEVİYELERİ --------------------
  useEffect(() => {
    Object.keys(audioElementsRef.current).forEach((socketId) => {
      const audioElement = audioElementsRef.current[socketId];
      const remoteUserId = audioElement._userId;
      if (remoteUserId && userVolumes[remoteUserId] !== undefined) {
        // HTML Audio Elementi 0.0 - 1.0 arası değer alır
        let volume = userVolumes[remoteUserId] / 100;
        if (volume > 1) volume = 1; // 1.0'dan büyük olamaz
        audioElement.volume = volume;
      }
    });
  }, [userVolumes]);

  // -------------------- BAS-KONUŞ (PTT) --------------------
  useEffect(() => {
    if (inputMode !== 'PUSH_TO_TALK') {
      if (isPTTPressed) setIsPTTPressed(false);
      return;
    }

    const handleKeyDown = (e) => {
      if (!e.repeat && e.code === pttKeyCode) {
        setIsPTTPressed(true);
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === pttKeyCode) {
        setIsPTTPressed(false);
      }
    };

    const handleBlur = () => setIsPTTPressed(false);
    const handleVisibilityChange = () => {
      if (document.hidden) setIsPTTPressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setIsPTTPressed(false);
    };
  }, [inputMode, pttKeyCode, isPTTPressed]);

  // -------------------- MİKROFON DEĞİŞTİRME --------------------
  const switchMicrophone = async () => {
    if (!localStreamRef.current) return;

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined },
      });

      const newAudioTrack = newStream.getAudioTracks()[0];
      const oldAudioTrack = localStreamRef.current.getAudioTracks()[0];

      if (oldAudioTrack) oldAudioTrack.stop();

      localStreamRef.current = newStream;
      updateMicrophoneState();

      // Bağlı olan herkese yeni sesi gönder (Track değişimi)
      Object.values(peersRef.current).forEach((peer) => {
        // 'simple-peer' instance'ı üzerinden sender'ı bul
        if (peer._pc) {
             const sender = peer._pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
             if (sender) {
                 sender.replaceTrack(newAudioTrack).catch(console.error);
             }
        }
        // Alternatif: peer.replaceTrack (simple-peer metodu)
        // peer.replaceTrack(oldAudioTrack, newAudioTrack, localStreamRef.current);
      });
    } catch (err) {
      console.error('Mikrofon değiştirilemedi:', err);
    }
  };

  // inputDeviceId değiştiğinde
  useEffect(() => {
    if (currentVoiceChannelId) {
      switchMicrophone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputDeviceId]);

  // -------------------- EKRAN PAYLAŞIMI --------------------
  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: true,
      });

      screenStreamRef.current = stream;
      setMyScreenStream(stream);

      Object.values(peersRef.current).forEach((peer) => {
        peer.addStream(stream);
      });

      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error('Ekran paylaşımı hatası:', error);
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
    }
  };

  // -------------------- REMOTE STREAM HANDLER --------------------
  const handleRemoteStream = (remoteStream, socketId, userId) => {
    // Video (Ekran Paylaşımı)
    if (remoteStream.getVideoTracks().length > 0) {
      addIncomingStream(socketId, remoteStream);
    }
    // Ses (Mikrofon)
    else if (remoteStream.getAudioTracks().length > 0) {
      const audioEl = document.createElement('audio');
      audioEl.srcObject = remoteStream;
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.controls = false;
      audioEl._userId = userId;

      // Hoparlör Seçimi
      if (typeof audioEl.setSinkId === 'function' && outputDeviceId) {
        audioEl
          .setSinkId(outputDeviceId)
          .catch((e) => console.warn('Hoparlör seçilemedi:', e));
      }

      document.body.appendChild(audioEl);

      audioEl.play().catch((e) => console.error('Oynatma hatası:', e));

      audioElementsRef.current[socketId] = audioEl;
    }
  };

  // -------------------- ANA WebRTC MANTIĞI --------------------
  useEffect(() => {
    if (!socket || !currentVoiceChannelId || !currentServerId || !user) {
      return;
    }

    // 1. Bayrak: Hızlı kanal değişimlerinde eski işlemi iptal etmek için
    let isMounted = true;

    navigator.mediaDevices
      .getUserMedia({
        audio: { deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined },
      })
      .then((stream) => {
        if (!isMounted) {
            // Eğer kullanıcı bu arada kanaldan çıktıysa, stream'i hemen kapat
            stream.getTracks().forEach(t => t.stop());
            return;
        }

        localStreamRef.current = stream;
        updateMicrophoneState();

        // --- Socket Eventleri ---

        const onUserJoinedVoice = ({ socketId, userId }) => {
          const peer = new Peer({
            initiator: true,
            stream,
            config: rtcConfig,
          });

          if (screenStreamRef.current) peer.addStream(screenStreamRef.current);

          peer.on('signal', (data) => {
            socket.emit('webrtc-offer', {
              targetSocketId: socketId,
              sdp: data,
            });
          });

          peer.on('stream', (remoteStream) =>
            handleRemoteStream(remoteStream, socketId, userId)
          );

          peersRef.current[socketId] = peer;
        };

        const onWebrtcOffer = ({ socketId, sdp }) => {
          const peer = new Peer({
            initiator: false,
            stream,
            config: rtcConfig,
          });

          if (screenStreamRef.current) peer.addStream(screenStreamRef.current);

          peer.signal(sdp);

          peer.on('signal', (data) => {
            socket.emit('webrtc-answer', {
              targetSocketId: socketId,
              sdp: data,
            });
          });

          peer.on('stream', (remoteStream) =>
            handleRemoteStream(remoteStream, socketId, null)
          );

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
          removeIncomingStream(socketId);
        };

        const onForceJoinVoiceChannel = ({ serverId, channelId }) => {
            joinVoiceChannel(serverId, channelId);
        };

        // Eventleri dinle
        socket.on('user-joined-voice', onUserJoinedVoice);
        socket.on('webrtc-offer', onWebrtcOffer);
        socket.on('webrtc-answer', onWebrtcAnswer);
        socket.on('webrtc-ice-candidate', onWebrtcIceCandidate);
        socket.on('user-left-voice', onUserLeftVoice);
        socket.on('force-join-voice-channel', onForceJoinVoiceChannel);

        // Odaya katıl
        socket.emit('join-voice-channel', {
          channelId: currentVoiceChannelId,
          serverId: currentServerId,
          userId: user.id,
          username: user.username,
        });
      })
      .catch((err) => {
        console.error('Mikrofon hatası:', err);
        if (isMounted) {
            alert('Mikrofon izni gerekli.');
            leaveVoiceChannel();
        }
      });

    // CLEANUP
    return () => {
      isMounted = false;

      if (socket) {
        if (localStreamRef.current) {
          socket.emit('leave-voice-channel');
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

        Object.values(audioElementsRef.current).forEach((audioEl) => {
          audioEl.srcObject = null;
          audioEl.remove();
        });
        audioElementsRef.current = {};

        socket.off('user-joined-voice');
        socket.off('webrtc-offer');
        socket.off('webrtc-answer');
        socket.off('webrtc-ice-candidate');
        socket.off('user-left-voice');
        socket.off('force-join-voice-channel');
      }
    };
    // Dependency array'i sadeleştirdik
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVoiceChannelId, currentServerId]); // Sadece kanal değişince çalışsın

  return { startScreenShare, stopScreenShare };
};