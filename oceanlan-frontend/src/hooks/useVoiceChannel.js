// src/hooks/useVoiceChannel.js
import { useEffect, useRef, useContext, useState } from 'react';
import Peer from 'simple-peer';
import { useSocket } from './useSocket';
import { VoiceContext } from '../context/VoiceContext';
import { AuthContext } from '../context/AuthContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';

// 👇 1. STUN SUNUCULARI EKLENDİ
// Bu ayar, farklı ağlardaki (NAT arkasındaki) cihazların birbirini bulmasını sağlar.
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

  // VoiceContext'ten gelen tüm fonksiyon ve state'ler
  const {
      currentVoiceChannelId,
      currentServerId,
      joinVoiceChannel,
      leaveVoiceChannel,
      setMyScreenStream,
      addIncomingStream,
      removeIncomingStream
  } = useContext(VoiceContext);

  // Ses ayarlarını ve kullanıcı ses seviyelerini çek
  const { inputMode, pttKeyCode, isMicMuted, userVolumes } = useContext(AudioSettingsContext);

  // Referanslar
  const peersRef = useRef({});
  const localStreamRef = useRef(null);      // Mikrofon akışı
  const screenStreamRef = useRef(null);     // Ekran paylaşımı akışı
  const audioContextRef = useRef(null);     // Web Audio API Context
  const gainNodesRef = useRef({});          // { socketId: GainNode }

  // Bas-Konuş durumunu takip etmek için
  const [isPTTPressed, setIsPTTPressed] = useState(false);

  // ==========================================
  // 1. MİKROFON DURUMUNU GÜNCELLEME (Mute/PTT)
  // ==========================================
  const updateMicrophoneState = () => {
    if (!localStreamRef.current) return;

    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;

    // 1. Kullanıcı kendini "Mute" yaptıysa ses gitmez.
    if (isMicMuted) {
        audioTrack.enabled = false;
        return;
    }

    // 2. "Ses Etkinliği" modunda ses hep gider.
    if (inputMode === 'VOICE_ACTIVITY') {
        audioTrack.enabled = true;
        return;
    }

    // 3. "Bas Konuş" modunda sadece tuşa basılıysa ses gider.
    if (inputMode === 'PUSH_TO_TALK') {
        audioTrack.enabled = isPTTPressed;
    }
  };

  // Ayarlar veya PTT durumu değiştiğinde mikrofonu güncelle
  useEffect(() => {
    updateMicrophoneState();
  }, [inputMode, isPTTPressed, isMicMuted]);

  // ==========================================
  // 2. KULLANICI SES SEVİYESİ GÜNCELLEME
  // ==========================================
  useEffect(() => {
    Object.keys(gainNodesRef.current).forEach(socketId => {
        const gainNode = gainNodesRef.current[socketId];
        const remoteUserId = gainNode._userId; // GainNode'a userId iliştirmiştik

        if (remoteUserId && userVolumes[remoteUserId] !== undefined) {
            // Volume 0-200 arası geliyor, bunu 0.0 - 2.0 arasına çevir
            gainNode.gain.value = userVolumes[remoteUserId] / 100;
        }
    });
  }, [userVolumes]);

  // ==========================================
  // 3. BAS KONUŞ TUŞ DİNLEYİCİSİ
  // ==========================================
  useEffect(() => {
    if (inputMode !== 'PUSH_TO_TALK') return;

    const handleKeyDown = (e) => {
        if (e.repeat) return;
        if (e.code === pttKeyCode) {
            setIsPTTPressed(true);
        }
    };

    const handleKeyUp = (e) => {
        if (e.code === pttKeyCode) {
            setIsPTTPressed(false);
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [inputMode, pttKeyCode]);

  // ==========================================
  // 4. EKRAN PAYLAŞIMI FONKSİYONLARI
  // ==========================================
 const startScreenShare = async () => {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always" // Fare imlecini de göster
            },
            audio: true // 📢 ARTIK SES DE PAYLAŞILACAK (Sistem sesi)
        });

          screenStreamRef.current = stream;
          setMyScreenStream(stream); // Context'e bildir (UI için)

          // Mevcut tüm bağlantılara bu yeni akışı ekle
          Object.values(peersRef.current).forEach(peer => {
              peer.addStream(stream);
          });

          // Tarayıcı arayüzünden "Paylaşımı Durdur" denirse
          stream.getVideoTracks()[0].onended = () => {
              stopScreenShare();
          };

      } catch (error) {
          console.error("Ekran paylaşımı başlatılamadı:", error);
      }
  };

  const stopScreenShare = () => {
      if (screenStreamRef.current) {
          // Tüm peer'lardan stream'i kaldırmayı dene
          Object.values(peersRef.current).forEach(peer => {
              try {
                peer.removeStream(screenStreamRef.current);
              } catch (err) { console.warn(err); }
          });

          // Track'leri durdur
          screenStreamRef.current.getTracks().forEach(track => track.stop());
          screenStreamRef.current = null;
          setMyScreenStream(null);
      }
  };

  // ==========================================
  // 5. ANA WEBRTC VE BAĞLANTI MANTIĞI
  // ==========================================
  useEffect(() => {
    if (socket && currentVoiceChannelId && user) {
      const channelId = currentVoiceChannelId;
      const serverId = currentServerId;

      // AudioContext Başlat
      if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      // Mikrofon İzni İste ve Başla
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          localStreamRef.current = stream;
          updateMicrophoneState();

          // --- YENİ KULLANICI GELDİĞİNDE (INITIATOR) ---
          socket.on('user-joined-voice', ({ socketId, userId }) => {
            const peer = new Peer({
                initiator: true,
                stream,
                config: rtcConfig // 👈 2. STUN AYARI BURAYA EKLENDİ
            });

            // Eğer ekran paylaşımı açıksa onu da ekle
            if (screenStreamRef.current) {
                peer.addStream(screenStreamRef.current);
            }

            peer.on('signal', (data) => {
              socket.emit('webrtc-offer', { targetSocketId: socketId, sdp: data });
            });

            // Gelen Akışı İşle
            peer.on('stream', (remoteStream) => {
                handleRemoteStream(remoteStream, socketId, userId);
            });

            peersRef.current[socketId] = peer;
          });

          // --- TEKLİF GELDİĞİNDE (RECEIVER) ---
          socket.on('webrtc-offer', ({ socketId, sdp }) => {
            const peer = new Peer({
                initiator: false,
                stream,
                config: rtcConfig // 👈 3. STUN AYARI BURAYA EKLENDİ
            });

            if (screenStreamRef.current) {
                peer.addStream(screenStreamRef.current);
            }

            peer.signal(sdp);
            peer.on('signal', (data) => {
                socket.emit('webrtc-answer', { targetSocketId: socketId, sdp: data });
            });

            // Gelen Akışı İşle (UserId'yi burada tam bilemeyebiliriz, varsayılan ses ile başlar)
            peer.on('stream', (remoteStream) => {
                 handleRemoteStream(remoteStream, socketId, null); // UserId null ise 100% ses
            });

            peersRef.current[socketId] = peer;
          });

          socket.on('webrtc-answer', ({ socketId, sdp }) => peersRef.current[socketId]?.signal(sdp));
          socket.on('webrtc-ice-candidate', ({ socketId, candidate }) => peersRef.current[socketId]?.signal(candidate));

          socket.on('user-left-voice', ({ socketId }) => {
              if (peersRef.current[socketId]) {
                  peersRef.current[socketId].destroy();
                  delete peersRef.current[socketId];
              }
              if (gainNodesRef.current[socketId]) {
                  gainNodesRef.current[socketId].disconnect();
                  delete gainNodesRef.current[socketId];
              }
              removeIncomingStream(socketId); // Ekran paylaşımını sil
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

    // Yardımcı Fonksiyon: Gelen Stream'i Ayrıştır (Ses mi Video mu?)
    const handleRemoteStream = (remoteStream, socketId, userId) => {
        // Video Track varsa -> EKRAN PAYLAŞIMI
        if (remoteStream.getVideoTracks().length > 0) {
            addIncomingStream(socketId, remoteStream);
        }
        // Sadece Audio ise -> SESLİ SOHBET
        else if (remoteStream.getAudioTracks().length > 0) {
            if (audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume();
            }

            // Web Audio API Zinciri
            const source = audioContextRef.current.createMediaStreamSource(remoteStream);
            const gainNode = audioContextRef.current.createGain();

            const currentVolume = (userId && userVolumes[userId] !== undefined)
                ? userVolumes[userId]
                : 100;

            gainNode.gain.value = currentVolume / 100;
            gainNode._userId = userId; // İleride güncellemek için ID sakla

            source.connect(gainNode);
            gainNode.connect(audioContextRef.current.destination);

            gainNodesRef.current[socketId] = gainNode;
        }
    };

    // CLEANUP
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

          Object.values(gainNodesRef.current).forEach(n => n.disconnect());
          gainNodesRef.current = {};

          socket.off('user-joined-voice');
          socket.off('webrtc-offer');
          socket.off('webrtc-answer');
          socket.off('webrtc-ice-candidate');
          socket.off('user-left-voice');
          socket.off('force-join-voice-channel');
      }
    };
  }, [socket, currentVoiceChannelId, currentServerId, user]);

  // Fonksiyonları dışarı aktar
  return { startScreenShare, stopScreenShare };
};