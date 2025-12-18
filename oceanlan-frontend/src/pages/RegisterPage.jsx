import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
import { UserIcon, EnvelopeIcon, PhoneIcon, LockClosedIcon, FingerPrintIcon } from '@heroicons/react/24/outline';
import '../styles/Auth.css';

// 🟢 1. Ülke Kodları Listesi (İstediğin kadar ekleyebilirsin)
const COUNTRY_CODES = [
  { code: '+90', label: 'TR (+90)' },
  { code: '+1', label: 'US (+1)' },
  { code: '+49', label: 'DE (+49)' },
  { code: '+44', label: 'UK (+44)' },
  { code: '+33', label: 'FR (+33)' },
  { code: '+994', label: 'AZ (+994)' },
];

const RegisterPage = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // 🟢 2. Telefon için iki ayrı state: Alan Kodu ve Numara
  const [countryCode, setCountryCode] = useState('+90');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  // 🟢 3. Numara Kontrolü: Sadece rakam ve Max 10 hane
  const handlePhoneChange = (e) => {
    const rawValue = e.target.value;
    // Harfleri sil, sadece rakam bırak
    const numericValue = rawValue.replace(/[^0-9]/g, '');

    // Maksimum 10 karakter (Örn: 532 123 45 67)
    if (numericValue.length <= 10) {
      setPhoneNumber(numericValue);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      // 🟢 4. Veriyi Birleştirme: (+90) + (532...) -> +90532...
      // Veritabanına tam numara olarak kaydediyoruz.
      const fullPhoneNumber = `${countryCode}${phoneNumber}`;

      const res = await axiosInstance.post('/auth/register', {
          firstName,
          lastName,
          phoneNumber: fullPhoneNumber, // Birleşmiş hali
          username,
          email,
          password
      });

      setSuccessMsg(res.data.message);

      // Formu temizle
      setFirstName('');
      setLastName('');
      setPhoneNumber('');
      setUsername('');
      setEmail('');
      setPassword('');

      // Başarılı ise 2 saniye sonra yönlendir
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
              <small style={{opacity:0.8}}>Doğrulama sayfasına yönlendiriliyorsunuz...</small>
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
                style={{paddingLeft: '16px'}}
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

          {/* 🟢 5. ÖZELLEŞTİRİLMİŞ TELEFON ALANI */}
          <div className="input-group" style={{ display: 'flex', alignItems: 'center' }}>
            <PhoneIcon className="input-icon" />

            {/* Sol Taraf: Alan Kodu Seçimi */}
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="auth-input"
              style={{
                width: '115px',
                paddingLeft: '40px', // İkon üstüne binmesin diye boşluk
                paddingRight: '5px',
                borderRight: '1px solid #444', // Ayrım çizgisi
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                appearance: 'none', // Tarayıcının varsayılan okunu gizle
                cursor: 'pointer',
                backgroundColor: 'transparent', // Arka plan rengi input ile aynı olsun
                color: 'white'
              }}
            >
              {COUNTRY_CODES.map((item) => (
                <option key={item.code} value={item.code} style={{backgroundColor: '#2b2d31'}}>
                  {item.label}
                </option>
              ))}
            </select>

            {/* Sağ Taraf: Numara Girişi */}
            <input
              type="tel"
              className="auth-input"
              placeholder="5XX XXX XX XX"
              value={phoneNumber}
              onChange={handlePhoneChange}
              required
              maxLength={10} // HTML tarafında da sınır
              style={{
                flex: 1, // Kalan tüm genişliği kapla
                paddingLeft: '12px',
                borderLeft: 'none',
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0
              }}
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