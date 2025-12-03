// src/pages/LoginPage.jsx
import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { EnvelopeIcon, LockClosedIcon } from '@heroicons/react/24/outline'; // İkonlar
import { isElectron } from '../utils/platformHelper'; // 👈 IMPORT
import '../styles/Auth.css'; // Yeni CSS

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, loading } = useContext(AuthContext);
  const navigate = useNavigate();
const isApp = isElectron();
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
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
                  href="https://oceanlan.com/uploads/installer/setup.exe" // 👈 İndirme Linki (Bunu aşağıda anlatacağım)
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