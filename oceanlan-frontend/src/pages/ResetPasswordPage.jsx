import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';


const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const ResetPasswordPage = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { resetToken } = useParams(); // URL'deki token'ı al

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
        return setError('Şifreler eşleşmiyor');
    }

    setLoading(true);
    setError('');

    try {
      await axios.put(`${API_URL_BASE}/api/v1/auth/resetpassword/${resetToken}`, { password });
      alert('Şifreniz başarıyla değiştirildi! Giriş yapılıyor...');
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Bağlantı geçersiz veya süresi dolmuş');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h2>Yeni Şifre Belirle</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Yeni Şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
        <input
          type="password"
          placeholder="Yeni Şifre (Tekrar)"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={6}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Güncelleniyor...' : 'Şifreyi Değiştir'}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
};

export default ResetPasswordPage;