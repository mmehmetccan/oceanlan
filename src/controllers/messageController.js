// api/controllers/messageController.js (EKLENMESİ GEREKEN)
const PrivateMessage = require('../models/PrivateMessageModel'); // DM mesaj modelini ekleyin

// @desc    Özel sohbetin (DM) mesaj geçmişini getirir
// @route   GET /api/v1/friends/dm/:conversationId/messages
// @access  Private
const getDmMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const messages = await PrivateMessage.find({ conversation: conversationId })
      .sort('createdAt') // Mesajları kronolojik sıraya koy
      .populate('author', 'username'); // Yazarın sadece kullanıcı adını doldur

    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'DM mesajları çekilemedi', error: error.message });
  }
};

module.exports = {
  // ... (Diğer fonksiyonlarınız)
  getDmMessages, // BURAYI DIŞARI AKTARMAYI UNUTMAYIN
};