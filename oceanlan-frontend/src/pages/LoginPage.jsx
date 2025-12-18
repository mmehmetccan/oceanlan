// src/pages/LoginPage.jsx
import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { EnvelopeIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { isElectron } from '../utils/platformHelper';
import '../styles/Auth.css';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Beni Hatırla State'i
  const [rememberMe, setRememberMe] = useState(false);

  const [error, setError] = useState('');

  // 🟢 AKILLI LİNK: Backend otomatik olarak en son sürümü bulup indirecek.
  // Version.json fetch etmeye gerek kalmadı.
  const downloadUrl = 'https://oceanlan.com/api/download/latest';

  const { login, loading } = useContext(AuthContext);
  const navigate = useNavigate();
  const isApp = isElectron();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // login fonksiyonuna rememberMe değerini gönderiyoruz
      await login(email, password, rememberMe);
      navigate('/dashboard'); // Başarılıysa ana ekrana git
    } catch (err) {

      // 🟢 ÖZEL DURUM: E-posta doğrulanmamışsa (Backend'den gelen veri)
      // AuthContext hatayı nasıl fırlattığına bağlı olarak veriyi yakalıyoruz
      const responseData = err.response?.data || err;

      if (responseData.needsVerification) {
        setError('E-postanızı doğrulamadan giriş yapamazsınız. Doğrulama sayfasına yönlendiriliyorsunuz...');

        // 2 Saniye Bekle ve Yönlendir
        setTimeout(() => {
          navigate('/verify-email', {
            state: { email: email } // E-postayı diğer sayfaya taşıyoruz ki tekrar yazmasın
          });
        }, 2000);
      } else {
        // Diğer standart hatalar (Şifre yanlış vs.)
        setError(responseData.message || 'Giriş başarısız.');
      }
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

          {/* BENİ HATIRLA ve ŞİFREMİ UNUTTUM SATIRI */}
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

        {/* MASAÜSTÜ UYGULAMASI İNDİRME ALANI (Sadece Web'de Görünür) */}
        {!isApp && (
            <div style={{marginTop: '20px', textAlign: 'center', borderTop: '1px solid #444', paddingTop: '15px'}}>
                <p style={{fontSize: '13px', color: '#949ba4', marginBottom: '10px'}}>
                    Daha iyi bir deneyim için:
                </p>
                <a
                    href={downloadUrl}
                    rel="noopener noreferrer"
                    className="auth-button"
                    // target="_blank" // Exe indireceği için blank'e gerek yok, direkt indirsin
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