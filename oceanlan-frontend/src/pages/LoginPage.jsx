// src/pages/LoginPage.jsx
import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { EnvelopeIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { isElectron } from '../utils/platformHelper';
import '../styles/Auth.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // 🟢 YENİ: Beni Hatırla State'i
  const [rememberMe, setRememberMe] = useState(false);

  const [error, setError] = useState('');
const [downloadUrl, setDownloadUrl] = useState('https://oceanlan.com/uploads/installer/OceanLan-Setup-1.4.8.exe');
  const { login, loading } = useContext(AuthContext);
  const navigate = useNavigate();
  const isApp = isElectron();

 useEffect(() => {
  if (!isApp) {
    fetch('https://oceanlan.com/version.json')
      .then(res => res.json())
      .then(data => {
        const newLink = `https://oceanlan.com/uploads/installer/OceanLan-Setup-${data.version}.exe`;
        setDownloadUrl(newLink);
        console.log("Güncel sürüm linki ayarlandı:", newLink);
      })
      .catch(err => {
        console.error("Versiyon bilgisi alınamadı.", err);
      });
  }
}, [isApp]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // 🟢 login fonksiyonuna rememberMe değerini gönderiyoruz
      await login(email, password, rememberMe);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-box">
        <div className="auth-header">
          <h2>Hoş Geldin!</h2>
        </div>

        {error && (
          <div className="auth-alert error">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <EnvelopeIcon className="input-icon" />
            <input
              type="email"
              className="auth-input"
              placeholder="E-posta Adresi"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <LockClosedIcon className="input-icon" />
            <input
              type="password"
              className="auth-input"
              placeholder="Şifre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {/* 🟢 BENİ HATIRLA ve ŞİFREMİ UNUTTUM SATIRI */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', fontSize: '14px', width: '100%' }}>

            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#b9bbbe' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ marginRight: '8px', cursor: 'pointer' }}
              />
              Beni Hatırla
            </label>

            <Link to="/forgot-password" style={{ color: '#00aff4', textDecoration: 'none' }}>
              Şifreni mi unuttun?
            </Link>
          </div>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <div className="auth-footer">
          Hesabın yok mu?
          <Link to="/register" className="auth-link">Kaydol</Link>
        </div>

        {!isApp && (
            <div style={{marginTop: '20px', textAlign: 'center', borderTop: '1px solid #444', paddingTop: '15px'}}>
                <p style={{fontSize: '13px', color: '#949ba4', marginBottom: '10px'}}>
                    Daha iyi bir deneyim için:
                </p>
                <a
                    href={downloadUrl}
                    rel="noopener noreferrer"
                    className="auth-button"
                    target="_blank"
                    style={{
                        background: '#23a559',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 20px',
                        justifyContent: 'center'
                    }}
                >
                    Masaüstü Uygulamasını İndir
                </a>
            </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;