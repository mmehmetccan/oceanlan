// src/pages/LoginPage.jsx
import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { EnvelopeIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { isElectron } from '../utils/platformHelper';
import '../styles/Auth.css';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');

  // 🟢 AKILLI LİNK: Backend otomatik en son sürümü verir
  const downloadUrl = 'https://oceanlan.com/api/download/latest';

  const { login, loading } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const isApp = isElectron();

  // Register sayfasından yönlendirme ile gelindiyse emaili doldur
  useEffect(() => {
    if (location.state?.email) {
      setEmail(location.state.email);
    }
  }, [location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // Login işlemini başlat
      await login(email, password, rememberMe);

      // Hata yoksa yönlendir
      navigate('/dashboard');

    } catch (errData) {
      // 🔴 HATA AYIKLAMA KISMI (Burayı geliştirdik)
      console.log("LOGIN HATASI (HAM VERİ):", errData);

      // 1. ÖZEL DURUM: E-posta Doğrulanmamışsa
      if (errData?.needsVerification) {
        setError('E-postanızı doğrulamadan giriş yapamazsınız. Doğrulama sayfasına yönlendiriliyorsunuz...');

        setTimeout(() => {
          navigate('/verify-email', {
            state: { email: errData.email || email }
          });
        }, 2000);
        return; // İşlemi burada kes
      }

      // 2. GENEL HATA MESAJINI ÇIKARMA (Object hatasını çözer)
      let displayMessage = 'Giriş yapılamadı.';

      if (typeof errData === 'string') {
          // Eğer hata direkt yazı olarak geldiyse
          displayMessage = errData;
      } else if (errData?.message) {
          // Eğer hata { message: "..." } şeklindeyse
          displayMessage = errData.message;
      } else if (errData?.error) {
          // Bazı backendler { error: "..." } döner
          displayMessage = errData.error;
      } else {
          // Hiçbirine uymuyorsa, objeyi yazıya çevirip gösterelim (Debug için)
          try {
            displayMessage = JSON.stringify(errData);
          } catch (e) {
            displayMessage = 'Bilinmeyen bir hata oluştu.';
          }
      }

      // Ekrana düzgün mesajı bas
      setError(displayMessage);
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
            {/* Hata mesajını burada gösteriyoruz */}
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
          Hesabın yok mu? <Link to="/register" className="auth-link">Kaydol</Link>
        </div>

        {!isApp && (
            <div style={{marginTop: '20px', textAlign: 'center', borderTop: '1px solid #444', paddingTop: '15px'}}>
                <a
                    href={downloadUrl}
                    className="auth-button"
                    style={{ background: '#23a559', textDecoration: 'none', display: 'inline-flex', justifyContent: 'center', gap: '8px' }}
                >
                    Masaüstü Uygulamasını İndir
                </a>
                <p style={{fontSize:'11px', color:'#72767d', marginTop:'5px'}}>
                  (Otomatik Güncel Sürüm)
                </p>
            </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;