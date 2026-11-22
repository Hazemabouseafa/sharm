import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    globals: true,
    fileParallelism: false,
    testTimeout: 90000,
    hookTimeout: 90000,
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@sharm/contracts': path.resolve(__dirname, 'packages/contracts/dist/index.js'),
      '@sharm/database': path.resolve(__dirname, 'packages/database/dist/index.js'),
      '@sharm/api/app-factory': path.resolve(__dirname, 'apps/api/dist/app-factory.js'),
    },
  },
});
