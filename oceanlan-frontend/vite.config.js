// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND_PORT = 3000;

export default defineConfig({
  plugins: [react()],
  base: './',

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
        secure: false,
      },
    },
  },

  define: {
    // simple-peer global istiyor
    global: 'window',

    // kütüphaneler process.env okursa boş obje dönecek
    'process.env': '{}',

    // asıl kritik kısım: process.nextTick polyfill
    process:
      {},
  },

  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },

  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
});
