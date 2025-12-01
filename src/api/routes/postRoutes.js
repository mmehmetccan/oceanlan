// src/api/routes/postRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/authMiddleware');
const { upload, resizePostMedia } = require('../../middleware/postUploadMiddleware');

const {
    createPost,
    getFeed,
    likePost,
    dislikePost,
    addComment,
    deletePost
} = require('../../controllers/postController');

// Ana 'feed' rotası
router.route('/feed').get(protect, getFeed);

// Yeni gönderi oluşturma (Dosya yükleme middleware'i ile)
router.route('/')
    .post(protect, upload.single('file'), resizePostMedia, createPost);

// Etkileşim rotaları
router.route('/:postId/like').post(protect, likePost);
router.route('/:postId/dislike').post(protect, dislikePost);
router.route('/:postId/comment').post(protect, addComment);
router.route('/:postId').delete(protect, deletePost);
module.exports = router;