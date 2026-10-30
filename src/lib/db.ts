import 'server-only';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/db/schema';
import { env } from './env';

type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Database context for a transaction. Row-level security policies read these
 * values, so every query runs inside exactly one of them:
 *  - member/admin: on behalf of a signed-in user (see lib/auth.ts)
 *  - system: auth bootstrap and maintenance only. Never use it to serve data
 *    to a member; use requireMember()/requireAdmin() instead.
 */
export type DbContext = { ctx: 'system' } | { ctx: 'member' | 'admin'; userId: string };

let db: Db | undefined;
let roleChecked: Promise<void> | undefined;

function getDb(): Db {
  if (!db) {
    const pool = new Pool({ connectionString: env().DATABASE_URL, max: 5, idleTimeoutMillis: 10_000 });
    db = drizzle(pool, { schema });
    roleChecked = assertRestrictedRole(pool);
  }
  return db;
}

// Refuse to run as a role that would silently bypass row-level security.
async function assertRestrictedRole(pool: Pool) {
  const { rows } = await pool.query(
    'select rolsuper, rolbypassrls from pg_roles where rolname = current_user',
  );
  if (!rows[0] || rows[0].rolsuper || rows[0].rolbypassrls) {
    throw new Error('DATABASE_URL must use the restricted catc_app role (no superuser, no BYPASSRLS).');
  }
  const owned = await pool.query(
    "select count(*)::int as n from pg_tables where schemaname = 'public' and tableowner = current_user",
  );
  if (owned.rows[0].n > 0) throw new Error('DATABASE_URL role must not own tables (RLS would not apply).');
}

export async function withDb<T>(c: DbContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const d = getDb();
  await roleChecked;
  return d.transaction(async (tx) => {
    const userId = c.ctx === 'system' ? '' : c.userId;
    await tx.execute(sql`select set_config('app.ctx', ${c.ctx}, true), set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

export const systemDb = <T>(fn: (tx: Tx) => Promise<T>) => withDb({ ctx: 'system' }, fn);
