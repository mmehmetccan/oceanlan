// src/components/feed/PostCard.jsx
import React, { useState, useContext } from 'react';
import axiosInstance from '../../utils/axiosInstance';
import { AuthContext } from '../../context/AuthContext';
import CommentSection from './CommentSection';
import { getFullImageUrl } from '../../utils/urlHelper';
import { TrashIcon } from '@heroicons/react/24/outline';
import '../../styles/FeedPage.css';

const DEFAULT_AVATAR = '/default-avatar.png';

const PostCard = ({ post, onPostUpdated, getAvatarUrl, handleAvatarError }) => {
    const { user } = useContext(AuthContext);
    const [showComments, setShowComments] = useState(false);

    const currentUserId = user?.id;
    const isLiked = currentUserId ? post.likes.includes(currentUserId) : false;
    const isDisliked = currentUserId ? post.dislikes.includes(currentUserId) : false;
const isOwner = post.user?._id === currentUserId || post.user === currentUserId;


    // 1. Profil Resmi URL'si
    const avatarRaw = post?.user?.avatarUrl || post?.user?.avatar;
    const avatarSrc = getFullImageUrl(avatarRaw);

    // 2. Gönderi Medyası (Resim/Video) URL'si
    const mediaSrc = getFullImageUrl(post.mediaUrl);



    const handleAvatarErrorSafe = (event) => {
        if (typeof handleAvatarError === 'function') {
            handleAvatarError(event);
            return;
        }
        if (event?.target) {
            event.target.src = DEFAULT_AVATAR;
        }
    };


    const handleDelete = async () => {
        if (!window.confirm("Bu gönderiyi silmek istediğinize emin misiniz?")) return;
        try {
            await axiosInstance.delete(`/posts/${post._id}`);
            // Parent component'e (FeedPage) haber ver
            if (onPostDeleted) onPostDeleted(post._id);
        } catch (error) {
            console.error('Silme hatası:', error);
            alert('Gönderi silinemedi.');
        }
    };


    const handleLike = async () => {
        try {
            const res = await axiosInstance.post(`/posts/${post._id}/like`);
            onPostUpdated(res.data.data);
        } catch (error) {
            console.error('Like atılamadı:', error);
        }
    };

    const handleDislike = async () => {
        try {
            const res = await axiosInstance.post(`/posts/${post._id}/dislike`);
            onPostUpdated(res.data.data);
        } catch (error) {
            console.error('Dislike atılamadı:', error);
        }
    };

    const onCommentAdded = (newComment) => {
        const updatedPost = {
            ...post,
            comments: [...post.comments, newComment],
        };
        onPostUpdated(updatedPost);
    };

    return (
        <article className="post-card">
            <header className="post-header">
                <div className="post-author-avatar">
                    <img
                        src={avatarSrc}
                        alt={`${post?.user?.username || 'Kullanıcı'} avatarı`}
                        onError={handleAvatarErrorSafe}
                    />
                </div>
                <div className="post-author-details">
                    <strong className="post-author-name">{post?.user?.username || 'Kullanıcı'}</strong>
                    <time className="post-date" dateTime={post.createdAt}>
                        {new Date(post.createdAt).toLocaleString()}
                    </time>
                </div>

                {/* 👇 SİLME BUTONU (Sadece Sahibi Görür) */}
                {isOwner && (
                    <button
                        onClick={handleDelete}
                        title="Gönderiyi Sil"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ed4245', // Kırmızı
                            cursor: 'pointer',
                            padding: '5px',
                            borderRadius: '50%',
                            transition: 'background 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(237, 66, 69, 0.1)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <TrashIcon style={{width: '20px', height: '20px'}} />
                    </button>
                )}
            </header>

            <div className="post-content">
                <p>{post.content}</p>

                {post.mediaUrl && post.mediaType === 'image' && (
    <img
        src={mediaSrc}
        alt={post.content || 'Gönderi görseli'}
        className="post-media"
        onError={(e) => {
            // Resim yüklenemezse tamamen gizle
            if (e?.target) {
                e.target.style.display = 'none';
            }
        }}
    />
)}

                {post.mediaUrl && post.mediaType === 'video' && (
                    <video controls src={mediaSrc} className="post-media" />
                )}
            </div>

            <div className="post-actions">
                <button
                    type="button"
                    onClick={handleLike}
                    className={`post-action-button ${isLiked ? 'is-active' : ''}`}
                    aria-pressed={isLiked}
                >
                    👍 <span>Like ({post.likes.length})</span>
                </button>
                <button
                    type="button"
                    onClick={handleDislike}
                    className={`post-action-button ${isDisliked ? 'is-active' : ''}`}
                    aria-pressed={isDisliked}
                >
                    👎 <span>Dislike ({post.dislikes.length})</span>
                </button>
                <button
                    type="button"
                    onClick={() => setShowComments(!showComments)}
                    className={`post-action-button ${showComments ? 'is-active' : ''}`}
                    aria-expanded={showComments}
                >
                    💬 <span>Yorumlar ({post.comments.length})</span>
                </button>
            </div>

            {showComments && (
                <CommentSection
                    postId={post._id}
                    initialComments={post.comments}
                    onCommentAdded={onCommentAdded}
                    getAvatarUrl={getAvatarUrl}
                    handleAvatarError={handleAvatarError}
                />
            )}
        </article>
    );
};

export default PostCard;