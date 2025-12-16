// src/utils/urlHelper.js

// Canlı sunucu adresi
const API_BASE_URL = 'https://oceanlan.com';

// 🟢 DÜZELTME: Tam istediğin "Yüzü olmayan gri adam" resmi.
// Gravatar'ın standart "Mystery Person" (mp) ikonunu kullanıyoruz.
export const DEFAULT_AVATAR_URL = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

// Rastgele avatar istersen de aynısını döndürür (Sadelik bozulmasın diye)
export const getRandomAvatar = () => {
    return DEFAULT_AVATAR_URL;
};

export const getImageUrl = (path) => {
  // 1. Veri yoksa -> Varsayılan Gri Resmi Göster
  if (!path || path === '' || path === 'undefined' || path === 'null') {
    return DEFAULT_AVATAR_URL;
  }

  // 2. Eski 'default-avatar.png' kaydı varsa -> Varsayılan Gri Resmi Göster
  if (path.includes('default-avatar.png')) {
      return DEFAULT_AVATAR_URL;
  }

  // 3. Zaten internet linki ise -> Olduğu gibi kullan
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }

  // 4. Sunucudaki bir dosyaysa -> Adresi birleştir
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
};

export const getFullImageUrl = getImageUrl;