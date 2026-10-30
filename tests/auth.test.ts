import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { invites, users } from '@/db/schema';
import { createSessionRow, hasAdminSession, mayRegisterPasskey, lookupSession, sessionExpired, type SessionUser } from '@/lib/auth';
import { sha256 } from '@/lib/crypto';
import { isSameOriginRequest } from '@/lib/csrf';
import { systemDb } from '@/lib/db';
import { hit, isLocked } from '@/lib/rate-limit';
import { consumeMagicLink, issueMagicLink } from '@/lib/services/magic-links';
import { createInvite, findValidInvite, redeemInvite } from '@/lib/services/invites';
import { makeUser, owner } from './helpers';

afterAll(() => owner.end());

const tokenFrom = (url: string) => url.split('/invite/')[1];
const profile = { displayName: 'New Person', businessName: 'New Biz' };

describe('sessions', () => {
  it('expires on idle timeout and on absolute lifetime', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const base = { idleSeconds: 1800, expiresAt: new Date('2026-01-01T20:00:00Z') };
    expect(sessionExpired({ ...base, lastSeenAt: new Date('2026-01-01T11:45:00Z') }, now)).toBe(false);
    expect(sessionExpired({ ...base, lastSeenAt: new Date('2026-01-01T11:00:00Z') }, now)).toBe(true);
    expect(sessionExpired({ ...base, lastSeenAt: now, expiresAt: new Date('2026-01-01T11:59:59Z') }, now)).toBe(true);
  });

  it('stores only a hash of the token and resolves the user', async () => {
    const u = await makeUser();
    const { token } = await systemDb((tx) => createSessionRow(tx, u.id, 'member', 'passkey', true, 'test'));
    const { rows } = await owner.query('select token_hash from sessions where user_id = $1', [u.id]);
    expect(Buffer.compare(rows[0].token_hash, sha256(token))).toBe(0);
    expect(rows[0].token_hash.toString()).not.toContain(token);
    const s = await lookupSession(token);
    expect(s?.userId).toBe(u.id);
    expect(await lookupSession(`${token}x`)).toBeNull();
    expect(await lookupSession(undefined)).toBeNull();
  });

  it('rejects idle-expired sessions and deletes them', async () => {
    const u = await makeUser();
    const { token } = await systemDb((tx) => createSessionRow(tx, u.id, 'admin', 'passkey', true, 'test'));
    await owner.query(`update sessions set last_seen_at = now() - interval '31 minutes' where user_id = $1`, [u.id]);
    expect(await lookupSession(token)).toBeNull();
    expect((await owner.query('select 1 from sessions where user_id = $1', [u.id])).rows).toHaveLength(0);
  });

  it('a suspended member is signed out immediately', async () => {
    const u = await makeUser();
    const { token } = await systemDb((tx) => createSessionRow(tx, u.id, 'member', 'passkey', true, 'test'));
    await owner.query(`update users set status = 'suspended' where id = $1`, [u.id]);
    expect(await lookupSession(token)).toBeNull();
  });

  it('admin powers require a user-verified passkey session', () => {
    const base: SessionUser = { sessionId: 's', userId: 'u', email: 'e', role: 'admin', status: 'active', authMethod: 'passkey', userVerified: true };
    expect(hasAdminSession(base)).toBe(true);
    expect(hasAdminSession({ ...base, authMethod: 'magic_link' })).toBe(false);
    expect(hasAdminSession({ ...base, authMethod: 'invite' })).toBe(false);
    expect(hasAdminSession({ ...base, userVerified: false })).toBe(false);
    expect(hasAdminSession({ ...base, role: 'member' })).toBe(false);
    expect(hasAdminSession({ ...base, status: 'pending' })).toBe(false);
  });
});

describe('passkey enrollment', () => {
  const admin: SessionUser = { sessionId: 's', userId: 'u', email: 'e', role: 'admin', status: 'active', authMethod: 'magic_link', userVerified: false };
  it('an email-link session cannot add a passkey to an admin who already has one', () => {
    expect(mayRegisterPasskey(admin, 1)).toBe(false);
    expect(mayRegisterPasskey({ ...admin, authMethod: 'passkey', userVerified: true }, 1)).toBe(true);
  });
  it('allows the first passkey (bootstrap) and any member enrollment', () => {
    expect(mayRegisterPasskey({ ...admin, authMethod: 'invite' }, 0)).toBe(true);
    expect(mayRegisterPasskey({ ...admin, role: 'member' }, 3)).toBe(true);
  });
});

describe('magic links', () => {
  it('are single use', async () => {
    const u = await makeUser();
    const issued = await systemDb((tx) => issueMagicLink(tx, u.email));
    expect(issued).not.toBeNull();
    expect((await systemDb((tx) => consumeMagicLink(tx, issued!.token)))?.userId).toBe(u.id);
    expect(await systemDb((tx) => consumeMagicLink(tx, issued!.token))).toBeNull();
  });

  it('expire', async () => {
    const u = await makeUser();
    const issued = await systemDb((tx) => issueMagicLink(tx, u.email));
    await owner.query(`update magic_links set expires_at = now() - interval '1 second' where user_id = $1`, [u.id]);
    expect(await systemDb((tx) => consumeMagicLink(tx, issued!.token))).toBeNull();
  });

  it('are not issued for unknown or suspended accounts', async () => {
    const s = await makeUser({ status: 'suspended' });
    expect(await systemDb((tx) => issueMagicLink(tx, 'nobody@example.com'))).toBeNull();
    expect(await systemDb((tx) => issueMagicLink(tx, s.email))).toBeNull();
  });

  it('stop working if the account is suspended after issue', async () => {
    const u = await makeUser();
    const issued = await systemDb((tx) => issueMagicLink(tx, u.email));
    await owner.query(`update users set status = 'suspended' where id = $1`, [u.id]);
    expect(await systemDb((tx) => consumeMagicLink(tx, issued!.token))).toBeNull();
  });
});

describe('invites', () => {
  it('create a PENDING account that cannot be redeemed twice', async () => {
    const inv = await systemDb((tx) => createInvite(tx, { email: 'new1@example.com', role: 'member', createdBy: null }));
    if ('error' in inv) throw new Error();
    const token = tokenFrom(inv.url);
    const r = await systemDb((tx) => redeemInvite(tx, token, profile));
    expect(r?.role).toBe('member');
    const [u] = await systemDb((tx) => tx.select().from(users).where(eq(users.id, r!.userId)));
    expect(u.status).toBe('pending');
    expect(await systemDb((tx) => redeemInvite(tx, token, profile))).toBeNull();
  });

  it('cannot be redeemed concurrently twice', async () => {
    const inv = await systemDb((tx) => createInvite(tx, { email: 'race@example.com', role: 'member', createdBy: null }));
    if ('error' in inv) throw new Error();
    const token = tokenFrom(inv.url);
    const results = await Promise.allSettled([1, 2, 3].map(() => systemDb((tx) => redeemInvite(tx, token, profile))));
    const wins = results.filter((x) => x.status === 'fulfilled' && x.value).length;
    expect(wins).toBe(1);
  });

  it('expire and can be revoked', async () => {
    const a = await systemDb((tx) => createInvite(tx, { email: 'exp@example.com', role: 'member', createdBy: null }));
    const b = await systemDb((tx) => createInvite(tx, { email: 'rev@example.com', role: 'member', createdBy: null }));
    if ('error' in a || 'error' in b) throw new Error();
    await owner.query(`update invites set expires_at = now() - interval '1 second' where id = $1`, [a.id]);
    await systemDb((tx) => tx.update(invites).set({ revokedAt: new Date() }).where(eq(invites.id, b.id)));
    expect(await systemDb((tx) => findValidInvite(tx, tokenFrom(a.url)))).toBeNull();
    expect(await systemDb((tx) => redeemInvite(tx, tokenFrom(b.url), profile))).toBeNull();
  });

  it('a new invite for the same email revokes the old one', async () => {
    const a = await systemDb((tx) => createInvite(tx, { email: 'twice@example.com', role: 'member', createdBy: null }));
    await systemDb((tx) => createInvite(tx, { email: 'twice@example.com', role: 'member', createdBy: null }));
    if ('error' in a) throw new Error();
    expect(await systemDb((tx) => findValidInvite(tx, tokenFrom(a.url)))).toBeNull();
  });

  it('are refused for an existing account', async () => {
    const u = await makeUser();
    expect(await systemDb((tx) => createInvite(tx, { email: u.email, role: 'member', createdBy: null }))).toEqual({ error: 'exists' });
  });

  it('CLI admin invites create an active admin', async () => {
    const inv = await systemDb((tx) => createInvite(tx, { email: 'boss@example.com', role: 'admin', createdBy: null }));
    if ('error' in inv) throw new Error();
    const r = await systemDb((tx) => redeemInvite(tx, tokenFrom(inv.url), profile));
    const [u] = await systemDb((tx) => tx.select().from(users).where(eq(users.id, r!.userId)));
    expect([u.role, u.status]).toEqual(['admin', 'active']);
  });

  it('store only a hash of the token', async () => {
    const inv = await systemDb((tx) => createInvite(tx, { email: 'hash@example.com', role: 'member', createdBy: null }));
    if ('error' in inv) throw new Error();
    const { rows } = await owner.query('select token_hash from invites where id = $1', [inv.id]);
    expect(Buffer.compare(rows[0].token_hash, sha256(tokenFrom(inv.url)))).toBe(0);
  });
});

describe('rate limiting and lockout', () => {
  it('blocks after the limit within the window', async () => {
    const subject = `t-${Date.now()}`;
    const results = [];
    for (let i = 0; i < 12; i++) results.push(await hit('passkeyFailPerIp', subject));
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(await isLocked('passkeyFailPerIp', subject)).toBe(true);
    expect(await isLocked('passkeyFailPerIp', `${subject}-other`)).toBe(false);
  });

  it('resets after the window', async () => {
    const subject = `w-${Date.now()}`;
    for (let i = 0; i < 3; i++) await hit('introPerDayNewAccount', subject);
    expect(await hit('introPerDayNewAccount', subject)).toBe(false);
    await owner.query(`update rate_limits set window_start = now() - interval '2 days' where key = $1`, [`introPerDayNewAccount:${subject}`]);
    expect(await hit('introPerDayNewAccount', subject)).toBe(true);
  });
});

describe('CSRF origin check', () => {
  const origin = 'https://directory.test';
  const h = (o: Record<string, string>) => new Headers(o);
  it('allows safe methods', () => expect(isSameOriginRequest('GET', h({ origin: 'https://evil.example' }), origin)).toBe(true));
  it('allows same-origin POST', () => expect(isSameOriginRequest('POST', h({ origin }), origin)).toBe(true));
  it('rejects cross-origin POST', () => expect(isSameOriginRequest('POST', h({ origin: 'https://evil.example' }), origin)).toBe(false));
  it('rejects look-alike origins', () => expect(isSameOriginRequest('POST', h({ origin: `${origin}.evil.example` }), origin)).toBe(false));
  it('rejects null origin', () => expect(isSameOriginRequest('POST', h({ origin: 'null' }), origin)).toBe(false));
  it('falls back to Sec-Fetch-Site', () => {
    expect(isSameOriginRequest('POST', h({ 'sec-fetch-site': 'same-origin' }), origin)).toBe(true);
    expect(isSameOriginRequest('POST', h({ 'sec-fetch-site': 'cross-site' }), origin)).toBe(false);
    expect(isSameOriginRequest('DELETE', h({}), origin)).toBe(false);
  });
});

