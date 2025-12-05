// src/hooks/useVoiceChannel.js
import { useContext } from 'react';
import { VoiceContext } from '../context/VoiceContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';

// Bu hook artık sadece verileri çekmek ve arayüzü güncellemek için kullanılıyor.
// Tüm karmaşık bağlantı ve ses mantığı VoiceContext içinde "ölümsüz" hale geldi.
export const useVoiceChannel = () => {
  // VoiceContext'ten gelen veriler
  const {
    joinVoiceChannel,
    leaveVoiceChannel,
    currentVoiceChannelId,
    speakingUsers,
    micError,
    isConnected,
    myScreenStream,        // Ekran paylaşımı için
    startScreenShare,      // Ekran paylaşımı başlatma (VoiceContext'te tanımlıysa)
    stopScreenShare        // Ekran paylaşımı durdurma (VoiceContext'te tanımlıysa)
  } = useContext(VoiceContext);

  // AudioSettingsContext'ten gelen ses ayarları
  const {
      isMicMuted,
      toggleMic,
      isDeafened,
      toggleDeafen,
      inputDeviceId,
      setInputDeviceId,
      outputDeviceId,
      setOutputDeviceId,
      userVolumes,
      setUserVolume
  } = useContext(AudioSettingsContext);

  return {
    // Bağlantı Fonksiyonları
    joinVoiceChannel,
    leaveVoiceChannel,

    // Durum Verileri
    currentVoiceChannelId,
    speakingUsers,
    micError,
    isConnected,

    // Ses Kontrolleri
    isMicMuted,
    toggleMic,
    isDeafened,
    toggleDeafen,
    inputDeviceId,
    setInputDeviceId,
    outputDeviceId,
    setOutputDeviceId,
    userVolumes,
    setUserVolume,

    // Ekran Paylaşımı (Opsiyonel)
    myScreenStream,
    startScreenShare,
    stopScreenShare
  };
};