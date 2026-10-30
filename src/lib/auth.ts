import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { sessions, users } from '@/db/schema';
import { randomToken, sha256 } from './crypto';
import { systemDb, withDb, type Tx } from './db';
import { isSecureOrigin } from './env';
import { hit } from './rate-limit';
import { deviceLabel } from './request';

export const SESSION_COOKIE_SECURE = '__Host-catc_session';
export const SESSION_COOKIE_DEV = 'catc_session';
export const sessionCookieName = () => (isSecureOrigin() ? SESSION_COOKIE_SECURE : SESSION_COOKIE_DEV);

/** Session lifetimes in seconds: [idle timeout, absolute lifetime]. */
export const LIFETIME = {
  member: [24 * 3600, 7 * 24 * 3600],
  admin: [30 * 60, 8 * 3600],
} as const;

export type AuthMethod = 'passkey' | 'magic_link' | 'invite';
export type SessionUser = {
  sessionId: string;
  userId: string;
  email: string;
  role: 'member' | 'admin';
  status: 'pending' | 'active' | 'suspended';
  authMethod: AuthMethod;
  userVerified: boolean;
};

/** Pure check, exported for tests. */
export function sessionExpired(s: { lastSeenAt: Date; idleSeconds: number; expiresAt: Date }, now = new Date()) {
  return now >= s.expiresAt || now.getTime() - s.lastSeenAt.getTime() > s.idleSeconds * 1000;
}

/** Validate a raw session token. Returns null for unknown, expired or suspended. */
export async function lookupSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  return systemDb(async (tx) => {
    const [row] = await tx
      .select({ s: sessions, u: { email: users.email, role: users.role, status: users.status } })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.tokenHash, sha256(token)))
      .limit(1);
    if (!row) return null;
    if (sessionExpired(row.s) || row.u.status === 'suspended') {
      await tx.delete(sessions).where(eq(sessions.id, row.s.id));
      return null;
    }
    if (Date.now() - row.s.lastSeenAt.getTime() > 60_000) {
      await tx.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.s.id));
    }
    return {
      sessionId: row.s.id,
      userId: row.s.userId,
      email: row.u.email,
      role: row.u.role,
      status: row.u.status,
      authMethod: row.s.authMethod,
      userVerified: row.s.userVerified,
    };
  });
}

/** Current request's session (memoized per request). */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return lookupSession(jar.get(sessionCookieName())?.value);
});

/** Insert a session row and return the raw token (only the hash is stored). */
export async function createSessionRow(
  tx: Tx,
  userId: string,
  role: 'member' | 'admin',
  authMethod: AuthMethod,
  userVerified: boolean,
  device: string,
): Promise<{ token: string; expiresAt: Date }> {
  const [idle, absolute] = LIFETIME[role];
  const token = randomToken();
  const expiresAt = new Date(Date.now() + absolute * 1000);
  await tx.insert(sessions).values({
    userId, tokenHash: sha256(token), authMethod, userVerified, device, idleSeconds: idle, expiresAt,
  });
  return { token, expiresAt };
}

/**
 * Start a fresh session (server actions / route handlers only). Any session
 * the browser already holds is deleted first, so tokens rotate on every login.
 */
export async function startSession(tx: Tx, userId: string, role: 'member' | 'admin', method: AuthMethod, uv: boolean) {
  const jar = await cookies();
  const old = jar.get(sessionCookieName())?.value;
  if (old) await tx.delete(sessions).where(eq(sessions.tokenHash, sha256(old)));
  const { token, expiresAt } = await createSessionRow(tx, userId, role, method, uv, await deviceLabel());
  await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  jar.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isSecureOrigin(),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) await systemDb((tx) => tx.delete(sessions).where(eq(sessions.tokenHash, sha256(token))));
  jar.delete(sessionCookieName());
}

export async function revokeAllSessions(tx: Tx, userId: string) {
  await tx.delete(sessions).where(eq(sessions.userId, userId));
}

// ---------------------------------------------------------------------------
// Guards. Pages and actions get database access only through these, so a
// route that forgets to authenticate has no way to query member data.
// ---------------------------------------------------------------------------

export type Authed = {
  user: SessionUser;
  db: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
};

/** Any signed-in account, including pending ones (own profile/account only). */
export async function requireUser(): Promise<Authed> {
  const user = await getSession();
  if (!user) redirect('/login');
  return { user, db: (fn) => withDb({ ctx: 'member', userId: user.userId }, fn) };
}

/** Approved, active member. Pending accounts are sent to the waiting page. */
export async function requireMember(): Promise<Authed> {
  const a = await requireUser();
  if (a.user.status !== 'active') redirect('/pending');
  return a;
}

/** Member who may browse member data, within the anti-scraping page-view limit. */
export async function requireBrowsingMember(): Promise<Authed> {
  const a = await requireMember();
  if (!(await hit('browsePerHour', a.user.userId))) redirect('/account?notice=rate_limited');
  return a;
}

/** True when this session may use admin powers (admin MFA requirement). */
export function hasAdminSession(u: SessionUser): boolean {
  return u.role === 'admin' && u.status === 'active' && u.authMethod === 'passkey' && u.userVerified;
}

/**
 * Adding a passkey to an admin account that already has one requires a
 * passkey session. Otherwise someone with access to an admin's email inbox
 * could sign in by magic link, enroll their own passkey, and gain admin
 * powers, defeating the admin MFA requirement.
 */
export function mayRegisterPasskey(u: SessionUser, existingPasskeys: number): boolean {
  if (u.role !== 'admin' || existingPasskeys === 0) return true;
  return u.authMethod === 'passkey' && u.userVerified;
}

/**
 * Admin, signed in with a user-verified passkey (possession + biometric/PIN),
 * which is how we satisfy "MFA for admins". Magic-link sessions are refused.
 */
export async function requireAdmin(): Promise<Authed> {
  const a = await requireMember();
  if (a.user.role !== 'admin') redirect('/directory');
  if (!hasAdminSession(a.user)) redirect('/account?notice=admin_passkey');
  return { user: a.user, db: (fn) => withDb({ ctx: 'admin', userId: a.user.userId }, fn) };
}

export async function isBlockedEitherWay(tx: Tx, a: string, b: string): Promise<boolean> {
  // SECURITY DEFINER helper: lets a member learn only this one boolean.
  const r = await tx.execute<{ b: boolean }>(sql`select app_blocked_between(${a}::uuid, ${b}::uuid) as b`);
  return Boolean(r.rows[0]?.b);
}
