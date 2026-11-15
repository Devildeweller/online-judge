import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = process.env.VITE_API_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin in development, so the refresh cookie and WebSocket behave as they do behind nginx.
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/socket.io': { target: API, changeOrigin: true, ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
});
