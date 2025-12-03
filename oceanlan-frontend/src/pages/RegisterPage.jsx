// src/pages/RegisterPage.jsx
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
import { UserIcon, EnvelopeIcon, PhoneIcon, LockClosedIcon, FingerPrintIcon } from '@heroicons/react/24/outline';
import '../styles/Auth.css';

const RegisterPage = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const res = await axiosInstance.post('/auth/register', {
          firstName,
          lastName,
          phoneNumber,
          username,
          email,
          password
      });

      setSuccessMsg(res.data.message);

      setFirstName('');
      setLastName('');
      setPhoneNumber('');
      setUsername('');
      setEmail('');
      setPassword('');

      setTimeout(() => {
          navigate('/verify-email', { state: { email: email } });
      }, 2000);

    } catch (err) {
      setError(err.response?.data?.message || 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-box">
        <div className="auth-header">
          <h2>Hesap Oluştur</h2>
          <p>Hemen aramıza katıl ve topluluğun bir parçası ol!</p>
        </div>

        {error && (
          <div className="auth-alert error">
            <span>⚠️</span> {error}
          </div>
        )}

        {successMsg && (
          <div className="auth-alert success">
            <span>✅</span>
            <div>
              {successMsg} <br/>
              <small style={{opacity:0.8}}>Giriş sayfasına yönlendiriliyorsunuz...</small>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">

          <div className="row-inputs">
            <div className="input-group">
                <UserIcon className="input-icon" />
                <input
                type="text"
                className="auth-input"
                placeholder="İsim"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                />
            </div>
            <div className="input-group">
                <input
                type="text"
                className="auth-input"
                placeholder="Soyisim"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                style={{paddingLeft: '16px'}} /* Soyisimde ikon yok, düz hizala */
                />
            </div>
          </div>

          <div className="input-group">
            <FingerPrintIcon className="input-icon" />
            <input
              type="text"
              className="auth-input"
              placeholder="Kullanıcı Adı"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <EnvelopeIcon className="input-icon" />
            <input
              type="email"
              className="auth-input"
              placeholder="E-posta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <PhoneIcon className="input-icon" />
            <input
              type="tel"
              className="auth-input"
              placeholder="Telefon Numarası (5XX...)"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <LockClosedIcon className="input-icon" />
            <input
              type="password"
              className="auth-input"
              placeholder="Şifre (Min 6 Karakter)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Kaydediliyor...' : 'Kaydol'}
          </button>
        </form>

        <div className="auth-footer">
          Zaten hesabın var mı? <Link to="/login" className="auth-link">Giriş Yap</Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;