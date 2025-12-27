const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// === UPLOAD DİZİNİ (KESİN YOL) ===
const uploadDir = path.join(process.cwd(), 'uploads', 'post_media');

// Klasör yoksa oluştur
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// === MULTER (MEMORY) ===
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 * 50 } // 50MB
});

// === MEDIA İŞLEME ===
const resizePostMedia = async (req, res, next) => {
    if (!req.file) return next();

    const userId = req.user?.id;
    const mimetype = req.file.mimetype;

    if (!userId) {
        return next(new Error('USER ID YOK'));
    }

    try {
        // ===== VIDEO =====
        if (mimetype.startsWith('video/')) {
            const ext = path.extname(req.file.originalname) || '.mp4';
            const filename = `post_user_${userId}_${Date.now()}${ext}`;
            const filepath = path.join(uploadDir, filename);

            await fs.promises.writeFile(filepath, req.file.buffer);

            req.file.filename = filename;
            req.file.mediaType = 'video';
            return next();
        }

        // ===== IMAGE (PNG / JPG / WEBP vs) =====
        if (mimetype.startsWith('image/')) {
            const filename = `post_user_${userId}_${Date.now()}.webp`;
            const filepath = path.join(uploadDir, filename);

            await sharp(req.file.buffer)
                .rotate() // orientation fix
                .resize({
                    width: 1080,
                    withoutEnlargement: true
                })
                .webp({ quality: 85 })
                .toFile(filepath);

            req.file.filename = filename;
            req.file.mimetype = 'image/webp';
            req.file.mediaType = 'image';
            return next();
        }

        return next(new Error('DESTEKLENMEYEN DOSYA TÜRÜ'));

    } catch (err) {
        return next(err);
    }
};

module.exports = {
    upload,
    resizePostMedia
};
