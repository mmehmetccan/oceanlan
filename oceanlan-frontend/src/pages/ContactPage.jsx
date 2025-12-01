// src/pages/ContactPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../utils/axiosInstance';
import '../styles/ContactPage.css';

const ContactPage = () => {
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await axiosInstance.post('/contact', { subject, message });
            setResult('success');
            setTimeout(() => navigate('/dashboard/feed'), 3000);
        } catch (err) {
            setResult('error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="contact-page-container">
            <div className="contact-card">
                <h2>İletişim & Destek</h2>
                <p className="contact-subtitle">Bir sorun mu yaşıyorsunuz? Bize bildirin.</p>

                {result === 'success' ? (
                    <div className="contact-status success">
                        <span style={{fontSize: '48px'}}>✅</span>
                        <h3>Mesajınız Gönderildi!</h3>
                        <p>Yönlendiriliyorsunuz...</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="contact-form">
                        <div className="form-group">
                            <label>Konu</label>
                            <input type="text" placeholder="Konu başlığı..." value={subject} onChange={e => setSubject(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label>Mesajınız</label>
                            <textarea placeholder="Mesajınız..." rows="6" value={message} onChange={e => setMessage(e.target.value)} required></textarea>
                        </div>
                        {result === 'error' && <p className="error-text">Gönderim başarısız.</p>}
                        <div className="form-actions">
                            <button type="button" onClick={() => navigate(-1)} className="btn-cancel">İptal</button>
                            <button type="submit" className="btn-submit" disabled={loading}>{loading ? '...' : 'Gönder'}</button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ContactPage;