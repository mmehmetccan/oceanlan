// src/pages/UserProfilePage.jsx
import React, { useState, useContext, useMemo, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import { EnvelopeIcon } from '@heroicons/react/24/outline';
// 👇 URL Helper Importu (Resim sorununu çözen kısım)
import { getImageUrl } from '../utils/urlHelper';

import '../styles/ProfileSettings.css';

// Varsayılan avatarı helper ile al
const handleAvatarError = (e) => {
    if (e?.target?.dataset?.fallbackApplied === 'true') return;
    if (e?.target) {
        e.target.dataset.fallbackApplied = 'true';
        e.target.src = getImageUrl(null); // Helper'dan varsayılanı al
    }
};

const UserProfilePage = () => {
    const { user, dispatch, logout } = useContext(AuthContext);
    const { addToast } = useContext(ToastContext);
    const navigate = useNavigate();

    // Local state'ler
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [avatarFile, setAvatarFile] = useState(null);

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDanger: false });

    // 1. Sayfa açıldığında veritabanından güncel veriyi çek
    useEffect(() => {
        const fetchLatestUserData = async () => {
            try {
                const res = await axiosInstance.get('/users/me');
                if (res.data.data) {
                    dispatch({
                        type: 'LOGIN_SUCCESS',
                        payload: {
                            token: localStorage.getItem('token'),
                            user: res.data.data
                        }
                    });
                    setUsername(res.data.data.username);
                    setEmail(res.data.data.email);
                }
            } catch (error) {
                console.error("Profil güncellenirken hata:", error);
            }
        };

        if (user) {
            setUsername(user.username);
            setEmail(user.email);
            fetchLatestUserData();
        }
    }, []);

    // Avatar URL Hesaplaması (DÜZELTİLDİ)
    const displayAvatarUrl = useMemo(() => {
        // getImageUrl helper'ı hem Electron hem Web için doğru adresi verir
        return getImageUrl(user?.avatarUrl || user?.avatar);
    }, [user]);

    // 2. Çıkış Yapma (Onaylı)
    const handleLogoutClick = () => {
        setConfirmModal({
            isOpen: true,
            title: 'Çıkış Yap',
            message: 'Hesabından çıkış yapmak istediğine emin misin?',
            isDanger: true,
            confirmText: 'Çıkış Yap',
            onConfirm: () => {
                logout();
                navigate('/login');
                addToast('Başarıyla çıkış yapıldı.', 'success');
            }
        });
    };

    const performLogout = () => {
        logout();
        navigate('/login');
    };

    if (!user) {
        return <div className="profile-settings-area">Yükleniyor...</div>;
    }

    const handleUpdateSettings = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const updateData = {};
            if (username !== user.username) updateData.username = username;
            if (email !== user.email) updateData.email = email;

            if (newPassword || currentPassword) {
                updateData.currentPassword = currentPassword;
                updateData.newPassword = newPassword;
            }

            if (Object.keys(updateData).length === 0) {
                addToast('Değiştirilecek ayar yok.', 'info');
                setLoading(false);
                return;
            }

            const res = await axiosInstance.put('/users/me', updateData);

            if (newPassword) {
                addToast('Şifreniz güncellendi. Lütfen tekrar giriş yapın.', 'success');
                performLogout();
                return;
            }

            dispatch({
                type: 'LOGIN_SUCCESS',
                payload: { token: localStorage.getItem('token'), user: res.data.user },
            });

            addToast(res.data.message, 'success');
            setCurrentPassword('');
            setNewPassword('');
        } catch (err) {
            addToast(err.response?.data?.message || 'Güncelleme başarısız.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarUpload = async () => {
        if (!avatarFile) return;

        setLoading(true);
        const formData = new FormData();
        formData.append('avatar', avatarFile);

        try {
            const res = await axiosInstance.put(`/users/me/avatar`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const backendUser = res.data.user;
            const currentToken = localStorage.getItem('token');

            // Cache busting için versiyon ekle
            const updatedUserForContext = {
                ...backendUser,
                avatarUrl: `${backendUser.avatarUrl}?v=${Date.now()}`,
            };

            dispatch({
                type: 'LOGIN_SUCCESS',
                payload: {
                    token: currentToken,
                    user: updatedUserForContext
                }
            });

            addToast(res.data.message || 'Fotoğraf başarıyla yüklendi!', 'success');
            setAvatarFile(null);

        } catch (error) {
            addToast(error.response?.data?.message || 'Fotoğraf yükleme başarısız.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="profile-settings-area">
            <div className="profile-settings-header">
                <div className="profile-settings-title">
                    <h1>Profil Ayarları</h1>
                    <p>Kullanıcı bilgilerini, parolanı ve profil görselini buradan düzenle.</p>
                </div>
                <div className="profile-header-avatar">
                    {/* Hata Yakalayıcı Eklendi */}
                    <img src={displayAvatarUrl} alt={`${user.username} avatarı`} onError={handleAvatarError}/>
                    <div>
                        <strong>{user.username}</strong>
                        <span>{user.email}</span>
                    </div>
                </div>
            </div>

            <div className="profile-settings-grid">
                <div className="settings-card profile-card">
                    <h3>Profil Kartı</h3>
                    <div className="profile-avatar-display">
                        <img
                            src={displayAvatarUrl}
                            alt={`${user.username} avatarı`}
                            onError={handleAvatarError} // Hata yakalayıcı eklendi
                        />
                    </div>

                    <h4>{user.username}</h4>
                    <p className="hint">{user.email}</p>

                    <div className="avatar-upload-section">
                        <label className="file-input-label">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => setAvatarFile(e.target.files[0])}
                            />
                            Yeni fotoğraf seç ({avatarFile ? avatarFile.name : 'Seçilmedi'})
                        </label>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={handleAvatarUpload}
                            disabled={!avatarFile || loading}
                        >
                            {loading ? 'Yükleniyor...' : 'Fotoğrafı Yükle'}
                        </button>
                    </div>
                </div>

                <form onSubmit={handleUpdateSettings} className="settings-card profile-form">
                    <h3>Hesap Bilgilerini Güncelle</h3>

                    <div className="profile-form-group">
                        <label>Kullanıcı Adı</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>

                    <div className="profile-form-group">
                        <label>E-posta</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="profile-form-group">
                        <label>Mevcut Şifre</label>
                        <input
                            type="password"
                            placeholder="Güvenlik için gereklidir"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                        />
                    </div>

                    <div className="profile-form-group">
                        <label>Yeni Şifre</label>
                        <input
                            type="password"
                            placeholder="Opsiyonel"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn-accent"
                        disabled={loading || !username || !email}
                    >
                        {loading ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
                    </button>
                </form>
            </div>

            <div className="settings-card logout-card">
                <div>
                    <h4>Hesaptan Ayrıl</h4>
                    <p>Başka bir kullanıcıyla oturum açmak için mevcut oturumunu sonlandır.</p>
                </div>

                <button className="logout-button" onClick={handleLogoutClick}>
                    Çıkış Yap
                </button>
            </div>

            <div className="settings-card" style={{border: '1px solid #5865f2', marginTop: '20px'}}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px'
                }}>
                    <div>
                        <h4 style={{margin: 0, color: '#fff'}}>İletişim & Destek</h4>
                        <p style={{margin: '5px 0 0', fontSize: '13px', color: '#b9bbbe'}}>
                            Bir sorun mu yaşıyorsunuz veya öneriniz mi var? Bizimle iletişime geçin.
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/dashboard/contact')}
                        style={{
                            background: '#5865f2', color: 'white', border: 'none',
                            padding: '10px 16px', borderRadius: '8px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600'
                        }}
                    >
                        <EnvelopeIcon style={{width: 20}}/>
                        Bize Ulaşın
                    </button>
                </div>
            </div>

            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(p => ({...p, isOpen: false}))}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                isDanger={confirmModal.isDanger}
                confirmText={confirmModal.confirmText}
            />
        </div>
    );
};

export default UserProfilePage;