import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El API vive en Express (server/index.js, :8849). En dev Vite sirve el front con HMR y
// reenvía /api, /covers y /health al server; en prod `vite build` deja dist/ y Express lo sirve.
const API = process.env.API_ORIGIN || 'http://localhost:8849';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // los teléfonos de la LAN también abren el dev server
    port: 5173,
    proxy: Object.fromEntries(
      ['/api', '/covers', '/health'].map((p) => [p, { target: API, changeOrigin: true }]),
    ),
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
