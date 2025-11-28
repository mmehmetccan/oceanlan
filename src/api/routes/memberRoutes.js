// src/api/routes/memberRoutes.js
const express = require('express');
const router = express.Router({ mergeParams: true }); // serverId'yi alabilmek için
const { protect } = require('../../middleware/authMiddleware');
const { checkPermission } = require('../../middleware/permissionMiddleware');
const { kickMember, updateMemberRoles ,updateMemberStatus,banMember} = require('../../controllers/memberController');
// const { checkPermission } = require('../../middleware/permissionMiddleware');

// DELETE /api/v1/servers/:serverId/members/:memberId (Kick)
router.route('/:memberId').delete(protect, /* checkPermission('KICK_MEMBERS'), */ kickMember);

// PUT /api/v1/servers/:serverId/members/:memberId/roles (Rol güncelleme)
router.route('/:memberId/roles').put(protect, /* checkPermission('MANAGE_ROLES'), */ updateMemberRoles);
router.route('/:memberId/status')
    .put(protect, checkPermission('MUTE_MEMBERS'), updateMemberStatus);

router.route('/:memberId/ban').post(protect, checkPermission('BAN_MEMBERS'), banMember);

module.exports = router;