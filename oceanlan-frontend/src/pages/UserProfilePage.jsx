// src/pages/UserProfilePage.jsx
import React, { useState, useContext, useMemo, useEffect } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom'; // YENİ: Yönlendirme için
import '../styles/ProfileSettings.css';
import axiosInstance from '../utils/axiosInstance'; // Axios instance kullanalım

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';const DEFAULT_AVATAR = '/default-avatar.png';

const UserProfilePage = () => {
    const { user, dispatch, logout } = useContext(AuthContext);
    const navigate = useNavigate(); // YENİ: Navigate hook'u

    // Local state'ler
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [avatarFile, setAvatarFile] = useState(null);

    // 1. DÜZELTME: Sayfa açıldığında veritabanından güncel veriyi çek
    useEffect(() => {
        const fetchLatestUserData = async () => {
            try {
                // Token ile 'me' endpointine istek at
                const res = await axiosInstance.get('/users/me');

                // Context'i güncelle (Veritabanındaki en güncel avatar için)
                if (res.data.data) {
                    dispatch({
                        type: 'LOGIN_SUCCESS',
                        payload: {
                            token: localStorage.getItem('token'),
                            user: res.data.data
                        }
                    });
                    // Form alanlarını da güncelle
                    setUsername(res.data.data.username);
                    setEmail(res.data.data.email);
                }
            } catch (error) {
                console.error("Profil güncellenirken hata:", error);
            }
        };

        if (user) {
            // İlk açılışta verileri state'e doldur
            setUsername(user.username);
            setEmail(user.email);
            // Sonra veritabanından teyit et
            fetchLatestUserData();
        }
    }, []); // Sadece sayfa ilk açıldığında çalışır

    // Avatar URL Hesaplaması
    const rawAvatarUrl = useMemo(
        () => user?.avatarUrl || user?.avatar || DEFAULT_AVATAR,
        [user]
    );

    const displayAvatarUrl = useMemo(() => {
        if (rawAvatarUrl && rawAvatarUrl.startsWith('/uploads')) {
            return `${API_URL_BASE}${rawAvatarUrl}`;
        }
        return rawAvatarUrl || DEFAULT_AVATAR;
    }, [rawAvatarUrl]);


    // 2. DÜZELTME: Çıkış yapma fonksiyonu
    const handleLogout = () => {
        logout(); // Context'i temizle
        navigate('/login'); // Sayfayı zorla giriş ekranına at
    };

    // User yoksa yükleniyor göster (Ama logout anında navigate çalışacağı için takılmayacak)
    if (!user) {
        return <div className="profile-settings-area">Yükleniyor...</div>;
    }

    const handleUpdateSettings = async (e) => {
        e.preventDefault();
        setMessage('');
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
                setMessage({ text: 'Değiştirilecek ayar yok.', type: 'info' });
                setLoading(false);
                return;
            }

            const res = await axiosInstance.put('/users/me', updateData);

            if (newPassword) {
                alert('Şifreniz güncellendi. Lütfen tekrar giriş yapın.');
                handleLogout(); // Yeni şifre sonrası çıkış
                return;
            }

            dispatch({
                type: 'LOGIN_SUCCESS',
                payload: { token: localStorage.getItem('token'), user: res.data.user },
            });

            setMessage({ text: res.data.message, type: 'success' });
            setCurrentPassword('');
            setNewPassword('');
        } catch (err) {
            setMessage({
                text: err.response?.data?.message || 'Güncelleme başarısız.',
                type: 'error',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarUpload = async () => {
        if (!avatarFile) return;

        setLoading(true);
        setMessage('');

        const formData = new FormData();
        formData.append('avatar', avatarFile);

        try {
            const res = await axiosInstance.put(`/users/me/avatar`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const backendUser = res.data.user;
            const currentToken = localStorage.getItem('token');
            const cacheBustingAvatarUrl = `${backendUser.avatarUrl}?v=${Date.now()}`;

            const updatedUserForContext = {
                ...backendUser,
                avatarUrl: cacheBustingAvatarUrl,
            };

            dispatch({
                type: 'LOGIN_SUCCESS',
                payload: {
                    token: currentToken,
                    user: updatedUserForContext
                }
            });

            setMessage({
                text: res.data.message || 'Fotoğraf başarıyla yüklendi!',
                type: 'success'
            });
            setAvatarFile(null);

        } catch (error) {
            setMessage({
                text: error.response?.data?.message || 'Fotoğraf yükleme başarısız.',
                type: 'error',
            });
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
                    <img src={displayAvatarUrl} alt={`${user.username} avatarı`} />
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
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = DEFAULT_AVATAR;
                            }}
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

                    {message && (
                        <p className={`profile-message ${message.type}`}>{message.text}</p>
                    )}

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
                {/* DÜZELTME: logout yerine handleLogout kullan */}
                <button className="logout-button" onClick={handleLogout}>
                    Çıkış Yap
                </button>
            </div>
        </div>
    );
};

export default UserProfilePage;