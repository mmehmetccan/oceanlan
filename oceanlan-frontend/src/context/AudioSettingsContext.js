// src/context/AudioSettingsContext.js
import React, { createContext, useState, useEffect } from 'react';

export const AudioSettingsContext = createContext();

export const AudioSettingsProvider = ({ children }) => {
  // Varsayılan Ayarlar
  const [inputMode, setInputMode] = useState(localStorage.getItem('inputMode') || 'VOICE_ACTIVITY'); // 'VOICE_ACTIVITY' veya 'PUSH_TO_TALK'
  const [pttKey, setPttKey] = useState(localStorage.getItem('pttKey') || 'Space'); // Varsayılan: Boşluk tuşu
  const [pttKeyCode, setPttKeyCode] = useState(localStorage.getItem('pttKeyCode') || 'Space'); // Tuşun teknik kodu

  // Global Mikrofon ve Kulaklık Durumu (Anlık)
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [userVolumes, setUserVolumes] = useState({});

  // Ayarlar değişince LocalStorage'a kaydet
  useEffect(() => {
    localStorage.setItem('inputMode', inputMode);
    localStorage.setItem('pttKey', pttKey);
    localStorage.setItem('pttKeyCode', pttKeyCode);
  }, [inputMode, pttKey, pttKeyCode]);

  const setUserVolume = (userId, volume) => {
    setUserVolumes(prev => ({
      ...prev,
      [userId]: volume
    }));
  };

  // 📢 YENİ: Belirli bir kullanıcının sesini getirme (yoksa 100 dön)
  const getUserVolume = (userId) => {
    return userVolumes[userId] !== undefined ? userVolumes[userId] : 100;
  };

  const toggleMic = () => setIsMicMuted((prev) => !prev);
  const toggleDeafen = () => setIsDeafened((prev) => !prev);

  return (
    <AudioSettingsContext.Provider
      value={{
        inputMode,
        setInputMode,
        pttKey,
        setPttKey,
        pttKeyCode,
        setPttKeyCode,
        isMicMuted,
        toggleMic,
        isDeafened,
        toggleDeafen,
        setIsMicMuted,
          userVolumes,
        setUserVolume,
        getUserVolume
      }}
    >
      {children}
    </AudioSettingsContext.Provider>
  );
};