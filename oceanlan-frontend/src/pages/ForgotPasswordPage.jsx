import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'https://oceanlan.com';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState(1); // 1: E-posta İste, 2: Kod ve Yeni Şifre Gir
  const [formData, setFormData] = useState({
    resetCode: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // ADIM 1: Mail Gönderme Fonksiyonu
  const handleSendEmail = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await axios.post(`${API_URL_BASE}/api/v1/auth/forgotpassword`, { email });
      setMessage('Sıfırlama kodu e-posta adresinize gönderildi.');
      setStep(2); // Başarılıysa 2. adıma (Kod Girişi) geç
    } catch (err) {
      setError(err.response?.data?.message || 'E-posta gönderilemedi.');
    } finally {
      setLoading(false);
    }
  };

  // ADIM 2: Kod ve Yeni Şifre Onaylama Fonksiyonu
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      return setError('Şifreler eşleşmiyor');
    }

    setLoading(true);
    setError('');
    try {
      await axios.put(`${API_URL_BASE}/api/v1/auth/resetpassword`, {
        email,
        resetCode: formData.resetCode,
        password: formData.password
      });
      alert('Şifreniz başarıyla güncellendi!');
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Kod hatalı veya süresi dolmuş.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        {step === 1 ? (
          <>
            <h2>Şifremi Unuttum</h2>
            <p className="auth-subtitle">E-posta adresinizi girin, size 6 haneli bir kod gönderelim.</p>
            <form onSubmit={handleSendEmail}>
              <input
                type="email"
                placeholder="E-posta Adresiniz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="auth-button" disabled={loading}>
                {loading ? 'Gönderiliyor...' : 'Sıfırlama Kodu Gönder'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2>Şifreyi Sıfırla</h2>
            <p className="auth-subtitle"><strong>{email}</strong> adresine gelen kodu ve yeni şifrenizi girin.</p>
            <form onSubmit={handleResetPassword}>
              <input
                type="text"
                placeholder="6 Haneli Kod"
                value={formData.resetCode}
                onChange={(e) => setFormData({ ...formData, resetCode: e.target.value })}
                required
                maxLength={6}
              />
              <input
                type="password"
                placeholder="Yeni Şifre"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={6}
              />
              <input
                type="password"
                placeholder="Yeni Şifre (Tekrar)"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
              />
              <button type="submit" className="auth-button" disabled={loading}>
                {loading ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
              </button>
              <button type="button" className="auth-back-button" onClick={() => setStep(1)}>
                Geri Dön
              </button>
            </form>
          </>
        )}

        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
        
        <div className="auth-footer">
          <Link to="/login">Giriş Yap'a Dön</Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;