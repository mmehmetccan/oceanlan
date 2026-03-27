import React, { useContext, useState, useRef, useLayoutEffect } from 'react';
import axios from 'axios';
import { ServerContext } from '../../context/ServerContext';
import { AuthContext } from '../../context/AuthContext';
import { AudioSettingsContext } from '../../context/AudioSettingsContext'; // ÖNEMLİ
import { checkUserPermission } from '../../utils/permissionChecker';
import { useSocket } from '../../hooks/useSocket';
import { getImageUrl } from '../../utils/urlHelper';
import UserProfileModal from '../profile/UserProfileModal';

import "../../styles/MemberContextMenu.css";

const API_URL_BASE = import.meta.env.VITE_API_URL || 'https://oceanlan.com';

const MemberContextMenu = ({ member, x, y, serverId, onClose }) => {
    const { activeServer, fetchServerDetails } = useContext(ServerContext);
    const { user: currentUser } = useContext(AuthContext);
    const { socket } = useSocket();
    const { userVolumes, setUserVolume } = useContext(AudioSettingsContext);
    
    const [showProfile, setShowProfile] = useState(false);
    const menuRef = useRef(null);
    const [menuStyle, setMenuStyle] = useState({ top: y, left: x, opacity: 0 });

    useLayoutEffect(() => {
        if (menuRef.current) {
            const { offsetWidth: width, offsetHeight: height } = menuRef.current;
            let newTop = y;
            let newLeft = x;
            if (x + width > window.innerWidth) newLeft = x - width;
            if (y + height > window.innerHeight) newTop = y - height;
            setMenuStyle({ top: newTop, left: newLeft, opacity: 1 });
        }
    }, [x, y]);

    if (!member || !member.user) return null;

    const targetUser = member.user;
    const targetUserId = targetUser._id;
    const isSelf = currentUser?.id === targetUserId;

    // --- HATAYI ÇÖZEN FONKSİYON: handleLocalMute ---
    const currentVolume = userVolumes[targetUserId] !== undefined ? userVolumes[targetUserId] : 100;
    const isLocalMuted = currentVolume === 0;

    const handleLocalMute = () => {
        if (isLocalMuted) {
            setUserVolume(targetUserId, 100);
        } else {
            setUserVolume(targetUserId, 0);
        }
    };

    // --- YETKİLER ---
    const isAdmin = checkUserPermission(activeServer, currentUser.id, 'ADMINISTRATOR');
    const canKick = isAdmin || checkUserPermission(activeServer, currentUser.id, 'KICK_MEMBERS');
    const canBan = isAdmin || checkUserPermission(activeServer, currentUser.id, 'BAN_MEMBERS');
    const canDeafen = isAdmin || checkUserPermission(activeServer, currentUser.id, 'DEAFEN_MEMBERS');

    const MEMBER_API_URL = `${API_URL_BASE}/api/v1/servers/${serverId}/members/${member._id}`;

    const handleKick = async () => {
        if (!window.confirm(`${targetUser.username} atılsın mı?`)) return;
        try {
            await axios.delete(MEMBER_API_URL);
            fetchServerDetails(serverId);
            onClose();
        } catch (e) { console.error(e); }
    };

    const handleBan = async () => {
        const reason = prompt('Yasaklama nedeni:');
        if (reason === null) return;
        try {
            await axios.post(`${MEMBER_API_URL}/ban`, { reason });
            socket.emit('memberBanned', { serverId, memberId: member._id });
            fetchServerDetails(serverId);
            onClose();
        } catch (e) { console.error(e); }
    };

    const handleServerDeafen = async () => {
        try {
            const payload = { isDeafened: !member.isDeafened };
            await axios.put(`${MEMBER_API_URL}/status`, payload);
            socket.emit('memberUpdated', { serverId, memberId: member._id, ...payload });
            fetchServerDetails(serverId);
            onClose();
        } catch (e) { console.error(e); }
    };

    return (
        <>
            <div className="member-menu-overlay" onClick={onClose}>
                <div 
                    ref={menuRef} 
                    className="member-menu-panel" 
                    style={{ ...menuStyle }} 
                    onClick={e => e.stopPropagation()}
                >
                    <div className="member-menu-header">
                        <img 
                            src={getImageUrl(targetUser.avatarUrl || targetUser.avatar)} 
                            alt="" 
                            onError={(e) => { e.target.src = getImageUrl(null); }} // 404 HATASI İÇİN ÖNLEM
                        />
                        <div className="menu-user-info">
                            <div className="menu-username">{targetUser.username}</div>
                        </div>
                    </div>

                    <div className="member-menu-actions">
                        <button className="member-menu-btn" onClick={() => setShowProfile(true)}>Profil</button>
                        
                        {!isSelf && (
                            <>
                                <hr className="menu-divider" />
                                <div className="volume-control">
                                    <label>Ses %{currentVolume}</label>
                                    <input 
                                        type="range" min="0" max="200" 
                                        value={currentVolume} 
                                        onChange={(e) => setUserVolume(targetUserId, parseInt(e.target.value))}
                                    />
                                </div>
                                <button className="member-menu-btn" onClick={handleLocalMute}>
                                    {isLocalMuted ? 'Sesi Aç (Yerel)' : 'Sustur (Yerel)'}
                                </button>
                            </>
                        )}

                        {canDeafen && (
                            <button className="member-menu-btn" onClick={handleServerDeafen}>
                                {member.isDeafened ? 'Sağırlaştırmayı Kaldır' : 'Sağırlaştır (Sunucu)'}
                            </button>
                        )}

                        {(canKick || canBan) && <hr className="menu-divider" />}
                        {canKick && <button className="member-menu-btn danger" onClick={handleKick}>At</button>}
                        {canBan && <button className="member-menu-btn danger" onClick={handleBan}>Yasakla</button>}
                    </div>
                </div>
            </div>
            {showProfile && (
                <UserProfileModal 
                    userId={targetUserId} 
                    onClose={() => { setShowProfile(false); onClose(); }} 
                />
            )}
        </>
    );
};

export default MemberContextMenu;