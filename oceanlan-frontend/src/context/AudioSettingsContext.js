// src/context/AudioSettingsContext.js
import React, { createContext, useState, useEffect } from 'react';

export const AudioSettingsContext = createContext();

export const AudioSettingsProvider = ({ children }) => {
  // --- STATE TANIMLARI ---
  const [inputDeviceId, setInputDeviceId] = useState(localStorage.getItem('inputDeviceId') || 'default');
  const [outputDeviceId, setOutputDeviceId] = useState(localStorage.getItem('outputDeviceId') || 'default');

  const [inputMode, setInputMode] = useState(localStorage.getItem('inputMode') || 'VOICE_ACTIVITY');
  const [pttKey, setPttKey] = useState(localStorage.getItem('pttKey') || 'SPACE');
  const [pushToTalkKey, setPushToTalkKey] = useState(localStorage.getItem('pushToTalkKey') || 'Space');

  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  // String 'true' kontrolü ile boolean'a çevir
  const [isNoiseSuppression, setIsNoiseSuppression] = useState(localStorage.getItem('isNoiseSuppression') === 'true');

  const [userVolumes, setUserVolumes] = useState({});

  // Güvenli inputVolume okuma
  const [inputVolume, setInputVolume] = useState(() => {
      const saved = localStorage.getItem('inputVolume');
      const parsed = parseInt(saved);
      return !isNaN(parsed) ? parsed : 100;
  });

  // --- LOCAL STORAGE KAYITLARI ---
  useEffect(() => { localStorage.setItem('inputDeviceId', inputDeviceId); }, [inputDeviceId]);
  useEffect(() => { localStorage.setItem('outputDeviceId', outputDeviceId); }, [outputDeviceId]);
  useEffect(() => { localStorage.setItem('inputMode', inputMode); }, [inputMode]);
  useEffect(() => { localStorage.setItem('pttKey', pttKey); }, [pttKey]);
  useEffect(() => { localStorage.setItem('pushToTalkKey', pushToTalkKey); }, [pushToTalkKey]);
  useEffect(() => { localStorage.setItem('isNoiseSuppression', isNoiseSuppression); }, [isNoiseSuppression]);
  useEffect(() => { localStorage.setItem('inputVolume', inputVolume); }, [inputVolume]);

  const setUserVolume = (userId, volume) => {
    setUserVolumes(prev => ({ ...prev, [userId]: volume }));
  };

  // 🟢 1. EKSİK OLAN TOGGLE FONKSİYONLARI (Burayı ekledik)

  const toggleMic = () => {
      setIsMicMuted(prev => !prev);
  };

  const toggleDeafen = () => {
      setIsDeafened(prev => !prev);
  };

  const toggleNoiseSuppression = () => {
      setIsNoiseSuppression(prev => !prev);
  };

  return (
    <AudioSettingsContext.Provider value={{
      inputDeviceId, setInputDeviceId,
      outputDeviceId, setOutputDeviceId,
      inputMode, setInputMode,
      pttKey, setPttKey,
      pushToTalkKey, setPushToTalkKey,
      isMicMuted, setIsMicMuted,
      isDeafened, setIsDeafened,
      isNoiseSuppression, setIsNoiseSuppression,
      userVolumes, setUserVolume,
      inputVolume, setInputVolume,

      // 🟢 2. FONKSİYONLARI DIŞARI AKTARIYORUZ
      toggleMic,
      toggleDeafen,
      toggleNoiseSuppression
    }}>
      {children}
    </AudioSettingsContext.Provider>
  );
};