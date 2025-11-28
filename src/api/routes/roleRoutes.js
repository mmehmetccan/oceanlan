// src/api/routes/roleRoutes.js
const express = require('express');
const router = express.Router({ mergeParams: true }); // serverId'yi alabilmek için
const { protect } = require('../../middleware/authMiddleware');

const {
  createRole,
  updateRole,
  deleteRole,
} = require('../../controllers/roleController');

// Sunucuya bağlı roller
// POST /api/v1/servers/:serverId/roles
router.route('/').post(protect, createRole);

// Belirli bir role yönelik işlemler
// PUT /api/v1/roles/:roleId
// DELETE /api/v1/roles/:roleId
router.route('/:roleId')
    .put(protect, updateRole)
    .delete(protect, deleteRole);

module.exports = router;