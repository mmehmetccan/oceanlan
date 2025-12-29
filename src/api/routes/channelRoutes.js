// src/api/routes/channelRoutes.js

const express = require('express');
// mergeParams: true ÖNEMLİDİR. index.js'den gelen :serverId parametresini içeri alır.
const router = express.Router({ mergeParams: true });

// 🟢 TÜM FONKSİYONLARI ARTIK channelController'dan ÇEKİYORUZ
const {
    createChannel,
    getChannelMessages,
    updateChannel,
    deleteChannel,
    sendFileMessage,
    deleteChannelMessage
} = require('../../controllers/channelController');

const { protect } = require('../../middleware/authMiddleware');
const { upload, resizeChatMedia } = require('../../middleware/chatUploadMiddleware');

// Not: checkPermission'ı import etmedik, kontrolü içeride yapacağız.

// 🟢 KANAL OLUŞTURMA
// POST /api/v1/servers/:serverId/channels
router.route('/')
    .post(protect, createChannel);

// 🟢 KANAL GÜNCELLEME VE SİLME
// PUT/DELETE /api/v1/servers/:serverId/channels/:channelId
router.route('/:channelId')
    .put(protect, updateChannel)   // checkPermission KALDIRILDI -> Controller'da bakılacak
    .delete(protect, deleteChannel); // checkPermission KALDIRILDI -> Controller'da bakılacak

// KANAL MESAJLARI
router.get('/:channelId/messages', protect, getChannelMessages);

// DOSYA GÖNDERME
router.route('/:channelId/file')
    .post(
        protect,
        upload.single('file'),
        resizeChatMedia,
        sendFileMessage
    );

// MESAJ SİLME
router.delete(
    '/:channelId/messages/:messageId',
    protect,
    deleteChannelMessage
);

module.exports = router;