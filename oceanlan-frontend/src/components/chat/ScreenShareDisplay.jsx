import React, { useContext, useEffect, useRef, useState } from 'react';
import { VoiceContext } from '../../context/VoiceContext';
import { XMarkIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline';
import '../../styles/ScreenShareDisplay.css';

const VideoPlayer = ({ stream, isLocal, username, onStop }) => {
    const videoRef = useRef(null);
    const wrapperRef = useRef(null);
    const [isHovered, setIsHovered] = useState(false);
    const [viewMode, setViewMode] = useState('contain');
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

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
                muted={true} // Sesler kanaldan gelir, video sessiz
                style={{ objectFit: viewMode }}
                className="main-video"
            />

            <div className="video-overlay-name">
                {isLocal ? 'Senin Ekranın' : `${username || 'Kullanıcı'} Ekranı`}
            </div>

            <div className={`video-controls ${isHovered || isFullscreen ? 'visible' : ''}`}>
                <div className="controls-left">
                    <button onClick={() => setViewMode(p => p === 'contain' ? 'cover' : 'contain')} className="control-btn text-btn">
                        {viewMode === 'contain' ? 'Doldur' : 'Sığdır'}
                    </button>
                </div>

                <div className="controls-right">
                    {isLocal && onStop && (
                        <button onClick={onStop} className="control-btn stop-btn" title="Yayını Durdur">
                            <XMarkIcon style={{ width: 24, height: 24 }} />
                        </button>
                    )}
                    <button onClick={toggleFullscreen} className="control-btn" title="Tam Ekran">
                        {isFullscreen ? <ArrowsPointingInIcon style={{width:20}}/> : <ArrowsPointingOutIcon style={{width:20}}/>}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ScreenShareDisplay = () => {
    const {
        myScreenStream, // Benim yerel yayınım (Kırmızı Alan)
        peersWithVideo, // Başkalarının yayını (Sarı Alan / Yansıma)
        stopScreenShare
    } = useContext(VoiceContext);

    // 🟢 MANTIK: Eğer ben yayın yapıyorsam, SADECE kendi yayınımı göster.
    // Başkalarının yayınını (veya bana dönen yansımayı) tamamen yoksay.
    if (myScreenStream) {
        return (
            <div className="screen-share-grid-container" style={{ gridTemplateColumns: '1fr' }}>
                <VideoPlayer
                    stream={myScreenStream}
                    isLocal={true}
                    onStop={stopScreenShare}
                />
            </div>
        );
    }

    // 🟢 MANTIK: Eğer ben yayın yapmıyorsam, başkalarının yayınını göster.
    const videos = peersWithVideo || {};
    const remoteStreamKeys = Object.keys(videos);

    if (remoteStreamKeys.length === 0) {
        return null;
    }

    return (
        <div className="screen-share-grid-container" style={{ gridTemplateColumns: `repeat(${remoteStreamKeys.length > 1 ? 2 : 1}, 1fr)` }}>
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