// src/hooks/useVoiceChannel.js
import { useEffect, useRef, useContext, useState } from 'react';
import Peer from 'simple-peer';
import { useSocket } from './useSocket';
import { VoiceContext } from '../context/VoiceContext';
import { AuthContext } from '../context/AuthContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
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
      removeIncomingStream
  } = useContext(VoiceContext);

  const { inputMode, pttKeyCode, isMicMuted, userVolumes } = useContext(AudioSettingsContext);

  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);

  // HTML Audio Elementlerini saklamak için ref (Temizlik için gerekli)
  const audioElementsRef = useRef({});

  const [isPTTPressed, setIsPTTPressed] = useState(false);

  // Mikrofon Durumunu Güncelleme
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
        audioTrack.enabled = isPTTPressed;
    }
  };

  useEffect(() => {
    updateMicrophoneState();
  }, [inputMode, isPTTPressed, isMicMuted]);

  // Ses Seviyesi Ayarı (HTML Audio Element üzerinden)
  useEffect(() => {
    Object.keys(audioElementsRef.current).forEach(socketId => {
        const audioElement = audioElementsRef.current[socketId];
        const remoteUserId = audioElement._userId;

        if (remoteUserId && userVolumes[remoteUserId] !== undefined) {
            // Volume 0-200 arası geliyor, HTML Audio 0.0-1.0 arası kabul eder (Max 1.0)
            let volume = userVolumes[remoteUserId] / 100;
            if (volume > 1) volume = 1;
            audioElement.volume = volume;
        }
    });
  }, [userVolumes]);

  // Bas Konuş
  useEffect(() => {
    if (inputMode !== 'PUSH_TO_TALK') return;
    const handleKeyDown = (e) => { if (!e.repeat && e.code === pttKeyCode) setIsPTTPressed(true); };
    const handleKeyUp = (e) => { if (e.code === pttKeyCode) setIsPTTPressed(false); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [inputMode, pttKeyCode]);

  // Ekran Paylaşımı
 const startScreenShare = async () => {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always" },
            audio: true
        });
          screenStreamRef.current = stream;
          setMyScreenStream(stream);
          Object.values(peersRef.current).forEach(peer => {
              peer.addStream(stream);
          });
          stream.getVideoTracks()[0].onended = () => { stopScreenShare(); };
      } catch (error) { console.error("Ekran paylaşımı hatası:", error); }
  };

  const stopScreenShare = () => {
      if (screenStreamRef.current) {
          Object.values(peersRef.current).forEach(peer => {
              try { peer.removeStream(screenStreamRef.current); } catch (err) {}
          });
          screenStreamRef.current.getTracks().forEach(track => track.stop());
          screenStreamRef.current = null;
          setMyScreenStream(null);
      }
  };

  // WebRTC Ana Mantık
  useEffect(() => {
    if (socket && currentVoiceChannelId && user) {
      const channelId = currentVoiceChannelId;
      const serverId = currentServerId;

      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          localStreamRef.current = stream;
          updateMicrophoneState();

          socket.on('user-joined-voice', ({ socketId, userId }) => {
            const peer = new Peer({
                initiator: true,
                stream,
                config: rtcConfig
            });
            if (screenStreamRef.current) peer.addStream(screenStreamRef.current);

            peer.on('signal', (data) => {
              socket.emit('webrtc-offer', { targetSocketId: socketId, sdp: data });
            });
            peer.on('stream', (remoteStream) => handleRemoteStream(remoteStream, socketId, userId));
            peersRef.current[socketId] = peer;
          });

          socket.on('webrtc-offer', ({ socketId, sdp }) => {
            const peer = new Peer({
                initiator: false,
                stream,
                config: rtcConfig
            });
            if (screenStreamRef.current) peer.addStream(screenStreamRef.current);

            peer.signal(sdp);
            peer.on('signal', (data) => {
                socket.emit('webrtc-answer', { targetSocketId: socketId, sdp: data });
            });
            peer.on('stream', (remoteStream) => handleRemoteStream(remoteStream, socketId, null));
            peersRef.current[socketId] = peer;
          });

          socket.on('webrtc-answer', ({ socketId, sdp }) => peersRef.current[socketId]?.signal(sdp));
          socket.on('webrtc-ice-candidate', ({ socketId, candidate }) => peersRef.current[socketId]?.signal(candidate));

          socket.on('user-left-voice', ({ socketId }) => {
              if (peersRef.current[socketId]) {
                  peersRef.current[socketId].destroy();
                  delete peersRef.current[socketId];
              }
              // HTML Audio Elementini temizle
              if (audioElementsRef.current[socketId]) {
                  audioElementsRef.current[socketId].srcObject = null;
                  audioElementsRef.current[socketId].remove(); // DOM'dan sil
                  delete audioElementsRef.current[socketId];
              }
              removeIncomingStream(socketId);
          });

          socket.on('force-join-voice-channel', ({ serverId, channelId }) => {
            joinVoiceChannel(serverId, channelId);
          });

          socket.emit('join-voice-channel', {
              channelId, serverId, userId: user.id, username: user.username
          });
        })
        .catch((err) => {
            console.error("Mikrofon hatası:", err);
            alert("Mikrofon izni gerekli.");
            leaveVoiceChannel();
        });
    }

    // 👇 SES ÇALMA MANTIĞI (GARANTİ YÖNTEM)
    const handleRemoteStream = (remoteStream, socketId, userId) => {
        if (remoteStream.getVideoTracks().length > 0) {
            addIncomingStream(socketId, remoteStream);
        }
        else if (remoteStream.getAudioTracks().length > 0) {
            console.log(`[SES] ${socketId} kullanıcısından ses akışı alındı.`);

            // 1. Görünmez bir <audio> elementi oluştur
            const audioEl = document.createElement('audio');
            audioEl.srcObject = remoteStream;
            audioEl.autoplay = true;
            audioEl.playsInline = true; // Mobil uyumluluk için
            audioEl.controls = false;
            audioEl._userId = userId; // Ses ayarı için ID sakla

            // 2. Bunu sayfaya (DOM) ekle - BU ÇOK ÖNEMLİ!
            // Chrome/Edge, DOM'da olmayan elementlerin sesini kısabilir.
            document.body.appendChild(audioEl);

            // 3. Oynatmayı başlat
            audioEl.play().catch(e => {
                console.error("Ses oynatma hatası (Kullanıcı etkileşimi gerekebilir):", e);
            });

            // 4. Referanslarda sakla (Temizlemek ve ses ayarı için)
            audioElementsRef.current[socketId] = audioEl;
        }
    };

    return () => {
      if (socket) {
          if (localStreamRef.current) {
               socket.emit('leave-voice-channel');
               localStreamRef.current.getTracks().forEach(t => t.stop());
               localStreamRef.current = null;
          }
          if (screenStreamRef.current) {
              screenStreamRef.current.getTracks().forEach(t => t.stop());
              screenStreamRef.current = null;
              setMyScreenStream(null);
          }
          Object.values(peersRef.current).forEach(p => p.destroy());
          peersRef.current = {};

          // Tüm ses elementlerini temizle
          Object.values(audioElementsRef.current).forEach(audioEl => {
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
  }, [socket, currentVoiceChannelId, currentServerId, user]);

  return { startScreenShare, stopScreenShare };
};