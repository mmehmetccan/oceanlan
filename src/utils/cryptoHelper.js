// src/utils/cryptoHelper.js
const crypto = require('crypto');

// Çökmemesi için değerlerin varlığını kontrol ediyoruz
const secretKey = process.env.ENCRYPTION_KEY;
const secretIV = process.env.ENCRYPTION_IV;

if (!secretKey || !secretIV) {
    throw new Error("KRİTİK HATA: .env dosyasında ENCRYPTION_KEY veya ENCRYPTION_IV eksik!");
}

const algorithm = 'aes-256-cbc';
// Buffer oluştururken değerleri doğrudan kullanıyoruz
const key = Buffer.from(secretKey);
const iv = Buffer.from(secretIV);

function encrypt(text) {
    let cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted.toString('hex');
}

function decrypt(text) {
    let encryptedText = Buffer.from(text, 'hex');
    let decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

module.exports = { encrypt, decrypt };