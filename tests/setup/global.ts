import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';

// Rebuild the test database from migrations before the run.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL_MIGRATE
    ?? `postgres://catc_owner:dev-owner-password@${process.env.TEST_DB_HOST ?? 'localhost'}:5432/catc_test`;
  const pool = new Pool({ connectionString: url, max: 1 });
  await pool.query('drop schema if exists public cascade; create schema public;');
  await pool.end();
  const env = { ...process.env, DATABASE_URL_MIGRATE: url, APP_DB_PASSWORD: process.env.APP_DB_PASSWORD ?? 'dev-app-password' };
  for (const script of ['scripts/migrate.ts', 'scripts/seed.ts']) {
    execFileSync('npx', ['tsx', '--conditions=react-server', script], { env, stdio: 'pipe' });
  }
}
