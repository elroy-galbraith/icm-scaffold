import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: false,
    // Scoped to src/ so future Playwright specs under e2e/ (Tasks 19-22) are
    // not picked up by Vitest's default **/*.spec.ts include glob.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
