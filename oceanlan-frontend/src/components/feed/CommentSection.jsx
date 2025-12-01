// src/components/feed/CommentSection.jsx
import React, { useState } from 'react';
import axiosInstance from '../../utils/axiosInstance';
import CommentItem from './CommentItem'; // 💡 CommentItem'ı doğru içe aktar

const CommentSection = ({ postId, initialComments, onCommentAdded, getAvatarUrl,
    handleAvatarError }) => {
    const [comments, setComments] = useState(initialComments || []);
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmitComment = async (e) => {
        e.preventDefault();
        if (newComment.trim() === '') return;

        setIsSubmitting(true);
        try {
            const res = await axiosInstance.post(`/posts/${postId}/comment`, {
                content: newComment
            });

            // Backend'den gelen dolu (populated) yorum objesini al
            const populatedComment = res.data.data;

            // Yorumu listeye ekle
            setComments(prev => [...prev,populatedComment]);

            // PostCard'ı uyar (yorum sayısını güncellemek için)
            // Bu, PostCard'ın comments state'ini de günceller.
            onCommentAdded(populatedComment);
            setNewComment('');

        } catch (error) {
            alert(error.response?.data?.message || 'Yorum gönderilemedi');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="comment-section" style={{ marginTop: '15px', borderTop: '1px solid #444', paddingTop: '10px' }}>
            {/* Yorum Ekleme Formu */}
            <form onSubmit={handleSubmitComment} style={{ display: 'flex', marginBottom: '10px' }}>
                <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Bir yorum yaz..."
                    style={{ flex: 1, background: '#444', border: 'none', color: 'white', padding: '8px' }}
                />
                <button
                    className={"post-submit-btn"}
                  type="submit"
                  disabled={isSubmitting}

                >
                    {isSubmitting ? 'Gönderiliyor...' : 'Gönder'}
                </button>
            </form>

            {/* Yorum Listesi */}
            <div className="comments-list">
                {comments.map(comment => ( // 💡 Lokal 'comments' state'ini kullanın (initialComments yerine)
                    <CommentItem
                        key={comment._id}
                        comment={comment}
                        // 💡 Props'u CommentItem'a iletin
                        getAvatarUrl={getAvatarUrl}
                        handleAvatarError={handleAvatarError}
                    />
                ))}
            </div>
        </div>
    );
};

export default CommentSection;