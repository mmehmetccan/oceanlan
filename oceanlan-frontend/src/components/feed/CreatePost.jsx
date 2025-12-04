// src/components/feed/CreatePost.jsx
import React, { useState, useRef } from 'react';
import axiosInstance from '../../utils/axiosInstance';
import '../../styles/FeedPage.css';

const CreatePost = ({ onPostCreated }) => {
    const [content, setContent] = useState('');
    const [file, setFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef(null);

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

            onPostCreated(res.data.data);

            setContent('');
            setFile(null);
            fileInputRef.current.value = null;

        } catch (error) {
                alert(error.response?.data?.message || 'Gönderi oluşturulamadı');
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
                    rows="4"
                    className="create-post-input"
                />
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => setFile(e.target.files[0])}
                    accept="image/*,video/*"
                    style={{ display: 'none' }}
                />
                <div className="create-post-actions">
                    <button
                        type="button"
                        className="post-attach-btn"
                        onClick={() => fileInputRef.current.click()}
                    >
                        Resim/Video Ekle
                    </button>
                    <button type="submit" className="post-submit-btn" disabled={isSubmitting}>
                        {isSubmitting ? 'Paylaşılıyor...' : 'Paylaş'}
                    </button>
                </div>
                {file && <p className="create-post-file">Se?ilen dosya: {file.name}</p>}
            </form>
        </div>
    );
};

export default CreatePost;
