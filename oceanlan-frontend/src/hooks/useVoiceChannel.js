// src/hooks/useVoiceChannel.js
import { useEffect, useRef, useContext, useState } from 'react';
import Peer from 'simple-peer';
import { useSocket } from './useSocket';
import { VoiceContext } from '../context/VoiceContext';
import { AuthContext } from '../context/AuthContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';

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
  const { socket } = useSocket();
  const { user } = useContext(AuthContext);

  const {
    currentVoiceChannelId,
    currentServerId,
    // joinVoiceChannel, // 👈 BURADAN SİLDİK, ARTIK GEREK YOK
    leaveVoiceChannel,
    setMyScreenStream,
    addIncomingStream,
    removeIncomingStream,
  } = useContext(VoiceContext);

  const { inputMode, pttKeyCode, isMicMuted, userVolumes, outputDeviceId, inputDeviceId } = useContext(AudioSettingsContext);

  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const audioElementsRef = useRef({});

  const [isPTTPressed, setIsPTTPressed] = useState(false);

  // ... (updateMicrophoneState, useEffect[outputDeviceId], useEffect[userVolumes], useEffect[inputMode] KISIMLARI AYNI KALSIN) ...
  // KODUN BU ARADAKİ KISIMLARINI DEĞİŞTİRMEYİN (Mikrofon, hoparlör, PTT ayarları)
  // ...

  // MİKROFON DURUMU
  const updateMicrophoneState = () => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;
    if (isMicMuted) { audioTrack.enabled = false; return; }
    if (inputMode === 'VOICE_ACTIVITY') { audioTrack.enabled = true; return; }
    if (inputMode === 'PUSH_TO_TALK') { audioTrack.enabled = !!isPTTPressed; return; }
  };
  useEffect(() => { updateMicrophoneState(); }, [inputMode, isPTTPressed, isMicMuted]);

  // HOPARLÖR
  useEffect(() => {
    Object.values(audioElementsRef.current).forEach((audioEl) => {
      if (typeof audioEl.setSinkId === 'function' && outputDeviceId) {
        audioEl.setSinkId(outputDeviceId).catch((err) => console.warn(err));
      }
    });
  }, [outputDeviceId]);

  // SES SEVİYESİ
  useEffect(() => {
    Object.keys(audioElementsRef.current).forEach((socketId) => {
      const el = audioElementsRef.current[socketId];
      if(el._userId && userVolumes[el._userId] !== undefined) {
          el.volume = Math.min(userVolumes[el._userId] / 100, 1);
      }
    });
  }, [userVolumes]);

  // PTT
  useEffect(() => {
      if(inputMode !== 'PUSH_TO_TALK') { if(isPTTPressed) setIsPTTPressed(false); return; }
      const handleDown = (e) => { if(!e.repeat && e.code === pttKeyCode) setIsPTTPressed(true); };
      const handleUp = (e) => { if(e.code === pttKeyCode) setIsPTTPressed(false); };
      window.addEventListener('keydown', handleDown); window.addEventListener('keyup', handleUp);
      return () => { window.removeEventListener('keydown', handleDown); window.removeEventListener('keyup', handleUp); };
  }, [inputMode, pttKeyCode, isPTTPressed]);

  // MIC SWITCH
  const switchMicrophone = async () => {
      if (!localStreamRef.current) return;
      try {
          const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined } });
          const newTrack = newStream.getAudioTracks()[0];
          const oldTrack = localStreamRef.current.getAudioTracks()[0];
          if(oldTrack) oldTrack.stop();
          localStreamRef.current = newStream;
          updateMicrophoneState();
          Object.values(peersRef.current).forEach(peer => {
              if(peer._pc) {
                  const sender = peer._pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                  if(sender) sender.replaceTrack(newTrack).catch(console.error);
              }
          });
      } catch(e) { console.error(e); }
  };
  useEffect(() => { if(currentVoiceChannelId) switchMicrophone(); }, [inputDeviceId]);

  // EKRAN PAYLAŞIMI (Aynı)
  const startScreenShare = async () => { /* ... Eski kod ... */ };
  const stopScreenShare = () => { /* ... Eski kod ... */ };

  // REMOTE STREAM (Aynı)
  const handleRemoteStream = (remoteStream, socketId, userId) => {
    if (remoteStream.getVideoTracks().length > 0) {
      addIncomingStream(socketId, remoteStream);
    } else if (remoteStream.getAudioTracks().length > 0) {
      const audioEl = document.createElement('audio');
      audioEl.srcObject = remoteStream;
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.controls = false;
      audioEl._userId = userId;
      if (typeof audioEl.setSinkId === 'function' && outputDeviceId) {
        audioEl.setSinkId(outputDeviceId).catch((e) => console.warn(e));
      }
      document.body.appendChild(audioEl);
      audioEl.play().catch((e) => console.error(e));
      audioElementsRef.current[socketId] = audioEl;
    }
  };

  // -------------------- ANA WebRTC MANTIĞI --------------------
  useEffect(() => {
    if (!socket || !currentVoiceChannelId || !currentServerId || !user) {
      return;
    }

    let isMounted = true;

    navigator.mediaDevices
      .getUserMedia({
        audio: { deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined },
      })
      .then((stream) => {
        if (!isMounted) {
            stream.getTracks().forEach(t => t.stop());
            return;
        }

        localStreamRef.current = stream;
        updateMicrophoneState();

        const onUserJoinedVoice = ({ socketId, userId }) => {
          const peer = new Peer({ initiator: true, stream, config: rtcConfig });
          if (screenStreamRef.current) peer.addStream(screenStreamRef.current);
          peer.on('signal', (data) => socket.emit('webrtc-offer', { targetSocketId: socketId, sdp: data }));
          peer.on('stream', (remoteStream) => handleRemoteStream(remoteStream, socketId, userId));
          peersRef.current[socketId] = peer;
        };

        const onWebrtcOffer = ({ socketId, sdp }) => {
          const peer = new Peer({ initiator: false, stream, config: rtcConfig });
          if (screenStreamRef.current) peer.addStream(screenStreamRef.current);
          peer.signal(sdp);
          peer.on('signal', (data) => socket.emit('webrtc-answer', { targetSocketId: socketId, sdp: data }));
          peer.on('stream', (remoteStream) => handleRemoteStream(remoteStream, socketId, null));
          peersRef.current[socketId] = peer;
        };

        const onWebrtcAnswer = ({ socketId, sdp }) => peersRef.current[socketId]?.signal(sdp);
        const onWebrtcIceCandidate = ({ socketId, candidate }) => peersRef.current[socketId]?.signal(candidate);

        const onUserLeftVoice = ({ socketId }) => {
          if (peersRef.current[socketId]) { peersRef.current[socketId].destroy(); delete peersRef.current[socketId]; }
          if (audioElementsRef.current[socketId]) {
            audioElementsRef.current[socketId].srcObject = null;
            audioElementsRef.current[socketId].remove();
            delete audioElementsRef.current[socketId];
          }
          removeIncomingStream(socketId);
        };

        // 📢 NOT: onForceJoinVoiceChannel DİNLEYİCİSİ BURADAN SİLİNDİ

        socket.on('user-joined-voice', onUserJoinedVoice);
        socket.on('webrtc-offer', onWebrtcOffer);
        socket.on('webrtc-answer', onWebrtcAnswer);
        socket.on('webrtc-ice-candidate', onWebrtcIceCandidate);
        socket.on('user-left-voice', onUserLeftVoice);

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
            alert('Mikrofon izni gerekli veya mikrofon bulunamadı.');
            leaveVoiceChannel();
        }
      });

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
        Object.values(audioElementsRef.current).forEach((audioEl) => { audioEl.srcObject = null; audioEl.remove(); });
        audioElementsRef.current = {};

        socket.off('user-joined-voice');
        socket.off('webrtc-offer');
        socket.off('webrtc-answer');
        socket.off('webrtc-ice-candidate');
        socket.off('user-left-voice');
        // socket.off('force-join-voice-channel'); // 👈 SİLİNDİ
      }
    };
  }, [currentVoiceChannelId, currentServerId]); // Sadece ID değişince çalışır

  return { startScreenShare, stopScreenShare };
};