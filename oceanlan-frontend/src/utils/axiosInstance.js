// src/utils/axiosInstance.js
import axios from 'axios';


const API_URL_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const axiosInstance = axios.create({
  baseURL: `${API_URL_BASE}/api/v1`,
});

// Her istekten önce token'ı ekle
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Opsiyonel: 401 yakala ve otomatik yönlendir
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('[AxiosInstance] 401 tespit edildi, oturum sonlandırılıyor.');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
