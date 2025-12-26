// src/components/feed/CommentItem.jsx
import React from 'react';
import { getFullImageUrl } from '../../utils/urlHelper';
import UserLevelTag from '../gamification/UserLevelTag';
import '../../styles/FeedPage.css';

const FALLBACK_AVATAR = '/default-avatar.png';

const CommentItem = ({ comment, getAvatarUrl, handleAvatarError, onOpenProfile }) => {
  const commentUser = comment.author || comment.user || {};

  const avatarPath = commentUser.avatarUrl || commentUser.avatar;
  const avatarSrc = getFullImageUrl(avatarPath);

  const handleAvatarErrorSafe = (event) => {
    if (typeof handleAvatarError === 'function') {
      handleAvatarError(event);
      return;
    }
    if (event?.target) {
      event.target.src = FALLBACK_AVATAR;
    }
  };

  // ✅ EKLENDİ
  const openCommentUserProfile = (e) => {
    e?.stopPropagation?.();
    if (typeof onOpenProfile !== 'function') return;

    const id = commentUser?._id || commentUser?.id;
    if (!id) return;

    onOpenProfile(commentUser);
  };

  return (
    <div className="comment-item">
      {/* ✅ Avatar tıklanınca profil */}
      <div
        className="comment-avatar"
        onClick={openCommentUserProfile}
        style={{ cursor: 'pointer' }}
        title="Profili Görüntüle"
      >
        <img
          src={avatarSrc}
          alt={`${commentUser.username || 'Yorumcu'} avatarı`}
          onError={handleAvatarErrorSafe}
        />
      </div>

      <div className="comment-body">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
          <strong
            className="comment-author"
            onClick={openCommentUserProfile}
            style={{ cursor: 'pointer' }}
            title="Profili Görüntüle"
          >
            {commentUser.username || 'Bilinmeyen Kullanıcı'}
          </strong>
          {/* 👇 LEVEL EKLENDİ */}
          <UserLevelTag
            level={commentUser.level}
            activeBadge={commentUser?.activeBadge}
          />
        </div>

        <span className="comment-content">{comment.content}</span>
      </div>
    </div>
  );
};

export default CommentItem;
