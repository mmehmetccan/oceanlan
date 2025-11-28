// src/middleware/postUploadMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Kayıt Yolu (Örn: /uploads/post_media)
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'post_media');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`[MULTER-POST]: Gönderi yükleme klasörü oluşturuldu: ${uploadDir}`);
}

// Dosyayı diske değil, hafızaya al (işleyebilmek için)
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 50 } // 50MB limit
});

// Resim işleme middleware'i
const resizePostMedia = async (req, res, next) => {
    if (!req.file) {
        return next(); // Dosya yoksa devam et (sadece metin gönderisi)
    }

    const userId = req.user.id; // protect middleware'inden
    const originalMimetype = req.file.mimetype;

    try {
        // VİDEO İSE: Sadece kaydet
        if (originalMimetype.startsWith('video')) {
            const ext = path.extname(req.file.originalname) || '.mp4';
            const filename = `post_user_${userId}_${Date.now()}${ext}`;
            const filePath = path.join(uploadDir, filename);

            await fs.promises.writeFile(filePath, req.file.buffer);

            req.file.filename = filename; // Controller'a dosya adını ilet
            req.file.mediaType = 'video';
            return next();
        }

        // RESİM İSE: Sharp ile işle
        if (originalMimetype.startsWith('image')) {
            const newFilename = `post_user_${userId}_${Date.now()}.webp`;
            const newFilePath = path.join(uploadDir, newFilename);

            await sharp(req.file.buffer)
                .resize({ width: 1080, fit: 'inside', withoutEnlargement: true }) // 1080p genişlik
                .toFormat('webp', { quality: 85 })
                .toFile(newFilePath);

            req.file.filename = newFilename;
            req.file.mimetype = 'image/webp';
            req.file.mediaType = 'image';

            return next();
        }

        return next(new Error('Sadece resim veya video dosyaları yüklenebilir!'));

    } catch (error) {
        return next(error);
    }
};

module.exports = {
    upload,
    resizePostMedia
};