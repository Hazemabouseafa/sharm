import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    globals: true,
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@sharm/contracts': path.resolve(__dirname, 'packages/contracts/src/index.ts'),
      '@sharm/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
    },
  },
});
