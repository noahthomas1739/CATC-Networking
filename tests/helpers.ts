import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { withDb, type Tx } from '@/lib/db';

// Owner connection for arranging fixtures directly (bypasses RLS as table owner).
export const owner = new Pool({ connectionString: process.env.DATABASE_URL_MIGRATE, max: 2 });

type Status = 'pending' | 'active' | 'suspended';

export async function makeUser(opts: { status?: Status; role?: 'member' | 'admin'; approvedDaysAgo?: number } = {}) {
  const status = opts.status ?? 'active';
  const approvedAt = status === 'pending' ? null : new Date(Date.now() - (opts.approvedDaysAgo ?? 30) * 86400_000);
  const email = `${randomUUID()}@example.com`;
  const { rows } = await owner.query(
    `insert into users (email, role, status, age_confirmed_at, terms_accepted_at, approved_at)
     values ($1, $2, $3, now(), now(), $4) returning id`,
    [email, opts.role ?? 'member', status, approvedAt],
  );
  const id: string = rows[0].id;
  await owner.query('insert into profiles (user_id, display_name, business_name) values ($1, $2, $3)', [id, `User ${id.slice(0, 4)}`, 'Biz']);
  return { id, email };
}

export const asMember = <T>(userId: string, fn: (tx: Tx) => Promise<T>) => withDb({ ctx: 'member', userId }, fn);
export const asAdmin = <T>(userId: string, fn: (tx: Tx) => Promise<T>) => withDb({ ctx: 'admin', userId }, fn);

/** App-role connection with NO context set: what a code path that skipped auth would get. */
export const appNoCtx = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

/** Expect a promise to fail with a Postgres permission/RLS error. */
export async function denied(p: Promise<unknown>): Promise<boolean> {
  try {
    await p;
    return false;
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    const msg = `${err.message ?? ''} ${err.cause?.message ?? ''}`;
    return /row-level security|permission denied/.test(msg);
  }
}
