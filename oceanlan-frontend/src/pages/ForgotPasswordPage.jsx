import React, { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance'; // 👈 Import et
const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
    const res = await axiosInstance.post('/auth/forgotpassword', { email });      setMessage(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h2>Şifremi Unuttum</h2>
      <p style={{color: '#b9bbbe', marginBottom: '20px', textAlign: 'center'}}>
        E-posta adresinizi girin, size sıfırlama bağlantısı gönderelim.
      </p>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="E-posta Adresiniz"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Gönderiliyor...' : 'Sıfırlama Linki Gönder'}
        </button>

        {message && <p className="success" style={{color: '#43b581', marginTop: '10px'}}>{message}</p>}
        {error && <p className="error">{error}</p>}
      </form>

      <p>Hatırladınız mı? <Link to="/login">Giriş Yap</Link></p>
    </div>
  );
};

export default ForgotPasswordPage;