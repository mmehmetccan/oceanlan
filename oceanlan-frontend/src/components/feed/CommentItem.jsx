// src/components/feed/CommentItem.jsx
import React from 'react';
import { getFullImageUrl } from '../../utils/urlHelper';
import '../../styles/FeedPage.css';

const FALLBACK_AVATAR = '/default-avatar.png';

const CommentItem = ({ comment, getAvatarUrl, handleAvatarError }) => {

    const commentUser = comment.author || comment.user || {};

    // URL Düzeltme
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

    return (
        <div className="comment-item">
            <div className="comment-avatar">
                <img
                    src={avatarSrc}
                    alt={`${commentUser.username || 'Yorumcu'} avatarı`}
                    onError={handleAvatarErrorSafe}
                />
            </div>
            <div className="comment-body">
                <strong className="comment-author">{commentUser.username || 'Bilinmeyen Kullanıcı'}</strong>
                <span className="comment-content">{comment.content}</span>
            </div>
        </div>
    );
};

export default CommentItem;