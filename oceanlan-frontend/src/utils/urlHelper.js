// src/utils/urlHelper.js

// Canlı sunucu adresi
const API_BASE_URL = 'https://oceanlan.com';

// Varsayılan resmin tam internet adresi
// (Resmi /uploads klasörüne attığından emin ol!)
export const DEFAULT_AVATAR_URL = `${API_BASE_URL}/uploads/default-avatar.png`;

export const getImageUrl = (path) => {
  // 1. Eğer veritabanında resim yoksa -> Varsayılanı döndür
  if (!path) {
    return DEFAULT_AVATAR_URL;
  }

  // 2. Eğer veritabanında eski bir "default" kaydı varsa -> Varsayılanı döndür
  if (path === '/default-avatar.png' || path === 'default-avatar.png') {
      return DEFAULT_AVATAR_URL;
  }

  // 3. Eğer zaten tam bir link ise (https://...) dokunma
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }

  // 4. Standart sunucu yolu (Başına slash ekleyerek birleştir)
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
};

// Eski kodlarla uyumluluk için
export const getFullImageUrl = getImageUrl;