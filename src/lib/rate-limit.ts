import 'server-only';
import { sql } from 'drizzle-orm';
import { systemDb } from './db';

/** Limits are [max events, window in seconds]. */
export const LIMITS = {
  magicLinkPerEmail: [5, 3600],
  magicLinkPerIp: [20, 3600],
  magicLinkConsumePerIp: [20, 900],
  passkeyLoginPerIp: [30, 900],
  passkeyFailPerIp: [10, 900],
  inviteViewPerIp: [30, 3600],
  inviteRedeemPerIp: [10, 3600],
  introPerDay: [10, 86400],
  introPerDayNewAccount: [2, 86400],
  repliesPerDay: [60, 86400],
  replyNotifyPerThread: [1, 3600],
  recommendationsPerDay: [10, 86400],
  reportsPerDay: [20, 86400],
  exportsPerDay: [5, 86400],
  uploadsPerHour: [20, 3600],
  browsePerHour: [300, 3600], // directory + profile page views, slows scraping by a member
} as const satisfies Record<string, readonly [number, number]>;

export type LimitName = keyof typeof LIMITS;

/**
 * Fixed-window counter stored in Postgres. Returns true if the action is
 * allowed (and counts it). Keys must not contain raw PII: pass hashed IPs.
 */
export async function hit(name: LimitName, subject: string, limit?: readonly [number, number]): Promise<boolean> {
  const [max, windowSec] = limit ?? LIMITS[name];
  const key = `${name}:${subject}`;
  const rows = await systemDb((tx) => tx.execute<{ count: number }>(sql`
    insert into rate_limits (key, count, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then now() else rate_limits.window_start end
    returning count`));
  return Number(rows.rows[0].count) <= max;
}

/** Check without counting (e.g. lockout after repeated failures). */
export async function isLocked(name: LimitName, subject: string): Promise<boolean> {
  const [max, windowSec] = LIMITS[name];
  const rows = await systemDb((tx) => tx.execute<{ count: number }>(sql`
    select count from rate_limits where key = ${`${name}:${subject}`}
      and window_start >= now() - make_interval(secs => ${windowSec})`));
  return rows.rows.length > 0 && Number(rows.rows[0].count) >= max;
}
