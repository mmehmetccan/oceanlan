// src/components/feed/CommentItem.jsx
import React, { useContext } from 'react';
import { getFullImageUrl } from '../../utils/urlHelper';
import UserLevelTag from '../gamification/UserLevelTag';
import { AuthContext } from '../../context/AuthContext'; // ✅ EKLENDİ
import { TrashIcon } from '@heroicons/react/24/outline'; // ✅ EKLENDİ
import '../../styles/FeedPage.css';

const FALLBACK_AVATAR = '/default-avatar.png';

const CommentItem = ({ comment, getAvatarUrl, handleAvatarError, onOpenProfile, onDelete }) => {

  const { user } = useContext(AuthContext); // ✅ Mevcut kullanıcıyı al
  const currentUserId = user?._id || user?.id;

  const commentUser = comment.author || comment.user || {};
  const commentUserId = commentUser._id || commentUser.id;

  // ✅ Bu yorum benim mi?
  const isMyComment = String(currentUserId) === String(commentUserId);

  const avatarPath = commentUser.avatarUrl || commentUser.avatar;
  const avatarSrc = getFullImageUrl(avatarPath);

  const handleAvatarErrorSafe = (event) => {
    if (event?.target) event.target.src = FALLBACK_AVATAR;
  };

  const openCommentUserProfile = (e) => {
    e?.stopPropagation?.();
    if (typeof onOpenProfile === 'function') onOpenProfile(commentUser);
  };

  return (
    <div className="comment-item" style={{ position: 'relative' }}> {/* Relative pozisyon ekledik */}

      <div
        className="comment-avatar"
        onClick={openCommentUserProfile}
        style={{ cursor: 'pointer' }}
        title="Profili Görüntüle"
      >
        <img src={avatarSrc} alt="avatar" onError={handleAvatarErrorSafe} />
      </div>

      <div className="comment-body" style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2px', justifyContent: 'space-between' }}>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <strong
              className="comment-author"
              onClick={openCommentUserProfile}
              style={{ cursor: 'pointer' }}
            >
              {commentUser.username || 'Bilinmeyen Kullanıcı'}
            </strong>
            <UserLevelTag level={commentUser.level} activeBadge={commentUser?.activeBadge} />
          </div>

          {/* ✅ SİLME BUTONU (Sadece sahibi görür) */}
          {isMyComment && (
            <button
              onClick={() => onDelete(comment._id)}
              title="Yorumu Sil"
              style={{
                background: 'transparent', border: 'none', color: '#72767d',
                cursor: 'pointer', padding: '2px', marginLeft: '10px'
              }}
              onMouseOver={(e) => e.currentTarget.style.color = '#ed4245'}
              onMouseOut={(e) => e.currentTarget.style.color = '#72767d'}
            >
              <TrashIcon style={{ width: '14px', height: '14px' }} />
            </button>
          )}

        </div>

        <span className="comment-content">{comment.content}</span>
      </div>
    </div>
  );
};

export default CommentItem;