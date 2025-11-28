// src/utils/urlHelper.js

// .env dosyasındaki adresi al (yoksa varsayılan)
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// API adresinin sonunda /api/v1 varsa onu temizleyip saf kök adresi (http://localhost:3000) buluyoruz.
// Çünkü resimler /api/v1/uploads değil, direkt /uploads altındadır.
export const SERVER_ROOT = API_BASE.replace('/api/v1', '');

/**
 * Verilen resim yolunu tam URL'e çevirir.
 * @param {string} path - Veritabanından gelen resim yolu (örn: /uploads/avatar.png)
 * @returns {string} - Tam URL (örn: http://localhost:3000/uploads/avatar.png)
 */
export const getFullImageUrl = (path) => {
  if (!path) return '/default-avatar.png'; // Varsayılan resim

  // Eğer zaten tam bir URL ise (örn: https://google.com/logo.png) dokunma
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Eğer yol '/uploads' ile başlıyorsa başına sunucu kök adresini ekle
  if (path.startsWith('/uploads')) {
    return `${SERVER_ROOT}${path}`;
  }

  return path;
};