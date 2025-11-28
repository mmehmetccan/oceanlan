const express = require('express');
const router = express.Router();

const {
  sendFriendRequest,
  getPendingRequests,
  respondToFriendRequest,
  getOrCreateConversation,
  getFriends,
  getDmMessages,
  removeFriend,
    sendPrivateFileMessage,
} = require('../../controllers/friendController');
const { protect } = require('../../middleware/authMiddleware');
const { upload, resizeDmMedia } = require('../../middleware/chatUploadMiddleware');

router.get('/', protect, getFriends);
router.get('/requests/pending', protect, getPendingRequests);
router.post('/requests/:requestId', protect, respondToFriendRequest);

router.post(['/request', '/requests'], protect, sendFriendRequest);

router.post('/remove', protect, removeFriend);
router.delete('/:friendId', protect, removeFriend);

router.post('/dm/:friendId', protect, getOrCreateConversation);
router.get('/dm/:conversationId/messages', protect, getDmMessages);
router.post(
    '/dm/:conversationId/file',
    protect,
    upload.single('file'), // Multer
    resizeDmMedia,         // Sharp (DM için özel)
    sendPrivateFileMessage // Controller
);

module.exports = router;
