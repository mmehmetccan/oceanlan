// src/config.js

// Vite prod mu?
const isProd = import.meta.env.PROD;

// Geliştirmede (npm run dev / electron dev) -> localhost backend
// Prod'da (web + electron) -> oceanlan.com backend
export const API_BASE_URL = isProd
  ? 'https://oceanlan.com/api'
  : 'http://localhost:4000/api';

export const SOCKET_URL = isProd
  ? 'https://oceanlan.com'
  : 'http://localhost:4000';
