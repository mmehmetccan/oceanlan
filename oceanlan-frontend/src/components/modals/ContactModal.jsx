import React, { useState,useContext } from 'react';
import axiosInstance from '../../utils/axiosInstance';
import '../../styles/ContactModal.css';
import { ToastContext } from '../../context/ToastContext';

const ContactModal = ({ onClose }) => {
    const { addToast } = useContext(ToastContext);
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null); // 'success' | 'error'
const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await axiosInstance.post('/contact', { subject, message });
            setSuccess(true);
            setTimeout(onClose, 2500);
        } catch (err) {
            addToast('Mesaj gönderilemedi. Lütfen tekrar deneyin.', 'error');
            setSuccess(false);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose} style={{zIndex: 20000}}>
            <div className="modal-content contact-modal" onClick={e => e.stopPropagation()}>
                <h3>İletişim & Destek</h3>

                {result === 'success' ? (
                    <div className="contact-status success">
                        <span style={{fontSize: '40px'}}>✅</span>
                        <p>Mesajınız başarıyla gönderildi!</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Konu</label>
                            <input
                                type="text"
                                placeholder="Örn: Hata Bildirimi, Öneri..."
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Mesajınız</label>
                            <textarea
                                placeholder="Detaylı açıklama..."
                                rows="5"
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                required
                            ></textarea>
                        </div>

                        {result === 'error' && <p className="error-text">Gönderim başarısız, lütfen tekrar deneyin.</p>}

                        <div className="form-actions">
                            <button type="button" onClick={onClose} className="cancel-btn">İptal</button>
                            <button type="submit" className="submit-btn" disabled={loading}>
                                {loading ? 'Gönderiliyor...' : 'Gönder'}
                            </button>
                        </div>
                    </form>
                )}

                <button className="close-button" onClick={onClose}>X</button>
            </div>
        </div>
    );
};

export default ContactModal;