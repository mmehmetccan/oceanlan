const express = require('express');
// ÖNEMLİ: { mergeParams: true } ayarı, bu rotanın
// 'index.js'deki :serverId gibi parametreleri almasını sağlar.
const router = express.Router({ mergeParams: true });

const { createChannel ,getChannelMessages,updateChannel,deleteChannel,sendFileMessage} = require('../../controllers/channelController');
const { protect } = require('../../middleware/authMiddleware');
const { checkPermission } = require('../../middleware/permissionMiddleware');
const { upload, resizeChatMedia } = require('../../middleware/chatUploadMiddleware');
// POST /api/v1/servers/:serverId/channels
// Bu rota 'protect' ile korunur ve 'createChannel'ı çalıştırır
router.route('/')
    .post(protect, checkPermission('MANAGE_CHANNELS'), createChannel);


router.post('/servers/:serverId/channels', protect, createChannel);


router.get('/:channelId/messages', protect, getChannelMessages);


router.route('/:channelId')
    .put(protect, checkPermission('MANAGE_CHANNELS'), updateChannel)
    .delete(protect, checkPermission('MANAGE_CHANNELS'), deleteChannel);

router.route('/:channelId/file')
    .post(
        protect,
        upload.single('file'), // 1. Multer (dosyayı hafızaya alır)
        resizeChatMedia,       // 2. Sharp (resmi işler, videoyu kaydeder)
        sendFileMessage        // 3. Controller (DB'ye kaydeder)
    );


module.exports = router;