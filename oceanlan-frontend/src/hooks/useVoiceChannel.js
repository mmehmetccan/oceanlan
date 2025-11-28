// src/hooks/useVoiceChannel.js
import { useEffect, useRef, useContext, useState } from 'react';
import Peer from 'simple-peer';
import { useSocket } from './useSocket';
import { VoiceContext } from '../context/VoiceContext';
import { AuthContext } from '../context/AuthContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';

// 🔴 EN ÖNEMLİ KISIM: STUN + TURN SUNUCULARI
const ICE_SERVERS = [
  // Google STUN
  { urls: 'stun:stun.l.google.com:19302' },

  // OpenRelay ücretsiz STUN/TURN (public free tier)
  { urls: 'stun:openrelay.metered.ca:80' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

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

  const { inputMode, pttKeyCode, isMicMuted, userVolumes } =
    useContext(AudioSettingsContext);

  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const gainNodesRef = useRef({});

  const [isPTTPressed, setIsPTTPressed] = useState(false);

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

  useEffect(() => {
    Object.keys(gainNodesRef.current).forEach((socketId) => {
      const gainNode = gainNodesRef.current[socketId];
      const remoteUserId = gainNode._userId;

      if (remoteUserId && userVolumes[remoteUserId] !== undefined) {
        gainNode.gain.value = userVolumes[remoteUserId] / 100;
      }
    });
  }, [userVolumes]);

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

  // EKRAN PAYLAŞIMI
  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
        },
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
      console.error('Ekran paylaşımı başlatılamadı:', error);
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      Object.values(peersRef.current).forEach((peer) => {
        try {
          peer.removeStream(screenStreamRef.current);
        } catch (err) {
          console.warn(err);
        }
      });

      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      setMyScreenStream(null);
    }
  };

  // ANA WEBRTC MANTIĞI
  useEffect(() => {
    if (socket && currentVoiceChannelId && user) {
      const channelId = currentVoiceChannelId;
      const serverId = currentServerId;

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)();
      }

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          localStreamRef.current = stream;
          updateMicrophoneState();

          // --- INITIATOR ---
          socket.on('user-joined-voice', ({ socketId, userId }) => {
            console.log('[VOICE] user-joined-voice, initiator peer ->', socketId);

            const peer = new Peer({
              initiator: true,
              trickle: true,
              stream,
              config: { iceServers: ICE_SERVERS }, // 🔥 BURASI YENİ
            });

            if (screenStreamRef.current) {
              peer.addStream(screenStreamRef.current);
            }

            peer.on('signal', (data) => {
              socket.emit('webrtc-offer', {
                targetSocketId: socketId,
                sdp: data,
              });
            });

            peer.on('stream', (remoteStream) => {
              handleRemoteStream(remoteStream, socketId, userId);
            });

            peersRef.current[socketId] = peer;
          });

          // --- RECEIVER ---
          socket.on('webrtc-offer', ({ socketId, sdp }) => {
            console.log('[VOICE] webrtc-offer alındı, receiver peer ->', socketId);

            const peer = new Peer({
              initiator: false,
              trickle: true,
              stream,
              config: { iceServers: ICE_SERVERS }, // 🔥 BURASI YENİ
            });

            if (screenStreamRef.current) {
              peer.addStream(screenStreamRef.current);
            }

            peer.signal(sdp);

            peer.on('signal', (data) => {
              socket.emit('webrtc-answer', {
                targetSocketId: socketId,
                sdp: data,
              });
            });

            peer.on('stream', (remoteStream) => {
              handleRemoteStream(remoteStream, socketId, null);
            });

            peersRef.current[socketId] = peer;
          });

          socket.on('webrtc-answer', ({ socketId, sdp }) => {
            console.log('[VOICE] webrtc-answer alındı ->', socketId);
            peersRef.current[socketId]?.signal(sdp);
          });

          socket.on('webrtc-ice-candidate', ({ socketId, candidate }) => {
            console.log('[VOICE] webrtc-ice-candidate alındı ->', socketId);
            peersRef.current[socketId]?.signal(candidate);
          });

          socket.on('user-left-voice', ({ socketId }) => {
            console.log('[VOICE] user-left-voice ->', socketId);
            if (peersRef.current[socketId]) {
              peersRef.current[socketId].destroy();
              delete peersRef.current[socketId];
            }
            if (gainNodesRef.current[socketId]) {
              gainNodesRef.current[socketId].disconnect();
              delete gainNodesRef.current[socketId];
            }
            removeIncomingStream(socketId);
          });

          socket.on('force-join-voice-channel', ({ serverId, channelId }) => {
            joinVoiceChannel(serverId, channelId);
          });

          // Odaya katıl
          socket.emit('join-voice-channel', {
            channelId,
            serverId,
            userId: user.id,
            username: user.username,
          });
        })
        .catch((err) => {
          console.error('Mikrofon hatası:', err);
          alert('Mikrofon izni gerekli.');
          leaveVoiceChannel();
        });
    }

    const handleRemoteStream = (remoteStream, socketId, userId) => {
      if (remoteStream.getVideoTracks().length > 0) {
        addIncomingStream(socketId, remoteStream);
      } else if (remoteStream.getAudioTracks().length > 0) {
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
        }

        const source =
          audioContextRef.current.createMediaStreamSource(remoteStream);
        const gainNode = audioContextRef.current.createGain();

        const currentVolume =
          userId && userVolumes[userId] !== undefined
            ? userVolumes[userId]
            : 100;

        gainNode.gain.value = currentVolume / 100;
        gainNode._userId = userId;

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

        Object.values(gainNodesRef.current).forEach((n) => n.disconnect());
        gainNodesRef.current = {};

        socket.off('user-joined-voice');
        socket.off('webrtc-offer');
        socket.off('webrtc-answer');
        socket.off('webrtc-ice-candidate');
        socket.off('user-left-voice');
        socket.off('force-join-voice-channel');
      }
    };
  }, [socket, currentVoiceChannelId, currentServerId, user, userVolumes]);

  return { startScreenShare, stopScreenShare };
};
