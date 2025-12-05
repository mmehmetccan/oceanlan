// src/hooks/useVoiceChannel.js
import { useContext } from 'react';
import { VoiceContext } from '../context/VoiceContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';

export const useVoiceChannel = () => {
  // 1. VoiceContext'ten verileri çek
  const voiceData = useContext(VoiceContext);

  // 2. AudioSettingsContext'ten verileri çek
  const audioData = useContext(AudioSettingsContext);

  // 3. Hepsini tek bir pakette bileşene sun
  return {
    // --- VoiceContext Verileri ---
    joinVoiceChannel: voiceData?.joinVoiceChannel,
    leaveVoiceChannel: voiceData?.leaveVoiceChannel,
    currentVoiceChannelId: voiceData?.currentVoiceChannelId,
    speakingUsers: voiceData?.speakingUsers || {},
    micError: voiceData?.micError,
    isConnected: voiceData?.isConnected,
    myScreenStream: voiceData?.myScreenStream,
    startScreenShare: voiceData?.startScreenShare,
    stopScreenShare: voiceData?.stopScreenShare,

    // --- AudioSettings Verileri ---
    isMicMuted: audioData?.isMicMuted,
    toggleMic: audioData?.toggleMic,
    isDeafened: audioData?.isDeafened,
    toggleDeafen: audioData?.toggleDeafen,
    inputDeviceId: audioData?.inputDeviceId,
    setInputDeviceId: audioData?.setInputDeviceId,
    outputDeviceId: audioData?.outputDeviceId,
    setOutputDeviceId: audioData?.setOutputDeviceId,
    userVolumes: audioData?.userVolumes || {},
    setUserVolume: audioData?.setUserVolume
  };
};