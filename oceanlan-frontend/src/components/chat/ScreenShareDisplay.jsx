// src/components/chat/ScreenShareDisplay.jsx
import React, { useContext, useEffect, useRef, useState } from 'react';
import { VoiceContext } from '../../context/VoiceContext';
import { XMarkIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, SpeakerXMarkIcon, SpeakerWaveIcon } from '@heroicons/react/24/outline'; // İkonlar
import '../../styles/ScreenShareDisplay.css';

// Video Oynatıcı Bileşeni
const VideoPlayer = ({ stream, isLocal, username, onStop }) => {
    const videoRef = useRef(null);
    const wrapperRef = useRef(null);

    const [isMuted, setIsMuted] = useState(isLocal);
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
                style={{ objectFit: viewMode }}
                className="main-video"
            />

            <div className="video-overlay-name">
                {isLocal ? 'Senin Ekranın' : `${username || 'Kullanıcı'} Ekranı`}
            </div>

            {/* Kontrol Barı */}
            <div className={`video-controls ${isHovered || isFullscreen ? 'visible' : ''}`}>
                <div className="controls-left">
                    <button onClick={() => setIsMuted(!isMuted)} className="control-btn">
                        {isMuted ? <SpeakerXMarkIcon style={{width:20}}/> : <SpeakerWaveIcon style={{width:20}}/>}
                    </button>
                    <input
                        type="range"
                        min="0" max="100"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => { setVolume(Number(e.target.value)); if(Number(e.target.value)>0) setIsMuted(false); }}
                        className="volume-slider-mini"
                    />
                </div>

                <div className="controls-right">
                    <button onClick={() => setViewMode(p => p === 'contain' ? 'cover' : 'contain')} className="control-btn text-btn">
                        {viewMode === 'contain' ? 'Doldur' : 'Sığdır'}
                    </button>

                    {/* 🔴 YAYINI DURDUR BUTONU (Sadece Kendi Yayınımızsa Görünür) */}
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
    const { myScreenStream, incomingStreams, stopScreenShareFn } = useContext(VoiceContext);

    if (!myScreenStream && Object.keys(incomingStreams).length === 0) {
        return null;
    }

    const streamCount = (myScreenStream ? 1 : 0) + Object.keys(incomingStreams).length;

    return (
        <div className="screen-share-grid-container" style={{ gridTemplateColumns: `repeat(${streamCount > 1 ? 2 : 1}, 1fr)` }}>
            {/* Kendi Ekranın */}
            {myScreenStream && (
                <VideoPlayer
                    stream={myScreenStream}
                    isLocal={true}
                    onStop={() => { if(stopScreenShareFn) stopScreenShareFn(); }}
                />
            )}

            {/* Diğer Ekranlar */}
            {Object.entries(incomingStreams).map(([socketId, stream]) => (
                <VideoPlayer
                    key={socketId}
                    stream={stream}
                    isLocal={false}
                    username={`Kullanıcı (${socketId.substr(0,4)})`}
                />
            ))}
        </div>
    );
};

export default ScreenShareDisplay;