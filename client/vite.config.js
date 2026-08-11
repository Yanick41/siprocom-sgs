import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Fail loudly if 5173 is taken instead of drifting to 5174. A second dev
    // server on a different port looks identical in the browser but talks to a
    // stale bundle, and the resulting confusion costs far more than the crash.
    strictPort: true,
    // Proxy in dev so the browser sees one origin and the auth cookie
    // behaves exactly as it will in production.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Chunking is left to Rolldown's defaults. Revisit in the Phase 7
    // performance pass if the initial bundle grows (recharts is the usual culprit).
  },
});
