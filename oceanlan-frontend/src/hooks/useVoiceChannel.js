// src/hooks/useVoiceChannel.js
import { useContext } from 'react';
import { VoiceContext } from '../context/VoiceContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';

// Bu hook artık sadece verileri çekmek ve arayüzü güncellemek için kullanılıyor.
// Tüm bağlantı mantığı VoiceContext içinde "ölümsüz" hale geldi.
export const useVoiceChannel = () => {
  const {
    joinVoiceChannel,
    leaveVoiceChannel,
    currentVoiceChannelId,
    speakingUsers,
    micError,
    isConnected
  } = useContext(VoiceContext);

  const {
      isMicMuted,
      toggleMic,
      isDeafened,
      toggleDeafen
  } = useContext(AudioSettingsContext);

  return {
    joinVoiceChannel,
    leaveVoiceChannel,
    currentVoiceChannelId,
    speakingUsers,
    micError,
    isConnected,
    // Ses kontrollerini de buradan dışarı veriyoruz
    isMicMuted,
    toggleMic,
    isDeafened,
    toggleDeafen
  };
};