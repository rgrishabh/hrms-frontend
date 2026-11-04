import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The API resolves the tenant from the Host header, so the dev proxy must
// preserve it (changeOrigin: false). Use http://<tenant>.localhost:5173.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ['.localhost'],
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false },
      '/brand': { target: 'http://127.0.0.1:4000', changeOrigin: false },
      '/branding': { target: 'http://127.0.0.1:4000', changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
});
