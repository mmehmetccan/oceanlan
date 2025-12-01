const express = require('express');
const router = express.Router();
const { protect } = require('../../middleware/authMiddleware');
const { sendContactEmail } = require('../../controllers/contactController');

router.post('/', protect, sendContactEmail);

module.exports = router;