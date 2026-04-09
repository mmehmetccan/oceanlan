// src/pages/UserProfilePage.jsx
import React, { useState, useContext, useMemo, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
import ConfirmationModal from '../components/modals/ConfirmationModal';
import { getImageUrl } from '../utils/urlHelper';
import { FaEye, FaEyeSlash } from 'react-icons/fa'; // 🟢 YENİ IMPORT
// İKONLAR
import {
    EnvelopeIcon,
    ShieldCheckIcon,
    DocumentTextIcon,
    CpuChipIcon,
    UserGroupIcon
} from '@heroicons/react/24/outline';

import '../styles/ProfileSettings.css';

const handleAvatarError = (e) => {
    if (e?.target?.dataset?.fallbackApplied === 'true') return;
    if (e?.target) {
        e.target.dataset.fallbackApplied = 'true';
        e.target.src = getImageUrl(null);
    }
};

const UserProfilePage = () => {
    const { user, dispatch, logout } = useContext(AuthContext);
    const { addToast } = useContext(ToastContext);
    const navigate = useNavigate();

    // Local State
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState(''); // 🟢 YENİ
    const [loading, setLoading] = useState(false);
    const [avatarFile, setAvatarFile] = useState(null);

    // Confirmation Modal State
    const [showPass, setShowPass] = useState({ current: false, new: false, confirm: false });
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

    // Avatar URL Hesaplaması
    const displayAvatarUrl = useMemo(() => {
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

    // Profil Ayarlarını Güncelle
    const handleUpdateSettings = async (e) => {
        e.preventDefault();
        if (newPassword && newPassword !== confirmNewPassword) {
            return addToast('Yeni şifreler birbiriyle eşleşmiyor!', 'error');
        }
        setLoading(true);

        try {
            const updateData = {};
            if (username !== user.username) updateData.username = username;
            if (email !== user.email) updateData.email = email;

            if (newPassword) {
                if (!currentPassword) {
                    setLoading(false);
                    return addToast('Şifre değiştirmek için mevcut şifrenizi girmelisiniz.', 'error');
                }
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
                logout();
                navigate('/login');
                return;
            }

            dispatch({
                type: 'LOGIN_SUCCESS',
                payload: { token: localStorage.getItem('token'), user: res.data.user },
            });

            addToast(res.data.message, 'success');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
        } catch (err) {
            addToast(err.response?.data?.message || 'Güncelleme başarısız.', 'error');
        } finally {
            setLoading(false);
        }
    };


    const handleSteamLink = () => {
    // Kullanıcıya bilgi ver
    addToast('Steam hesabına yönlendiriliyorsunuz...', 'info');
    
    const token = localStorage.getItem('token');
    
    if (!token) {
        addToast('Oturum bilgisi bulunamadı. Lütfen tekrar giriş yapın.', 'error');
        return;
    }
    
    // Direkt backend URL'ini kullan - daha basit
    const steamAuthUrl = `/api/v1/users/auth/steam?token=${encodeURIComponent(token)}`;
    
    console.log('Steam yönlendirme URL:', steamAuthUrl);
    window.location.href = steamAuthUrl;
};


    
    // Avatar Yükle
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

            // Cache busting
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


    const toggleButtonStyle = {
    position: 'absolute',
    right: '10px',
    top: '50%', // 🟢 Üstten %50 dikey boşluk
    transform: 'translateY(-30%)', // 🟢 Kendi yüksekliğinin yarısı kadar yukarı çek (Tam merkezler)
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#1ab199',
    fontSize: '18px', // İkon boyutu
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '5px',
    zIndex: 2,
    marginTop: '12px' // ⚠️ EĞER label varsa dikeyde label payını dengelemek için gerekebilir
};

    return (
        <div className="profile-settings-area">
            {/* BAŞLIK */}
            <div className="profile-settings-header">
                <div className="profile-settings-title">
                    <h1>Profil Ayarları</h1>
                    <p>Kullanıcı bilgilerini, parolanı ve profil görselini buradan düzenle.</p>
                </div>
                <div className="profile-header-avatar">
                    <img src={displayAvatarUrl} alt={`${user.username} avatarı`} onError={handleAvatarError}/>
                    <div>
                        <strong>{user.username}</strong>
                        <span>{user.email}</span>
                    </div>
                </div>
            </div>

            {/* İÇERİK IZGARASI */}
            <div className="profile-settings-grid">

                {/* SOL: Profil Kartı */}
                <div className="settings-card profile-card">
                    <h3>Profil Kartı</h3>
                    <div className="profile-avatar-display">
                        <img
                            src={displayAvatarUrl}
                            alt={`${user.username} avatarı`}
                            onError={handleAvatarError}
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

                {/* SAĞ: Form */}
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
    <hr style={{ border: '0', borderTop: '1px solid #444', margin: '20px 0' }} />

    {/* MEVCUT ŞİFRE */}
    <div className="profile-form-group" style={{ position: 'relative' }}>
        <label>Mevcut Şifre</label>
        <input
            type={showPass.current ? 'text' : 'password'}
            placeholder="Güvenlik için gereklidir"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <button
            type="button"
            className="password-toggle-btn"
            onClick={() => setShowPass({ ...showPass, current: !showPass.current })}
            style={toggleButtonStyle}
        >
            {/* 🟢 YENİ İKON YAPISI */}
            {showPass.current ? <FaEyeSlash /> : <FaEye />} 
        </button>
    </div>


    {/* YENİ ŞİFRE */}
    <div className="profile-form-group" style={{ position: 'relative' }}>
        <label>Yeni Şifre</label>
        <input
            type={showPass.new ? 'text' : 'password'}
            placeholder="Değiştirmek istemiyorsanız boş bırakın"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
        />
        <button
            type="button"
            className="password-toggle-btn"
            onClick={() => setShowPass({ ...showPass, new: !showPass.new })}
            style={toggleButtonStyle}
        >
            {/* 🟢 YENİ İKON YAPISI */}
            {showPass.new ? <FaEyeSlash /> : <FaEye />}
        </button>
    </div>

    {/* YENİ ŞİFRE TEKRAR */}
    <div className="profile-form-group" style={{ position: 'relative' }}>
        <label>Yeni Şifre (Tekrar)</label>
        <input
            type={showPass.confirm ? 'text' : 'password'}
            placeholder="Yeni şifreyi tekrar girin"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
        />
        <button
            type="button"
            className="password-toggle-btn"
            onClick={() => setShowPass({ ...showPass, confirm: !showPass.confirm })}
            style={toggleButtonStyle}
        >
            {/* 🟢 YENİ İKON YAPISI */}
            {showPass.confirm ? <FaEyeSlash /> : <FaEye />}
        </button>
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

            <div className="settings-card steam-integration-card" style={{ marginTop: '20px', borderLeft: '4px solid #171a21' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Steam İkonu (react-icons/fa içinden FaSteam kullanabilirsin) */}
            <div style={{ background: '#171a21', padding: '8px', borderRadius: '8px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 6.627 5.37 12 12 12 6.627 0 12-5.373 12-12 0-6.627-5.373-12-12-12zm0 18.25c-3.452 0-6.25-2.798-6.25-6.25 0-3.452 2.798-6.25 6.25-6.25s6.25 2.798 6.25 6.25c0 3.452-2.798 6.25-6.25 6.25z"/>
                </svg>
            </div>
            <div>
                <h3 style={{ margin: 0, fontSize: '16px' }}>Steam Hesabı</h3>
                <p className="hint" style={{ margin: 0, fontSize: '12px' }}>
                    {user?.steamId ? 'Hesabın bağlı durumda' : 'Profilinde oyun durumunu paylaş'}
                </p>
            </div>
        </div>

        {user?.steamId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1ab199' }}>
                <ShieldCheckIcon width={20} />
                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Bağlı</span>
            </div>
        ) : (
            <button 
                type="button" 
                className="btn-primary" 
                onClick={handleSteamLink}
                style={{ background: '#171a21', borderColor: '#444' }}
            >
                Şimdi Bağla
            </button>
        )}
    </div>
    
    {/* Eğer bağlıysa küçük bir durum özeti gösterilebilir */}
    {user?.steamId && (
        <div style={{ marginTop: '15px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '13px' }}>
            <p style={{ color: '#888', margin: 0 }}>
                Steam verilerin her 60 saniyede bir profilinde güncellenir.
            </p>
        </div>
    )}
</div>

            {/* ÇIKIŞ KARTI */}
            <div className="settings-card logout-card">
                <div>
                    <h4>Hesaptan Ayrıl</h4>
                    <p>Başka bir kullanıcıyla oturum açmak için mevcut oturumunu sonlandır.</p>
                </div>

                <button className="logout-button" onClick={handleLogoutClick}>
                    Çıkış Yap
                </button>
            </div>

            {/* YASAL BİLGİLER & DESTEK ALANI */}
            <div className="settings-card" style={{ marginTop: '30px' }}>
                <h3 style={{ marginBottom: '15px', color: '#f2f3f5', fontSize: '16px' }}>Yasal Bilgiler ve Destek</h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>

                    {/* 1. GİZLİLİK POLİTİKASI */}
                    <button onClick={() => navigate('/legal/privacy')} className="legal-nav-btn">
                        <ShieldCheckIcon width={24} />
                        <span>Gizlilik Politikası</span>
                    </button>

                    {/* 2. KULLANIM KOŞULLARI */}
                    <button onClick={() => navigate('/legal/terms')} className="legal-nav-btn">
                        <DocumentTextIcon width={24} />
                        <span>Kullanım Koşulları</span>
                    </button>

                    {/* 3. ÇEREZ POLİTİKASI */}
                    <button onClick={() => navigate('/legal/cookies')} className="legal-nav-btn">
                        <CpuChipIcon width={24} />
                        <span>Çerez Politikası</span>
                    </button>

                    {/* 4. TOPLULUK KURALLARI */}
                    <button onClick={() => navigate('/legal/guidelines')} className="legal-nav-btn">
                        <UserGroupIcon width={24} />
                        <span>Topluluk Kuralları</span>
                    </button>
                </div>

                {/* İLETİŞİM BUTONU (Tam genişlik) */}
                <button
                    onClick={() => navigate('/dashboard/contact')}
                    className="legal-nav-btn"
                    style={{ marginTop: '10px', width: '100%', justifyContent: 'center', background: '#5865f2', borderColor: '#5865f2', color: 'white' }}
                >
                    <EnvelopeIcon width={24} />
                    <span>Bize Ulaşın / Destek</span>
                </button>
            </div>

            {/* MODAL BİLEŞENİ */}
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