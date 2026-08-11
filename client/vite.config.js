import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * 5280 rather than Vite's default 5173: this machine runs other Vite projects,
 * and sharing the default meant whichever started second silently drifted to
 * 5174 and hit the API's CORS allowlist.
 *
 * Override with CLIENT_PORT / API_PORT when a port is taken — no code change.
 */
const CLIENT_PORT = Number(process.env.CLIENT_PORT) || 5280;
const API_PORT = Number(process.env.API_PORT) || 4000;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: CLIENT_PORT,
    // Fail loudly if the port is taken instead of drifting to the next one. A
    // second dev server on a different port looks identical in the browser but
    // serves a stale bundle, and that confusion costs far more than a crash.
    strictPort: true,
    // Proxy in dev so the browser sees one origin and the auth cookie
    // behaves exactly as it will in production.
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    // Rendering every screen is the point of this suite; the default 5s is not
    // enough for the chart-heavy ones on a cold run.
    testTimeout: 20_000,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Chunking is left to Rolldown's defaults. Revisit in the Phase 7
    // performance pass if the initial bundle grows (recharts is the usual culprit).
  },
});
