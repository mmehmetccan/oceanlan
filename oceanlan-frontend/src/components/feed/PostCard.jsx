// src/components/feed/PostCard.jsx
import React, { useState, useContext } from 'react';
import axiosInstance from '../../utils/axiosInstance';
import { AuthContext } from '../../context/AuthContext';
import CommentSection from './CommentSection';
import { getFullImageUrl } from '../../utils/urlHelper';
import { TrashIcon } from '@heroicons/react/24/outline';
import UserLevelTag from '../gamification/UserLevelTag';

import '../../styles/FeedPage.css';

const DEFAULT_AVATAR = '/default-avatar.png';

const PostCard = ({
  post,
  onPostUpdated,
  onPostDeleted,
  onDeleteClick,
  getAvatarUrl,
  handleAvatarError,

  // ✅ EKLENDİ: dışarıdan profil açma
  onOpenProfile
}) => {
  const { user } = useContext(AuthContext);
  const [showComments, setShowComments] = useState(false);

  const currentUserId = user?._id || user?.id;

  const isLiked = currentUserId ? post.likes.some(id => String(id) === String(currentUserId)) : false;
  const isDisliked = currentUserId ? post.dislikes.some(id => String(id) === String(currentUserId)) : false;

  const postUserId = post.user?._id || post.user;
  const isOwner = String(postUserId) === String(currentUserId);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const avatarRaw = post?.user?.avatarUrl || post?.user?.avatar;
  const avatarSrc = getFullImageUrl(avatarRaw);

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

  // ✅ EKLENDİ: bu postun sahibinin profilini aç
  const openPostOwnerProfile = (e) => {
    e?.stopPropagation?.();
    if (typeof onOpenProfile !== 'function') return;

    // post.user bazen populated, bazen sadece id olabilir
    const u = post?.user && typeof post.user === 'object'
      ? post.user
      : { _id: postUserId };

    onOpenProfile(u);
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
        {/* ✅ Avatar tıklanınca profil */}
        <div
          className="post-author-avatar"
          onClick={openPostOwnerProfile}
          style={{ cursor: 'pointer' }}
          title="Profili Görüntüle"
        >
          {/* 👇 LEVEL EKLENDİ */}
          <img
            src={avatarSrc}
            alt={`${post?.user?.username || 'Kullanıcı'} avatarı`}
            onError={handleAvatarErrorSafe}
          />

        </div>

        <div className="post-author-details">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <strong
              className="post-author-name"
              onClick={openPostOwnerProfile}
              style={{ cursor: 'pointer' }}
              title="Profili Görüntüle"
            >
              {post?.user?.username || 'Kullanıcı'}
            </strong>
            {/* 👇 LEVEL EKLENDİ */}
            <UserLevelTag
              level={post?.user?.level}
              activeBadge={post?.user?.activeBadge}
            />
          </div>

          <time className="post-date" dateTime={post.createdAt}>
            {new Date(post.createdAt).toLocaleString()}
          </time>
        </div>
        {isOwner && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick?.();
            }}
            title="Gönderiyi Sil"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ed4245',
              cursor: 'pointer',
              padding: '5px',
              borderRadius: '50%',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(237, 66, 69, 0.1)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <TrashIcon style={{ width: '20px', height: '20px' }} />
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

          onOpenProfile={onOpenProfile} // ✅ EKLENDİ (yorumlar da tıklanınca açsın)
        />
      )}
    </article>
  );
};

export default PostCard;
