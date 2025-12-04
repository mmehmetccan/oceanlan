// src/utils/urlHelper.js

// .env dosyasındaki adresi al (yoksa varsayılan)
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// API adresinin sonunda /api veya /api/v1 varsa onu temizleyip
// saf kök adresi (http://localhost:3000, https://oceanlan.com) buluyoruz.
export const SERVER_ROOT = API_BASE.replace(/\/api(\/v1)?\/?$/, '');

/**
 * Verilen resim yolunu tam URL'e çevirir.
 * @param {string} path - Veritabanından gelen resim yolu (örn: /uploads/avatar.png
 *                        veya http://localhost:4000/uploads/avatar.png)
 * @returns {string} - Tam URL (örn: https://oceanlan.com/uploads/avatar.png)
 */
export const getFullImageUrl = (path) => {
  if (!path) return '/default-avatar.png'; // Varsayılan resim

  // Eğer zaten tam bir URL ise (örn: https://google.com/logo.png)
  if (path.startsWith('http://') || path.startsWith('https://')) {
    try {
      const url = new URL(path);

      // 1) Eski localhost linklerini prod domain'e çevir
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        // Sadece path kısmını alıp SERVER_ROOT ile birleştiriyoruz
        return `${SERVER_ROOT}${url.pathname}`;
      }

      // 2) oceanlan.com ama http ise → https'e yükselt
      if (url.hostname.endsWith('oceanlan.com') && url.protocol === 'http:') {
        return `https://${url.host}${url.pathname}`;
      }

      // Diğer dış URL'lere dokunma (ör: başka site linki)
      return path;
    } catch (e) {
      // URL parse edilemezse orijinali döndür
      return path;
    }
  }

  // Eğer yol '/uploads' ile başlıyorsa başına sunucu kök adresini ekle
  if (path.startsWith('/uploads')) {
    return `${SERVER_ROOT}${path}`;
  }

  // Diğer relative path'leri aynen döndür
  return path;
};
