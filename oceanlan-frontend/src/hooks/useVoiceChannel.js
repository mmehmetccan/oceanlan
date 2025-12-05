// src/hooks/useVoiceChannel.js
import { useContext } from 'react';
import { VoiceContext } from '../context/VoiceContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';

export const useVoiceChannel = () => {
  // 1. Context'leri güvenli şekilde çek
  const voiceData = useContext(VoiceContext);
  const audioData = useContext(AudioSettingsContext);

  // 2. Eğer Context henüz yüklenmediyse (null ise) hata vermemesi için boş obje dön
  // Bu, "Cannot convert undefined or null to object" hatasının kesin çözümüdür.
  if (!voiceData || !audioData) {
      return {
          joinVoiceChannel: () => {},
          leaveVoiceChannel: () => {},
          currentVoiceChannelId: null,
          speakingUsers: {},
          micError: null,
          isConnected: false,
          incomingStreams: {}, // 👈 Eksik olan bu!
          myScreenStream: null,
          startScreenShare: () => {},
          stopScreenShare: () => {},
          isMicMuted: false,
          toggleMic: () => {},
          isDeafened: false,
          toggleDeafen: () => {},
          inputDeviceId: "default",
          setInputDeviceId: () => {},
          outputDeviceId: "default",
          setOutputDeviceId: () => {},
          userVolumes: {},
          setUserVolume: () => {}
      };
  }

  // 3. Her şey yüklendiyse verileri döndür
  return {
    // --- VoiceContext Verileri ---
    joinVoiceChannel: voiceData.joinVoiceChannel,
    leaveVoiceChannel: voiceData.leaveVoiceChannel,
    currentVoiceChannelId: voiceData.currentVoiceChannelId,
    speakingUsers: voiceData.speakingUsers || {},
    micError: voiceData.micError,
    isConnected: voiceData.isConnected,

    // 📢 DÜZELTME: Bu kısımlar eksikti, o yüzden hata alıyordun
    incomingStreams: voiceData.incomingStreams || {},
    addIncomingStream: voiceData.addIncomingStream,
    removeIncomingStream: voiceData.removeIncomingStream,

    myScreenStream: voiceData.myScreenStream,
    startScreenShare: voiceData.startScreenShare,
    stopScreenShare: voiceData.stopScreenShare,

    // --- AudioSettings Verileri ---
    isMicMuted: audioData.isMicMuted,
    toggleMic: audioData.toggleMic,
    isDeafened: audioData.isDeafened,
    toggleDeafen: audioData.toggleDeafen,
    inputDeviceId: audioData.inputDeviceId,
    setInputDeviceId: audioData.setInputDeviceId,
    outputDeviceId: audioData.outputDeviceId,
    setOutputDeviceId: audioData.setOutputDeviceId,
    userVolumes: audioData.userVolumes || {},
    setUserVolume: audioData.setUserVolume
  };
};