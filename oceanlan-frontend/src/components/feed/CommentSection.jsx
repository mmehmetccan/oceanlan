// src/components/feed/CommentSection.jsx
import React, { useState } from 'react';
import axiosInstance from '../../utils/axiosInstance';
import CommentItem from './CommentItem';

const CommentSection = ({
  postId,
  initialComments,
  onCommentAdded,
  onCommentDeleted, // ✅ EKLENDİ
  getAvatarUrl,
  handleAvatarError,
  onOpenProfile
}) => {
  const [comments, setComments] = useState(initialComments || []);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    if (newComment.trim() === '') return;

    setIsSubmitting(true);
    try {
      const res = await axiosInstance.post(`/posts/${postId}/comment`, { content: newComment });
      const populatedComment = res.data.data;
      setComments(prev => [...prev, populatedComment]);
      onCommentAdded(populatedComment);
      setNewComment('');
    } catch (error) {
      alert(error.response?.data?.message || 'Yorum gönderilemedi');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ✅ YORUM SİLME FONKSİYONU
  const handleDeleteComment = async (commentId) => {
    if (!window.confirm("Bu yorumu silmek istediğinize emin misiniz?")) return;

    try {
      await axiosInstance.delete(`/posts/${postId}/comment/${commentId}`);

      // Listeden çıkar
      setComments(prev => prev.filter(c => c._id !== commentId));

      // PostCard'a bildir (sayıyı güncellemesi için)
      if (onCommentDeleted) onCommentDeleted(commentId);

    } catch (error) {
      console.error(error);
      alert("Yorum silinemedi.");
    }
  };

  return (
    <div className="comment-section" style={{ marginTop: '15px', borderTop: '1px solid #444', paddingTop: '10px' }}>
      <form onSubmit={handleSubmitComment} style={{ display: 'flex', marginBottom: '10px' }}>
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Bir yorum yaz..."
          style={{ flex: 1, background: '#444', border: 'none', color: 'white', padding: '8px', borderRadius: '4px' }}
        />
        <button className={"post-submit-btn"} type="submit" disabled={isSubmitting} style={{ marginLeft: '8px' }}>
          {isSubmitting ? '...' : 'Gönder'}
        </button>
      </form>

      <div className="comments-list">
        {comments.map(comment => (
          <CommentItem
            key={comment._id}
            comment={comment}
            getAvatarUrl={getAvatarUrl}
            handleAvatarError={handleAvatarError}
            onOpenProfile={onOpenProfile}
            onDelete={handleDeleteComment} // ✅ Fonksiyonu Item'a gönderiyoruz
          />
        ))}
      </div>
    </div>
  );
};

export default CommentSection;