import React, { createContext, useState, useEffect } from 'react';

export const AudioSettingsContext = createContext();

export const AudioSettingsProvider = ({ children }) => {
  const [inputMode, setInputMode] = useState(localStorage.getItem('inputMode') || 'VOICE_ACTIVITY');
  const [pttKey, setPttKey] = useState(localStorage.getItem('pttKey') || 'Space');
  const [pttKeyCode, setPttKeyCode] = useState(localStorage.getItem('pttKeyCode') || 'Space');

  const [outputDeviceId, setOutputDeviceId] = useState(localStorage.getItem('outputDeviceId') || 'default');
  const [inputDeviceId, setInputDeviceId] = useState(localStorage.getItem('inputDeviceId') || 'default');

  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  const [userVolumes, setUserVolumes] = useState({});

  // ✅ YENİ – Mikrofon ses seviyesi
  const [inputVolume, setInputVolume] = useState(
    Number(localStorage.getItem('inputVolume')) || 100
  );

  const [isNoiseSuppression, setIsNoiseSuppression] = useState(
    localStorage.getItem('isNoiseSuppression') !== 'false'
  );

  useEffect(() => {
    localStorage.setItem('inputMode', inputMode);
    localStorage.setItem('pttKey', pttKey);
    localStorage.setItem('pttKeyCode', pttKeyCode);
    localStorage.setItem('outputDeviceId', outputDeviceId);
    localStorage.setItem('inputDeviceId', inputDeviceId);
    localStorage.setItem('inputVolume', inputVolume);
    localStorage.setItem('isNoiseSuppression', isNoiseSuppression);
  }, [
    inputMode,
    pttKey,
    pttKeyCode,
    outputDeviceId,
    inputDeviceId,
    inputVolume,
    isNoiseSuppression
  ]);

  const setUserVolume = (userId, volume) => {
    setUserVolumes(prev => ({ ...prev, [userId]: volume }));
  };

  const getUserVolume = (userId) =>
    userVolumes[userId] !== undefined ? userVolumes[userId] : 100;

  return (
    <AudioSettingsContext.Provider
      value={{
        inputMode, setInputMode,
        pttKey, setPttKey,
        pttKeyCode, setPttKeyCode,
        outputDeviceId, setOutputDeviceId,
        inputDeviceId, setInputDeviceId,
        inputVolume, setInputVolume, // ✅
        isMicMuted, setIsMicMuted,
        isDeafened, setIsDeafened,
        userVolumes, setUserVolume, getUserVolume,
        isNoiseSuppression, setIsNoiseSuppression
      }}
    >
      {children}
    </AudioSettingsContext.Provider>
  );
};
