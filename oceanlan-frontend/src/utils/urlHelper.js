// src/utils/urlHelper.js

// 🌍 CANLI SUNUCU ADRESİ (Burası çok önemli, hep buraya bakacaklar)
const API_BASE_URL = 'https://oceanlan.com';

export const getImageUrl = (path) => {
  // 1. Resim yoksa varsayılanı döndür
  if (!path) {
    return `${API_BASE_URL}/uploads/default-avatar.png`;
  }

  // 2. Eğer zaten tam bir link ise (https://...) dokunma
  if (path.startsWith('http') || path.startsWith('blob:')) {
    return path;
  }

  // 3. Eğer base64 ise dokunma
  if (path.startsWith('data:image')) {
    return path;
  }

  // 4. Yolun başında '/' olup olmadığını kontrol et ve temizle
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // 5. Sunucu adresini başına ekle
  return `${API_BASE_URL}${cleanPath}`;
};

export const getFullImageUrl = getImageUrl;