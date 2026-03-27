import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const ResetPasswordPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    resetCode: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      return setError('Şifreler eşleşmiyor');
    }

    setLoading(true);
    setError('');

    try {
      // Backend'deki yeni yapıya uygun istek
      await axios.put(`${API_URL_BASE}/api/v1/auth/resetpassword`, {
        email: formData.email,
        resetCode: formData.resetCode,
        password: formData.password
      });

      alert('Şifreniz başarıyla değiştirildi! Giriş yapabilirsiniz.');
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Kod hatalı veya süresi dolmuş');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h2>Yeni Şifre Belirle</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="E-posta Adresiniz"
          value={formData.email}
          onChange={(e) => setFormData({...formData, email: e.target.value})}
          required
        />
        <input
          type="text"
          placeholder="6 Haneli Kod"
          value={formData.resetCode}
          onChange={(e) => setFormData({...formData, resetCode: e.target.value})}
          required
          maxLength={6}
        />
        <input
          type="password"
          placeholder="Yeni Şifre"
          value={formData.password}
          onChange={(e) => setFormData({...formData, password: e.target.value})}
          required
          minLength={6}
        />
        <input
          type="password"
          placeholder="Yeni Şifre (Tekrar)"
          value={formData.confirmPassword}
          onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'İşleniyor...' : 'Şifreyi Güncelle'}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
};

export default ResetPasswordPage;