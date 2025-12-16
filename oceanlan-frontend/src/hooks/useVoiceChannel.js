// src/hooks/useVoiceChannel.js
import { useContext } from 'react';
import { VoiceContext } from '../context/VoiceContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';

export const useVoiceChannel = () => {
  const voiceData = useContext(VoiceContext);
  const audioData = useContext(AudioSettingsContext);

  if (!voiceData || !audioData) {
    return {
      joinVoiceChannel: () => {},
      leaveVoiceChannel: () => {},
      currentVoiceChannelId: null,
      currentVoiceChannelName: null,
      currentServerName: null,
      speakingUsers: {},
      micError: null,
      isConnected: false,
      peersWithVideo: {},
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
      setUserVolume: () => {},

      // ✅ UI için (PTT basılı mı)
      isPTTPressed: false,
    };
  }

  return {
    // --- VoiceContext ---
    joinVoiceChannel: voiceData.joinVoiceChannel,
    leaveVoiceChannel: voiceData.leaveVoiceChannel,
    currentVoiceChannelId: voiceData.currentVoiceChannelId,
    currentVoiceChannelName: voiceData.currentVoiceChannelName,
    currentServerName: voiceData.currentServerName,
    speakingUsers: voiceData.speakingUsers || {},
    micError: voiceData.micError,
    isConnected: voiceData.isConnected,
    peersWithVideo: voiceData.peersWithVideo || {},
    myScreenStream: voiceData.myScreenStream,
    startScreenShare: voiceData.startScreenShare,
    stopScreenShare: voiceData.stopScreenShare,

    // ✅ EKLENDİ: UI’da göstermek için (asıl PTT kontrol VoiceContext’te)
    isPTTPressed: voiceData.isPTTPressed || false,

    // --- AudioSettings ---
    isMicMuted: audioData.isMicMuted,
    toggleMic: audioData.toggleMic,
    isDeafened: audioData.isDeafened,
    toggleDeafen: audioData.toggleDeafen,
    inputDeviceId: audioData.inputDeviceId,
    setInputDeviceId: audioData.setInputDeviceId,
    outputDeviceId: audioData.outputDeviceId,
    setOutputDeviceId: audioData.setOutputDeviceId,
    userVolumes: audioData.userVolumes || {},
    setUserVolume: audioData.setUserVolume,
  };
};
