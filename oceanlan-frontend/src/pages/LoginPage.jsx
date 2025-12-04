// src/pages/LoginPage.jsx
import React, { useState, useContext,useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';
import { useNavigate, Link } from 'react-router-dom';
import { EnvelopeIcon, LockClosedIcon } from '@heroicons/react/24/outline'; // İkonlar
import { isElectron } from '../utils/platformHelper'; // 👈 IMPORT
import '../styles/Auth.css'; // Yeni CSS

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [downloadUrl, setDownloadUrl] = useState('https://oceanlan.com/uploads/installer/OceanLan-Setup-1.1.3.exe');

  const { login, loading } = useContext(AuthContext);
  const { addToast } = useContext(ToastContext);
  const navigate = useNavigate();


  const isApp = isElectron();


  useEffect(() => {
    // Eğer uygulama içindeysek versiyon kontrolüne gerek yok, boşuna internet harcamayalım
    if (!isApp) {
      // version.json dosyasını sitenden okuyoruz
      fetch('https://oceanlan.com/version.json')
        .then(response => response.json())
        .then(data => {
          // Gelen versiyon numarasıyla linki oluşturuyoruz
          const newLink = `https://oceanlan.com/uploads/installer/OceanLan-Setup-${data.version}.exe`;
          setDownloadUrl(newLink);
          console.log("Güncel sürüm linki ayarlandı:", newLink);
        })
        .catch(err => {
          console.error("Versiyon bilgisi alınamadı, varsayılan link kullanılıyor.", err);
        });
    }
  }, [isApp]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      addToast('Giriş başarılı!', 'success');
      navigate('/dashboard');
    } catch (err) {
      addToast(err.message || 'Giriş yapılamadı.', 'error');
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-box">
        <div className="auth-header">
          <h2>Hoş Geldin!</h2>

        </div>



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

          <div className="forgot-password">
            <Link to="/forgot-password" className="forgot-link">
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
                        padding: '10px 20px'
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