// src/middleware/multerConfig.js

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Kayıt Yolu (Örn: uploads/avatars)
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'avatars');

// Klasörün varlığını kontrol et, yoksa oluştur
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`[MULTER]: Yükleme klasörü oluşturuldu: ${uploadDir}`);
}

// 1. Depolama Ayarları
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Dosyanın kaydedileceği yer
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Dosya adı: user_ID_timestamp.uzantı
        const ext = path.extname(file.originalname);
        const filename = `user_${req.user.id}_${Date.now()}${ext}`;
        cb(null, filename);
    }
});

// 2. Filtreleme Ayarları (Sadece resim dosyalarına izin ver)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image')) {
        cb(null, true);
    } else {
        cb(null, false); // Resim değilse reddet
    }
};

// 3. Multer'ı yapılandır
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1024 * 1024 * 5 // 5MB limit
    }
});

module.exports = upload;