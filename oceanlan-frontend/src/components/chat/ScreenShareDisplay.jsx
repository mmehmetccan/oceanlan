// src/components/chat/ScreenShareDisplay.jsx
import React, { useContext, useEffect, useRef, useState } from 'react';
import { VoiceContext } from '../../context/VoiceContext';
import { XMarkIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, SpeakerXMarkIcon, SpeakerWaveIcon } from '@heroicons/react/24/outline';
import '../../styles/ScreenShareDisplay.css';

// Video Oynatıcı Bileşeni
const VideoPlayer = ({ stream, isLocal, username, onStop }) => {
    const videoRef = useRef(null);
    const wrapperRef = useRef(null);

    const [isMuted, setIsMuted] = useState(true); // Videolar varsayılan sessiz başlasın (Ses zaten audio'dan geliyor)
    const [volume, setVolume] = useState(100);
    const [isHovered, setIsHovered] = useState(false);
    const [viewMode, setViewMode] = useState('contain');
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
            videoRef.current.volume = volume / 100;
        }
    }, [isMuted, volume]);

    useEffect(() => {
        const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFsChange);
        return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }, []);

    const toggleFullscreen = () => {
        if (!wrapperRef.current) return;
        if (!document.fullscreenElement) {
            wrapperRef.current.requestFullscreen().catch(err => console.error(err));
        } else {
            document.exitFullscreen();
        }
    };

    return (
        <div
            className={`video-player-wrapper ${isFullscreen ? 'fullscreen' : ''}`}
            ref={wrapperRef}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={true} // Yankıyı önlemek için video elementi sessiz olmalı
                style={{ objectFit: viewMode }}
                className="main-video"
            />

            <div className="video-overlay-name">
                {isLocal ? 'Senin Ekranın' : `${username || 'Kullanıcı'} Ekranı`}
            </div>

            {/* Kontrol Barı */}
            <div className={`video-controls ${isHovered || isFullscreen ? 'visible' : ''}`}>
                <div className="controls-left">
                    {/* Ses kontrollerini burada opsiyonel yapabiliriz çünkü ses kanaldan geliyor */}
                    <button onClick={() => setViewMode(p => p === 'contain' ? 'cover' : 'contain')} className="control-btn text-btn">
                        {viewMode === 'contain' ? 'Doldur' : 'Sığdır'}
                    </button>
                </div>

                <div className="controls-right">
                    {isLocal && (
                        <button
                            onClick={onStop}
                            className="control-btn stop-btn"
                            title="Yayını Durdur"
                            style={{ color: '#ed4245', marginRight: '5px' }}
                        >
                            <XMarkIcon style={{ width: 24, height: 24, strokeWidth: 2.5 }} />
                        </button>
                    )}

                    <button onClick={toggleFullscreen} className="control-btn">
                        {isFullscreen ? <ArrowsPointingInIcon style={{width:20}}/> : <ArrowsPointingOutIcon style={{width:20}}/>}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ScreenShareDisplay = () => {
    // 1. Context'ten verileri çekiyoruz
    const {
        myScreenStream,
        peersWithVideo, // 👈 ARTIK incomingStreams YERİNE BUNU KULLANIYORUZ
        stopScreenShare
    } = useContext(VoiceContext);

    // 2. GÜVENLİK KONTROLÜ (Crash olmaması için varsayılan değer atıyoruz)
    const videos = peersWithVideo || {};

    // Eğer ne benim yayınım ne de başkasının yayını varsa hiç gösterme
    if (!myScreenStream && Object.keys(videos).length === 0) {
        return null;
    }

    const streamCount = (myScreenStream ? 1 : 0) + Object.keys(videos).length;

    return (
        <div className="screen-share-grid-container" style={{ gridTemplateColumns: `repeat(${streamCount > 1 ? 2 : 1}, 1fr)` }}>
            {/* Kendi Ekranın */}
            {myScreenStream && (
                <VideoPlayer
                    stream={myScreenStream}
                    isLocal={true}
                    onStop={stopScreenShare}
                />
            )}

            {/* Diğer Ekranlar (peersWithVideo kullanıyoruz) */}
            {Object.entries(videos).map(([socketId, stream]) => (
                <VideoPlayer
                    key={socketId}
                    stream={stream}
                    isLocal={false}
                    username={`Kullanıcı (${socketId.substring(0,4)})`}
                />
            ))}
        </div>
    );
};

export default ScreenShareDisplay;