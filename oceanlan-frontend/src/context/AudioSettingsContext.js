// src/context/AudioSettingsContext.js
import React, { createContext, useState, useEffect } from 'react';

export const AudioSettingsContext = createContext();

export const AudioSettingsProvider = ({ children }) => {
  // Varsayılan Ayarlar
  const [inputMode, setInputMode] = useState(localStorage.getItem('inputMode') || 'VOICE_ACTIVITY');
  const [pttKey, setPttKey] = useState(localStorage.getItem('pttKey') || 'Space');
  const [pttKeyCode, setPttKeyCode] = useState(localStorage.getItem('pttKeyCode') || 'Space');

  // 👇 YENİ: Hoparlör Seçimi (Varsayılan 'default')
  const [outputDeviceId, setOutputDeviceId] = useState(localStorage.getItem('outputDeviceId') || 'default');

  // Global Mikrofon ve Kulaklık Durumu
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [userVolumes, setUserVolumes] = useState({});

  useEffect(() => {
    localStorage.setItem('inputMode', inputMode);
    localStorage.setItem('pttKey', pttKey);
    localStorage.setItem('pttKeyCode', pttKeyCode);
    // 👇 YENİ: Hoparlör ayarını kaydet
    localStorage.setItem('outputDeviceId', outputDeviceId);
  }, [inputMode, pttKey, pttKeyCode, outputDeviceId]);

  const setUserVolume = (userId, volume) => {
    setUserVolumes(prev => ({
      ...prev,
      [userId]: volume
    }));
  };

  const getUserVolume = (userId) => {
    return userVolumes[userId] !== undefined ? userVolumes[userId] : 100;
  };

  const toggleMic = () => setIsMicMuted((prev) => !prev);
  const toggleDeafen = () => setIsDeafened((prev) => !prev);

  return (
    <AudioSettingsContext.Provider
      value={{
        inputMode, setInputMode,
        pttKey, setPttKey,
        pttKeyCode, setPttKeyCode,
        outputDeviceId, setOutputDeviceId, // 👈 DIŞARI AKTARILDI
        isMicMuted, toggleMic, setIsMicMuted,
        isDeafened, toggleDeafen,
        userVolumes, setUserVolume, getUserVolume
      }}
    >
      {children}
    </AudioSettingsContext.Provider>
  );
};