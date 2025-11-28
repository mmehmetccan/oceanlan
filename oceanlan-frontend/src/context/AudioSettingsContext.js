// src/context/AudioSettingsContext.js
import React, { createContext, useState, useEffect } from 'react';

export const AudioSettingsContext = createContext();

export const AudioSettingsProvider = ({ children }) => {
  // Varsayılan Ayarlar
  const [inputMode, setInputMode] = useState(localStorage.getItem('inputMode') || 'VOICE_ACTIVITY');
  const [pttKey, setPttKey] = useState(localStorage.getItem('pttKey') || 'Space');
  const [pttKeyCode, setPttKeyCode] = useState(localStorage.getItem('pttKeyCode') || 'Space');

  // 👇 YENİ: Cihaz Seçimleri (Varsayılan 'default')
  const [outputDeviceId, setOutputDeviceId] = useState(localStorage.getItem('outputDeviceId') || 'default');
  const [inputDeviceId, setInputDeviceId] = useState(localStorage.getItem('inputDeviceId') || 'default');

  // Global Mikrofon ve Kulaklık Durumu
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [userVolumes, setUserVolumes] = useState({});

  useEffect(() => {
    localStorage.setItem('inputMode', inputMode);
    localStorage.setItem('pttKey', pttKey);
    localStorage.setItem('pttKeyCode', pttKeyCode);
    // 👇 Ayarları kaydet
    localStorage.setItem('outputDeviceId', outputDeviceId);
    localStorage.setItem('inputDeviceId', inputDeviceId);
  }, [inputMode, pttKey, pttKeyCode, outputDeviceId, inputDeviceId]);

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
        outputDeviceId, setOutputDeviceId, // 👈 Hoparlör
        inputDeviceId, setInputDeviceId,   // 👈 Mikrofon
        isMicMuted, toggleMic, setIsMicMuted,
        isDeafened, toggleDeafen,
        userVolumes, setUserVolume, getUserVolume
      }}
    >
      {children}
    </AudioSettingsContext.Provider>
  );
};