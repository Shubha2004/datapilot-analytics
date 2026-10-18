// Vitest config — kept separate from vite.config.js so test settings
// never affect the production build.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
});
