// src/components/feed/CreatePost.jsx
import React, { useState, useRef, useContext } from 'react';
import axiosInstance from '../../utils/axiosInstance';
import { ToastContext } from '../../context/ToastContext'; // Toast bildirimi için
import { PhotoIcon, VideoCameraIcon, XMarkIcon } from '@heroicons/react/24/solid';
import '../../styles/FeedPage.css';

const CreatePost = ({ onPostCreated }) => {
    const [content, setContent] = useState('');
    const [file, setFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null); // Önizleme için
    const [fileType, setFileType] = useState(null); // 'image' veya 'video'
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fileInputRef = useRef(null);
    const { addToast } = useContext(ToastContext); // Bildirim kullan

    // Dosya Seçme ve Doğrulama
    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        // 1. Video Süre Kontrolü (Max 60 saniye)
        if (selectedFile.type.startsWith('video/')) {
            const videoElement = document.createElement('video');
            videoElement.preload = 'metadata';
            videoElement.onloadedmetadata = function () {
                window.URL.revokeObjectURL(videoElement.src);
                const duration = videoElement.duration;
                if (duration > 60) {
                    addToast('Video süresi 1 dakikayı geçemez!', 'error');
                    setFile(null);
                    setPreviewUrl(null);
                    fileInputRef.current.value = null;
                } else {
                    // Süre uygunsa state'e at
                    setFile(selectedFile);
                    setFileType('video');
                    setPreviewUrl(URL.createObjectURL(selectedFile));
                }
            }
            videoElement.src = URL.createObjectURL(selectedFile);
        }
        // 2. Resim/GIF Kontrolü
        else if (selectedFile.type.startsWith('image/')) {
            setFile(selectedFile);
            setFileType('image');
            setPreviewUrl(URL.createObjectURL(selectedFile));
        } else {
            addToast('Desteklenmeyen dosya formatı.', 'warning');
        }
    };

    const clearFile = () => {
        setFile(null);
        setPreviewUrl(null);
        setFileType(null);
        if (fileInputRef.current) fileInputRef.current.value = null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (content.trim() === '' && !file) return;

        setIsSubmitting(true);

        const formData = new FormData();
        formData.append('content', content);
        if (file) {
            formData.append('file', file);
        }

        try {
            const res = await axiosInstance.post('/posts', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            onPostCreated(res.data.data); // Listeye ekle

            // Formu temizle
            setContent('');
            clearFile();
            addToast('Gönderi paylaşıldı!', 'success');

        } catch (error) {
            addToast(error.response?.data?.message || 'Gönderi oluşturulamadı', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="create-post-card">
            <form onSubmit={handleSubmit} className="create-post-form">
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Ne düşünüyorsun?"
                    rows="3"
                    className="create-post-input"
                />

                {/* Dosya Önizleme Alanı */}
                {previewUrl && (
                    <div style={{ position: 'relative', marginTop: '10px', width: 'fit-content' }}>
                        <button
                            type="button"
                            onClick={clearFile}
                            style={{
                                position: 'absolute', top: -10, right: -10,
                                background: '#ed4245', border: 'none', borderRadius: '50%',
                                color: 'white', cursor: 'pointer', padding: '4px'
                            }}
                        >
                            <XMarkIcon width={16} />
                        </button>

                        {fileType === 'video' ? (
                            <video src={previewUrl} controls style={{ maxHeight: '200px', borderRadius: '8px' }} />
                        ) : (
                            <img src={previewUrl} alt="Preview" style={{ maxHeight: '200px', borderRadius: '8px' }} />
                        )}
                    </div>
                )}

                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    // 🟢 GIF ve Video formatlarını kabul et
                    accept="image/png, image/jpeg, image/gif, video/mp4, video/webm"
                    style={{ display: 'none' }}
                />

                <div className="create-post-actions">
                    <button
                        type="button"
                        className="post-attach-btn"
                        onClick={() => fileInputRef.current.click()}
                        title="Medya Ekle"
                        style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                        <PhotoIcon width={20} /> / <VideoCameraIcon width={20} />
                        <span style={{ fontSize: '12px' }}>Medya Ekle</span>
                    </button>

                    <button type="submit" className="post-submit-btn" disabled={isSubmitting}>
                        {isSubmitting ? 'Paylaşılıyor...' : 'Paylaş'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreatePost;