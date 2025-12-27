const express = require('express');
const router = express.Router();

// Controller'ı içe aktar
const {
    createServer,
    generateInviteCode,
    getServerDetails,
    getUserServers,
    deleteServer,
    updateServerIcon, // Bu fonksiyon controller'da olmalı
    getBannedUsers,
    unbanUser,
    updateServer,
    getServerRequests,
    respondToServerRequest,
    getDiscoverServers,
} = require('../../controllers/serverController');

// Koruma (Giriş yapma) middleware'ini içe aktar
const { protect } = require('../../middleware/authMiddleware');

// İzin kontrolü ve Multer
const { checkPermission } = require('../../middleware/permissionMiddleware');
const { upload, resizeServerIcon } = require('../../middleware/serverIconMiddleware');

// --- Rotalar ---

// POST /api/v1/servers (Sunucu Oluşturma)
// EKLENDİ: upload.single('icon') ve resizeServerIcon
router.post('/',
    protect,
    upload.single('icon'), // Frontend'den 'icon' adıyla dosya bekler
    resizeServerIcon,      // Resmi işler
    createServer
);

router.get('/', protect, getUserServers);

router.get('/discover/all', protect, getDiscoverServers);

// POST /api/v1/servers/:serverId/invite
router.post('/:serverId/invite', protect, generateInviteCode);

// PUT /api/v1/servers/:serverId/icon (Mevcut ikonu güncelleme)
router.put(
    '/:serverId/icon',
    protect,
    // checkPermission('MANAGE_SERVER'), // İstersen açabilirsin
    upload.single('icon'),
    resizeServerIcon,
    updateServerIcon
);

router.put('/:serverId', protect, updateServer);

// Sunucu İstek Yönetimi Rotaları
router.get('/:serverId/requests', protect, getServerRequests);
router.post('/:serverId/requests/:requestId', protect, respondToServerRequest);

// Ban Yönetimi
router.get('/:serverId/bans', protect, getBannedUsers);
router.delete('/:serverId/bans/:userId', protect, unbanUser);

// Sunucu Detay ve Silme
router.get('/:serverId', protect, getServerDetails);
router.route('/:serverId')
    .get(protect, getServerDetails)
    .delete(protect, deleteServer);

module.exports = router;