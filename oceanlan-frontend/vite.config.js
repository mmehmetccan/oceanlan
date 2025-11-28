import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND_PORT = 3000;

export default defineConfig({
  plugins: [react()],

  // Electron için dosya yolları
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

  // 👇 DÜZELTME BURADA:
  // Eski hali: global: JSON.stringify({})
  // Yeni hali: global: 'window'
  // Bu değişiklik, "Invalid define value" hatasını kesin çözer.
  define: {
    global: 'window',
  },

  // .js dosyalarında JSX kullanımına izin ver
  esbuild: {
    loader: "jsx",
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