import React, { useState, useEffect,useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
import { ToastContext } from '../context/ToastContext';
import '../styles/Auth.css'; // Auth stillerini kullan

const VerifyEmailPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useContext(ToastContext);

  // Register sayfasından gelen email bilgisini al
  const [email, setEmail] = useState(location.state?.email || '');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);

  // Eğer email yoksa (direkt linkle gelindiyse) manuel girmesini isteyebiliriz
  // veya Register'a geri atabiliriz. Şimdilik input açık kalsın.

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ text: '', type: '' });

    try {
      const res = await axiosInstance.post('/auth/verify-email', { email, code });
      addToast(res.data.message || 'E-posta doğrulandı!', 'success');

      setTimeout(() => navigate('/login'), 2000); // Başarılıysa login'e at
    } catch (err) {
      addToast(err.response?.data?.message || 'Doğrulama başarısız.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if(!email) return setMsg({ text: 'E-posta adresi gerekli', type: 'error' });

    try {
        await axiosInstance.post('/auth/resend-code', { email });
        addToast('Yeni doğrulama kodu gönderildi.', 'success');
    } catch (err) {
        addToast(err.response?.data?.message || 'Kod gönderilemedi.', 'error');
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-box">
        <div className="auth-header">
          <h2>Hesabı Doğrula</h2>
          <p>E-posta adresine gelen 6 haneli kodu gir.</p>
        </div>

        {msg.text && (
          <div className={`auth-alert ${msg.type}`}>
            {msg.type === 'success' ? '✅' : '⚠️'} {msg.text}
          </div>
        )}

        <form onSubmit={handleVerify} className="auth-form">
          <div className="input-group">
             {/* Email otomatik geldiyse readonly yapabilirsin veya düzenlenebilir bırakabilirsin */}
             <input
                type="email"
                className="auth-input"
                placeholder="E-posta Adresi"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
             />
          </div>

          <div className="input-group">
             <input
                type="text"
                className="auth-input"
                placeholder="Doğrulama Kodu (örn: 123456)"
                value={code}
                onChange={e => setCode(e.target.value)}
                maxLength={6}
                style={{letterSpacing: '5px', textAlign: 'center', fontSize: '20px', fontWeight: 'bold'}}
                required
             />
          </div>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Doğrulanıyor...' : 'Doğrula'}
          </button>
        </form>

        <div style={{textAlign: 'center', marginTop: '15px'}}>
            <button
                type="button"
                onClick={handleResend}
                style={{background: 'none', border: 'none', color: '#00a8fc', cursor: 'pointer', fontSize: '14px'}}
            >
                Kod gelmedi mi? Tekrar Gönder
            </button>
        </div>

      </div>
    </div>
  );
};

export default VerifyEmailPage;