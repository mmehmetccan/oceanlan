// src/middleware/chatUploadMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp'); // 1. Sharp'ı import et

// Yükleme klasörünün yolu
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'chat_attachments');

// Klasörün varlığını kontrol et
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`[MULTER-CHAT]: Sohbet yükleme klasörü oluşturuldu: ${uploadDir}`);
}

// 2. DEĞİŞİKLİK: Dosyayı diske değil, hafızaya al (işleyebilmek için)
const storage = multer.memoryStorage();

// 3. DEĞİŞİKLİK: fileFilter'ı buradan kaldırıyoruz
const upload = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 50 } // 50MB limit (videolar/büyük resimler için)
});

// 4. YENİ RESİM İŞLEME MİDDLEWARE'İ
const resizeChatMedia = async (req, res, next) => {
    // Dosya yoksa veya server/channel ID'leri yoksa devam et
    if (!req.file || !req.params.serverId || !req.params.channelId) {
        return next();
    }

    const { serverId, channelId } = req.params;
    const originalMimetype = req.file.mimetype;

    try {
        // A. EĞER VİDEO İSE: Yeniden boyutlandırma yapma, sadece kaydet
        if (originalMimetype.startsWith('video')) {
            const ext = path.extname(req.file.originalname) || '.mp4';
            const filename = `${serverId}_${channelId}_${Date.now()}${ext}`;
            const filePath = path.join(uploadDir, filename);

            // Hafızadaki dosyayı (buffer) diske yaz
            await fs.promises.writeFile(filePath, req.file.buffer);

            // Controller'ın kullanması için dosya adını req.file'a ekle
            req.file.filename = filename;
            return next();
        }

        // B. EĞER RESİM İSE: Sharp ile yeniden boyutlandır ve optimize et
        if (originalMimetype.startsWith('image')) {
            // Yeni dosya adını .webp formatında oluştur (daha modern ve küçük)
            const newFilename = `${serverId}_${channelId}_${Date.now()}.webp`;
            const newFilePath = path.join(uploadDir, newFilename);

            await sharp(req.file.buffer)
                .resize({
                    width: 1200, // Maksimum 1200px genişlik
                    fit: 'inside', // En/boy oranını koru
                    withoutEnlargement: true // Resim küçükse büyütme
                })
                .toFormat('webp', { quality: 80 }) // WebP formatı, %80 kalite
                .toFile(newFilePath);

            // Controller'ın doğru dosyayı DB'ye kaydetmesi için req.file'ı güncelle
            req.file.filename = newFilename; // Yeni dosya adı
            req.file.mimetype = 'image/webp'; // Yeni dosya tipi

            return next();
        }

        // C. Desteklenmeyen dosya tipi
        return next(new Error('Sadece resim veya video dosyaları yüklenebilir!'));

    } catch (error) {
        console.error("Dosya işleme hatası:", error);
        return next(error);
    }
};

const resizeDmMedia = async (req, res, next) => {
    // Dosya yoksa veya conversationId yoksa geç
    if (!req.file || !req.params.conversationId) {
        return next();
    }

    const { conversationId } = req.params;
    const originalMimetype = req.file.mimetype;

    try {
        // VİDEO İSE
        if (originalMimetype.startsWith('video')) {
            const ext = path.extname(req.file.originalname) || '.mp4';
            // Dosya isimlendirmesi: dm_CONVID_TIMESTAMP.ext
            const filename = `dm_${conversationId}_${Date.now()}${ext}`;
            const filePath = path.join(uploadDir, filename);

            await fs.promises.writeFile(filePath, req.file.buffer);
            req.file.filename = filename;
            return next();
        }

        // RESİM İSE
        if (originalMimetype.startsWith('image')) {
            const newFilename = `dm_${conversationId}_${Date.now()}.webp`;
            const newFilePath = path.join(uploadDir, newFilename);

            await sharp(req.file.buffer)
                .resize({ width: 1200, fit: 'inside', withoutEnlargement: true })
                .toFormat('webp', { quality: 80 })
                .toFile(newFilePath);

            req.file.filename = newFilename;
            req.file.mimetype = 'image/webp';
            return next();
        }

        return next(new Error('Sadece resim veya video dosyaları yüklenebilir!'));

    } catch (error) {
        console.error("DM Dosya işleme hatası:", error);
        return next(error);
    }
};

module.exports = {
    upload, // upload.single('file') olarak kullanılacak
    resizeChatMedia,  // Hemen ardından çalıştırılacak
    resizeDmMedia
};