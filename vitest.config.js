import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
