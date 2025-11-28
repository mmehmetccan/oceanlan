// src/components/chat/ScreenShareDisplay.jsx
import React, { useContext, useEffect, useRef, useState } from 'react';
import { VoiceContext } from '../../context/VoiceContext';
import '../../styles/ScreenShareDisplay.css'; // Birazdan oluşturacağız

// Gelişmiş Tekil Video Oynatıcı
const VideoPlayer = ({ stream, isLocal, username }) => {
    const videoRef = useRef(null);
    const wrapperRef = useRef(null);

    // Kontrol State'leri
    const [isMuted, setIsMuted] = useState(isLocal); // Kendi ekranımızsa varsayılan sessiz
    const [volume, setVolume] = useState(100);
    const [isHovered, setIsHovered] = useState(false);
    const [viewMode, setViewMode] = useState('contain'); // 'contain' (Sığdır) veya 'cover' (Doldur)
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    // Ses ayarını uygula
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
            videoRef.current.volume = volume / 100;
        }
    }, [isMuted, volume]);

    // Tam ekran değişimi dinleyicisi
    useEffect(() => {
        const handleFsChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
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

    const toggleMute = () => setIsMuted(!isMuted);

    const toggleViewMode = () => {
        setViewMode(prev => prev === 'contain' ? 'cover' : 'contain');
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
                style={{ objectFit: viewMode }} // CSS ile görüntü modu
                className="main-video"
            />

            {/* Kullanıcı Adı Etiketi */}
            <div className="video-overlay-name">
                {isLocal ? 'Senin Ekranın' : `${username || 'Kullanıcı'} Ekranı`}
            </div>

            {/* Kontrol Barı (Sadece Hover veya Mute durumunda görünür) */}
            <div className={`video-controls ${isHovered ? 'visible' : ''}`}>

                <div className="controls-left">
                    {/* Ses Butonu */}
                    <button onClick={toggleMute} className="control-btn">
                        {isMuted || volume === 0 ? '🔇' : '🔊'}
                    </button>

                    {/* Ses Slider'ı */}
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => {
                            setVolume(Number(e.target.value));
                            if(Number(e.target.value) > 0) setIsMuted(false);
                        }}
                        className="volume-slider-mini"
                    />
                </div>

                <div className="controls-right">
                    {/* Görüntü Modu (Sığdır/Doldur) */}
                    <button onClick={toggleViewMode} className="control-btn text-btn" title="Görüntü Modu">
                        {viewMode === 'contain' ? 'Doldur' : 'Sığdır'}
                    </button>

                    {/* Tam Ekran */}
                    <button onClick={toggleFullscreen} className="control-btn">
                        {isFullscreen ? '↙️' : '↗️'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ScreenShareDisplay = () => {
    const { myScreenStream, incomingStreams } = useContext(VoiceContext);

    if (!myScreenStream && Object.keys(incomingStreams).length === 0) {
        return null;
    }

    // Kaç yayın var?
    const streamCount = (myScreenStream ? 1 : 0) + Object.keys(incomingStreams).length;

    return (
        <div className="screen-share-grid-container" style={{
            gridTemplateColumns: `repeat(${streamCount > 1 ? 2 : 1}, 1fr)`
        }}>
            {/* Kendi Ekranın */}
            {myScreenStream && (
                <VideoPlayer stream={myScreenStream} isLocal={true} />
            )}

            {/* Diğer Ekranlar */}
            {Object.entries(incomingStreams).map(([socketId, stream]) => (
                <VideoPlayer
                    key={socketId}
                    stream={stream}
                    isLocal={false}
                    username={`Kullanıcı (${socketId.substr(0,4)})`} // İstersen buraya gerçek kullanıcı adını context'ten çekip verebilirsin
                />
            ))}
        </div>
    );
};

export default ScreenShareDisplay;