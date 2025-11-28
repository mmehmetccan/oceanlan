import axios from 'axios';

// 1. Backend adresini .env dosyasından al (Yoksa localhost kullan)
const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// 2. Eğer URL'in sonunda /api/v1 yoksa ekle
// (Bazı yerlerde https://api.oceanlan.com yazmış olabilirsin, sonuna /api/v1 ekliyoruz)
const apiURL = baseURL.endsWith('/api/v1') ? baseURL : `${baseURL}/api/v1`;

const axiosInstance = axios.create({
  baseURL: apiURL,
});

// Her istekten önce token'ı ekle
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 Hatası (Yetkisiz) gelirse çıkış yap
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('[AxiosInstance] 401 Oturum sonlandı.');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;