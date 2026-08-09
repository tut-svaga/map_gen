import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // В проде тот же путь /api разворачивает nginx. Прокси здесь нужен, чтобы
    // в dev-режиме запросы шли с того же origin — иначе браузер упрётся в CORS,
    // и код фронтенда пришлось бы держать разным для dev и прода.
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    // Карты исходников не кладём в образ: они весят больше самого бандла
    // и отдают исходный код всем, кто откроет devtools.
    sourcemap: false,
  },
});
