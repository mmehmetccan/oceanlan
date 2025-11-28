// src/pages/VerifyEmailPage.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import axiosInstance from '../utils/axiosInstance';

const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const VerifyEmailPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [status, setStatus] = useState('Doğrulanıyor...');
  const [isSuccess, setIsSuccess] = useState(false);

  // URL'e göre hangi endpoint'e gideceğimizi anla
  // Eğer route "/verify-email/:token" ise -> Auth doğrulaması
  // Eğer route "/verify-change-email/:token" ise -> Profil değişikliği doğrulaması
  const isChangeEmail = location.pathname.includes('verify-change-email');

  useEffect(() => {
    const verify = async () => {
      try {
        let url;
        if (isChangeEmail) {
            url = `/users/verify-new-email/${token}`;
        } else {
            url = `/auth/verifyemail/${token}`;
        }

        const res = await axios.put(url);

        setStatus(res.data.message);
        setIsSuccess(true);

        // 3 Saniye sonra login'e at
        setTimeout(() => {
            navigate('/login');
        }, 3000);

      } catch (error) {
        setStatus(error.response?.data?.message || 'Doğrulama başarısız.');
        setIsSuccess(false);
      }
    };

    if (token) verify();
  }, [token, isChangeEmail, navigate]);

  return (
    <div className="auth-container">
      <div style={{ textAlign: 'center', color: 'white' }}>
        <h2>{isSuccess ? '✅ Başarılı!' : '⏳ İşlem Yapılıyor...'}</h2>
        <p>{status}</p>
        {isSuccess && <p>Giriş sayfasına yönlendiriliyorsunuz...</p>}
        {!isSuccess && status !== 'Doğrulanıyor...' && (
            <button onClick={() => navigate('/login')} style={{marginTop: '20px'}}>
                Giriş'e Dön
            </button>
        )}
      </div>
    </div>
  );
};

export default VerifyEmailPage;