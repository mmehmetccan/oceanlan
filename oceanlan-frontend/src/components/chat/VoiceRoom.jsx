import React, { useContext, useState } from 'react';
import { useVoiceChannel } from '../../hooks/useVoiceChannel';
import { VoiceContext } from '../../context/VoiceContext';
import { AudioSettingsContext } from '../../context/AudioSettingsContext';
import { AuthContext } from '../../context/AuthContext';
import '../../styles/VoiceRoom.css';
import { getImageUrl, DEFAULT_AVATAR_URL } from '../../utils/urlHelper';
// 👇 1. MODAL IMPORT
import ScreenSharePickerModal from '../modals/ScreenSharePickerModal';
import UserXPDisplay from '../gamification/UserXPDisplay';
import {
    MicrophoneIcon,
    SpeakerWaveIcon,
    ComputerDesktopIcon,
    PhoneXMarkIcon,
    SignalIcon,
    SparklesIcon,
    VideoCameraIcon // ✅ EKLENDİ
} from '@heroicons/react/24/solid';

const VoiceRoom = () => {
    const { startScreenShare, stopScreenShare } = useVoiceChannel();

    const {
        currentVoiceChannelId,
        leaveVoiceChannel,
        myScreenStream,
        currentVoiceChannelName,
        currentServerName,
        micError,
        speakingUsers,
        isConnected,
        reconnectVoiceChannel, // ✅ eklendi

        // ✅ EKLENDİ: Kamera
        myCameraStream,
        startCamera,
        stopCamera
    } = useContext(VoiceContext);

    const {
        isMicMuted, toggleMic,
        isDeafened, toggleDeafen,
        isNoiseSuppression, toggleNoiseSuppression
    } = useContext(AudioSettingsContext);

    const { user } = useContext(AuthContext);

    // 👇 2. MODAL GÖRÜNÜRLÜĞÜ İÇİN STATE
    const [showScreenPicker, setShowScreenPicker] = useState(false);

    if (!currentVoiceChannelId) return null;

    const safeUser = user || { username: 'Yükleniyor...', id: 'loading', avatarUrl: null };

    // ✅ Gürültü engelleme tıklandığında anında uygula (odadan çık-gir yok)
    const handleNoiseSuppressionToggle = () => {
        toggleNoiseSuppression();

        // State güncellenip (isNoiseSuppression) yeni değere geçsin diye minik gecikme
        setTimeout(() => {
            reconnectVoiceChannel?.();
        }, 150);
    };

    // 👇 3. BUTONA BASILINCA ÇALIŞAN FONKSİYON
    const handleScreenShareToggle = () => {
        // Eğer zaten paylaşım yapıyorsam durdur
        if (myScreenStream) {
            stopScreenShare();
            return;
        }

        // Eğer Electron uygulamasındaysak Modalı aç
        if (window.electronAPI) {
            setShowScreenPicker(true);
        } else {
            // Web tarayıcısındaysak direkt başlat (Tarayıcı kendi seçtirir)
            startScreenShare();
        }
    };

    // 👇 4. MODALDAN SEÇİM YAPILINCA ÇALIŞAN FONKSİYON
    const handleSourceSelect = (sourceId) => {
        setShowScreenPicker(false); // Modalı kapat
        startScreenShare(sourceId); // Seçilen ID ile başlat
    };

    // ✅ EKLENDİ: Kamera aç/kapat
    const handleCameraToggle = () => {
        if (myCameraStream) {
            stopCamera?.();
            return;
        }
        startCamera?.();
    };

    const isVoiceConnected = isConnected;
    const connectionText = isVoiceConnected ? 'Ses Bağlı' : 'Bağlanıyor...';
    const connectionClass = isVoiceConnected ? 'connected' : 'connecting';
    const amISpeaking = speakingUsers && safeUser.id && speakingUsers[safeUser.id];

    return (
        <div className="voice-room-controls">
            {micError && (
                <div className="voice-error-banner">❗ {micError}</div>
            )}

            {/* 🛑 VİDEO BURADAN KALDIRILDI - Sadece Bilgi Alanı */}
            <div className="voice-room-info">
                <div className={`voice-connection-status ${connectionClass}`}>
                    <SignalIcon className="voice-icon-signal" />
                    <span className="voice-status-text">{connectionText}</span>
                </div>
                <div className="voice-room-details">
                    <span className="server-name">{currentServerName || 'Sunucu'}</span>
                    <span className="channel-seperator">/</span>
                    <span className="channel-name">{currentVoiceChannelName || 'Kanal'}</span>
                </div>
            </div>

            {/* Butonlar */}
            <div className="voice-controls-actions">
                <button onClick={toggleMic} className={`voice-control-btn ${isMicMuted ? 'active-red' : ''}`}>
                    <MicrophoneIcon className="voice-icon" />
                    {isMicMuted && <div className="strike-line" />}
                </button>

                <button onClick={toggleDeafen} className={`voice-control-btn ${isDeafened ? 'active-red' : ''}`}>
                    <SpeakerWaveIcon className="voice-icon" />
                    {isDeafened && <div className="strike-line" />}
                </button>

                <button
                    onClick={handleNoiseSuppressionToggle}
                    className={`voice-control-btn ${isNoiseSuppression ? 'active-green' : ''}`}
                    title={isNoiseSuppression ? "Gürültü Engelleme: AÇIK" : "Gürültü Engelleme: KAPALI"}
                >
                    <SparklesIcon className="voice-icon" />
                    {!isNoiseSuppression && <div className="strike-line" />}
                </button>

                {/* EKRAN PAYLAŞIMI BUTONU */}
                <button
                    onClick={handleScreenShareToggle}
                    className={`voice-control-btn ${myScreenStream ? 'active-green' : ''}`}
                    title={myScreenStream ? "Ekran Paylaşımı: AÇIK" : "Ekran Paylaşımı: KAPALI"}
                >
                    <ComputerDesktopIcon className="voice-icon" />
                </button>

                {/* ✅ EKLENDİ: KAMERA BUTONU */}
                <button
                    onClick={handleCameraToggle}
                    className={`voice-control-btn ${myCameraStream ? 'active-green' : ''}`}
                    title={myCameraStream ? "Kamera: AÇIK" : "Kamera: KAPALI"}
                >
                    <VideoCameraIcon className="voice-icon" />
                </button>

                <button onClick={leaveVoiceChannel} className="voice-control-btn terminate">
                    <PhoneXMarkIcon className="voice-icon" />
                </button>
            </div>

            {/* Kullanıcı Kartı */}
            <div className="voice-user-section">
                <div className={`voice-avatar-wrapper ${amISpeaking ? 'speaking' : ''}`}>
                    <img
                        src={getImageUrl(safeUser.avatarUrl || safeUser.avatar)}
                        alt="Me"
                        className="voice-user-img"
                        onError={(e) => {
                            if (e.target.dataset.fallbackApplied) return;
                            e.target.dataset.fallbackApplied = 'true';
                            e.target.src = DEFAULT_AVATAR_URL;
                        }}
                    />
                </div>
            </div>
            <div className="user-details">
                <span className="username">{user.username}</span>


                {/* 👇 YENİ BİLEŞEN BURAYA */}
                <UserXPDisplay />

            </div>

            {/* 👇 5. MODAL BURAYA EKLENDİ */}
            {showScreenPicker && (
                <ScreenSharePickerModal
                    onClose={() => setShowScreenPicker(false)}
                    onSelect={handleSourceSelect}
                />
            )}

        </div>
    );
};

export default VoiceRoom;
