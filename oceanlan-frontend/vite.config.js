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

  define: {
    // Önceden vardı
    global: 'window',

    // 👇 BUNU EKLİYORUZ: process'i browser'da sahte bir obje yap
    process: {
      env: {},
    },
    // İstersen ekstra güvenlik için şunu da ekleyebilirsin:
    // 'process.env': {},
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
