// src/api/routes/userRoutes.js

const express = require('express');
const router = express.Router();

const { protect } = require('../../middleware/authMiddleware');
const {
  getMe,
  updateMe,
  updateProfilePicture,
  getUserProfile,
  verifyNewEmail,
  equipBadge,
  handleSteamCallback,
  getSteamStatus,
  redirectToSteam,
} = require('../../controllers/userController');
const upload = require('../../middleware/multerConfig');

// GET /api/v1/users/me (login olan kullanıcının bilgileri)
router.get('/me', protect, getMe);

// GET /api/v1/users/:userId/profile (başkasının profili)
router.get('/:userId/profile', protect, getUserProfile);

// PUT /api/v1/users/me (Ayarları güncelle)
router.put('/me', protect, updateMe);
router.put('/verify-new-email/:token', verifyNewEmail);

router.put('/equip-badge', protect, equipBadge);
// PUT /api/v1/users/me/avatar (Fotoğraf yükleme)
router.put(
  '/me/avatar',
  protect,
  upload.single('avatar'),
  updateProfilePicture
);

router.get('/auth/steam', protect, (req, res) => {
    const returnUrl = `https://oceanlan.com/api/v1/users/auth/steam/callback`;
    const realm = `https://oceanlan.com`;
    const redirectUrl = `https://steamcommunity.com/openid/login?openid.ns=http://specs.openid.net/auth/2.0&openid.mode=checkid_setup&openid.return_to=${returnUrl}&openid.realm=${realm}&openid.identity=http://specs.openid.net/auth/2.0/identifier_select`;
    res.redirect(redirectUrl);
});

router.get('/auth/steam', protect, redirectToSteam);
// Steam Callback (Steam'den gelen yanıtı işler)
router.get('/auth/steam/callback', handleSteamCallback);
// Steam Profil Bilgisi
router.get('/:userId/steam-status', protect, getSteamStatus);

module.exports = router;
