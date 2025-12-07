// src/utils/urlHelper.js

// 🌍 CANLI SUNUCU ADRESİ (Burası çok önemli, hep buraya bakacaklar)
const API_BASE_URL = 'https://oceanlan.com';

export const getImageUrl = (path) => {
  // 1. Resim yoksa, Backend'deki garanti yola yönlendir
  if (!path) {
    return `${API_BASE_URL}/uploads/default-avatar.png`;
  }

  // 2. 🛠️ ÖZEL DÜZELTME: Veritabanında "/default-avatar.png" yazıyorsa
  // Bunu Backend'deki "uploads" klasörüne yönlendir.
  if (path === '/default-avatar.png' || path === 'default-avatar.png') {
      return `${API_BASE_URL}/uploads/default-avatar.png`;
  }

  // 3. Eğer zaten tam bir link, blob veya base64 ise dokunma
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }

  // 4. Yolun başında '/' olup olmadığını kontrol et ve temizle
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // 5. Sunucu adresini başına ekle
  return `${API_BASE_URL}${cleanPath}`;
};

export const getFullImageUrl = getImageUrl;