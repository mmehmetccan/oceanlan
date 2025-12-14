// src/utils/axiosInstance.js
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const apiURL = baseURL.endsWith('/api/v1') ? baseURL : `${baseURL}/api/v1`;

const axiosInstance = axios.create({
  baseURL: apiURL,
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('[AxiosInstance] 401 Oturum sonlandı.');
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      // 🟢 F5 Atmak Yerine Event Gönder (Sonsuz Döngüyü Engeller)
      window.dispatchEvent(new Event('auth:logout'));
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;