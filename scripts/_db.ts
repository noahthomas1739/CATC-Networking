// Shared helpers for CLI scripts. Scripts connect as the database OWNER
// (DATABASE_URL_MIGRATE) and are run by an operator, never by the web app.
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema';

export function ownerPool(): Pool {
  const url = process.env.DATABASE_URL_MIGRATE;
  if (!url) {
    console.error('DATABASE_URL_MIGRATE is not set (owner connection string).');
    process.exit(1);
  }
  return new Pool({ connectionString: url, max: 1 });
}

export const ownerDb = (pool: Pool) => drizzle(pool, { schema });
