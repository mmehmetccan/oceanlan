const express = require('express');
const router = express.Router();

const { joinServerWithInvite } = require('../../controllers/inviteController');
const { protect } = require('../../middleware/authMiddleware');

// POST /api/v1/invites/:inviteCode
// Bir kullanıcının davet koduyla katılması
router.post('/:inviteCode', protect, joinServerWithInvite);

module.exports = router;