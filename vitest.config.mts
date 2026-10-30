import path from 'node:path';
import { defineConfig } from 'vitest/config';

const appPw = process.env.APP_DB_PASSWORD ?? 'dev-app-password';
const host = process.env.TEST_DB_HOST ?? 'localhost';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      'server-only': path.resolve(import.meta.dirname, 'tests/setup/empty.ts'),
    },
  },
  test: {
    environment: 'node',
    globalSetup: ['tests/setup/global.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      APP_URL: 'https://directory.test',
      HASH_SECRET: 'test-hash-secret-test-hash-secret-0123456789',
      DATABASE_URL: `postgres://catc_app:${appPw}@${host}:5432/catc_test`,
      DATABASE_URL_MIGRATE: process.env.TEST_DATABASE_URL_MIGRATE ?? `postgres://catc_owner:dev-owner-password@${host}:5432/catc_test`,
      APP_DB_PASSWORD: appPw,
    },
  },
});
