// src/middleware/serverIconMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Kayıt Yolu
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'server_icons');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`[MULTER-SERVER]: Sunucu ikon klasörü oluşturuldu: ${uploadDir}`);
}

const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 5 } // 5MB limit
});

const resizeServerIcon = async (req, res, next) => {
    if (!req.file) return next();

    const { serverId } = req.params;
    if (!serverId) return next();

    try {
        const filename = `server_${serverId}_${Date.now()}.webp`;
        const filePath = path.join(uploadDir, filename);

        await sharp(req.file.buffer)
            .resize({ width: 512, height: 512, fit: 'cover' }) // Kare ve net olsun
            .toFormat('webp', { quality: 90 })
            .toFile(filePath);

        req.file.filename = filename;
        next();
    } catch (error) {
        console.error('Sunucu resmi işleme hatası:', error);
        next(error);
    }
};

module.exports = { upload, resizeServerIcon };