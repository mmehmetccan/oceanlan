// src/hooks/useVoiceChannel.js
import { useContext, useEffect, useState } from 'react';
import { VoiceContext } from '../context/VoiceContext';
import { AudioSettingsContext } from '../context/AudioSettingsContext';

export const useVoiceChannel = () => {
  const voiceData = useContext(VoiceContext);
  const audioData = useContext(AudioSettingsContext);

  // Bas-Konuş (Push to Talk) Klavye Dinleyicisi
  // Bu UI ile ilgili olduğu için Hook'ta kalması daha mantıklı
  const [isPTTPressed, setIsPTTPressed] = useState(false);
  const { inputMode, pttKeyCode, toggleMic } = audioData || {};

  useEffect(() => {
    if (inputMode !== 'PUSH_TO_TALK') {
      if (isPTTPressed) setIsPTTPressed(false);
      return;
    }

    const handleDown = (e) => {
        if (!e.repeat && e.code === pttKeyCode) {
            setIsPTTPressed(true);
            // Push to talk basıldığında miki aç (toggleMic mantığına göre uyarlaman gerekebilir)
            // Genelde Context'te setIsMicMuted(false) diye bir metod açmak daha temizdir.
            // Şimdilik sadece state tutuyoruz.
        }
    };
    const handleUp = (e) => {
        if (e.code === pttKeyCode) {
            setIsPTTPressed(false);
        }
    };
    const handleBlur = () => setIsPTTPressed(false);

    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [inputMode, pttKeyCode]);

  // Push to Talk durumuna göre mikrofonu VoiceContext'te güncellemek için
  // useEffect ile isMicMuted kontrolü yapılabilir ancak şimdilik bunu basit tutuyoruz.
  // AudioSettingsContext zaten isMicMuted durumunu VoiceContext'e iletiyor.

  if (!voiceData || !audioData) {
      return {
          joinVoiceChannel: () => {},
          leaveVoiceChannel: () => {},
          currentVoiceChannelId: null,
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
          setUserVolume: () => {}
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

    // PTT Durumu (UI'da göstermek için)
    isPTTPressed
  };
};