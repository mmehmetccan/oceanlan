// src/components/modals/JoinServerModal.jsx
import React, { useState, useContext } from 'react';
import axios from 'axios';
import { ServerContext } from '../../context/ServerContext';
import { ToastContext } from '../../context/ToastContext';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_URL = `${API_BASE}/api/v1/invites`;

const JoinServerModal = ({ onClose }) => {
    const [inviteCode, setInviteCode] = useState('');
    const [loading, setLoading] = useState(false);

    const { fetchServerDetails, fetchUserServers } = useContext(ServerContext);
    const { addToast } = useContext(ToastContext);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!inviteCode.trim()) {
            addToast('Lütfen geçerli bir davet kodu girin.', 'warning');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(
                `${API_URL}/${inviteCode}`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const newServerId = res.data.data.memberInfo.server;

            // 1. Yeni sunucunun detaylarını çek
            await fetchServerDetails(newServerId);

            // 2. Sol menüdeki sunucu listesini yenile
            if (fetchUserServers) {
                await fetchUserServers();
            }

            navigate(`/dashboard/server/${newServerId}`);
            addToast(res.data.message || 'Sunucuya başarıyla katıldınız!', 'success');
            onClose();

        } catch (err) {
            const errorMsg = err.response?.data?.message || 'Sunucuya katılım başarısız oldu.';
            const serverId = err.response?.data?.serverId;

            if (serverId && errorMsg.toLowerCase().includes('zaten üye')) {
                addToast('Zaten bu sunucunun üyesisiniz.', 'info');
                navigate(`/dashboard/server/${serverId}`);
                onClose();
            } else {
                addToast(errorMsg, 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            {/* 🟢 CSS BURAYA GÖMÜLDÜ - EKSTRA DOSYA GEREKMEZ */}
            <style>{`
                .modal-backdrop {
                    position: fixed;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background-color: rgba(0, 0, 0, 0.75);
                    display: flex; justify-content: center; align-items: center;
                    z-index: 1000; backdrop-filter: blur(4px);
                    animation: fadeIn 0.2s ease-out;
                }
                .modal-content {
                    background-color: #36393f;
                    padding: 32px; border-radius: 12px;
                    width: 100%; max-width: 440px;
                    position: relative; text-align: center;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                    color: white; animation: scaleUp 0.2s ease-out;
                }
                .modal-content h3 {
                    margin-top: 0; margin-bottom: 24px; font-size: 22px;
                }
                .modal-input {
                    width: 100%; padding: 14px;
                    background-color: #202225;
                    border: 1px solid transparent;
                    border-radius: 8px; color: #dcddde;
                    font-size: 16px; outline: none;
                    box-sizing: border-box; margin-bottom: 16px;
                    transition: border-color 0.2s;
                }
                .modal-input:focus {
                    border-color: #1ab199; /* PROJE RENGİ */
                }
                .modal-submit-btn {
                    width: 100%; padding: 14px;
                    background-color: #1ab199; /* PROJE RENGİ */
                    color: white; border: none;
                    border-radius: 8px; font-size: 16px;
                    font-weight: 600; cursor: pointer;
                    transition: background-color 0.2s;
                }
                .modal-submit-btn:hover {
                    background-color: #148f7a; /* Hover Rengi */
                }
                .modal-submit-btn:disabled {
                    opacity: 0.6; cursor: not-allowed;
                }
                .close-button {
                    position: absolute; top: 16px; right: 16px;
                    background: transparent; border: none;
                    color: #b9bbbe; font-size: 18px;
                    cursor: pointer;
                }
                .close-button:hover { color: #ed4245; }
                
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scaleUp { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            `}</style>

            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3>Davet Kodu ile Sunucuya Katıl</h3>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        className="modal-input"
                        placeholder="Davet Kodunu Girin (örn: 5d1f8a)"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value)}
                        disabled={loading}
                    />
                    <button type="submit" className="modal-submit-btn" disabled={loading}>
                        {loading ? 'Katılıyor...' : 'Katıl'}
                    </button>
                </form>
                <button className="close-button" onClick={onClose}>X</button>
            </div>
        </div>
    );
};

export default JoinServerModal;