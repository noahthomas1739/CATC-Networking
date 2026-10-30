// Authorization tests at the database layer. These run as the restricted
// catc_app role, exactly like production, so they prove RLS holds even if
// application code has a bug.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  auditLog, blocks, contactMethods, invites, magicLinks, messages, passkeys, photos, profiles, rateLimits,
  recommendations, reports, sessions, threads, users,
} from '@/db/schema';
import { appNoCtx, asAdmin, asMember, denied, makeUser, owner } from './helpers';

let a: { id: string; email: string };
let b: { id: string; email: string };
let c: { id: string; email: string };
let pending: { id: string; email: string };
let suspended: { id: string; email: string };
let admin: { id: string; email: string };
let threadBC: string;
let msgBC: string;

beforeAll(async () => {
  [a, b, c, pending, suspended, admin] = await Promise.all([
    makeUser(), makeUser(), makeUser(), makeUser({ status: 'pending' }), makeUser({ status: 'suspended' }), makeUser({ role: 'admin' }),
  ]);
  await owner.query(`insert into contact_methods (user_id, kind, value, visible) values
    ($1, 'email', 'b-hidden@example.com', false), ($1, 'phone', '817-555-0100', true)`, [b.id]);
  await owner.query(`insert into photos (user_id, data) values ($1, '\\x00')`, [b.id]);
  await owner.query(`insert into recommendations (subject_id, author_id, body) values ($1, $2, 'great')`, [b.id, c.id]);
  const t = await owner.query('insert into threads (sender_id, recipient_id) values ($1, $2) returning id', [b.id, c.id]);
  threadBC = t.rows[0].id;
  const m = await owner.query('insert into messages (thread_id, sender_id, body) values ($1, $2, $3) returning id', [threadBC, b.id, 'private hello']);
  msgBC = m.rows[0].id;
  await owner.query(`insert into sessions (user_id, token_hash, auth_method, idle_seconds, expires_at) values ($1, '\\x01', 'passkey', 60, now() + interval '1 hour')`, [b.id]);
  await owner.query(`insert into passkeys (id, user_id, public_key) values ('cred-b', $1, '\\x02')`, [b.id]);
  await owner.query(`insert into magic_links (token_hash, user_id, expires_at) values ('\\x03', $1, now() + interval '1 hour')`, [b.id]);
  await owner.query(`insert into invites (token_hash, email, expires_at) values ('\\x04', 'x@example.com', now() + interval '1 day')`);
  await owner.query(`insert into audit_log (action, actor_id) values ('login.passkey', $1)`, [b.id]);
});

afterAll(async () => {
  await owner.end();
  await appNoCtx.end();
});

describe('member A cannot access member B\'s private data', () => {
  it('cannot read B\'s account row (email)', async () => {
    const rows = await asMember(a.id, (tx) => tx.select().from(users));
    expect(rows.map((r) => r.id)).toEqual([a.id]);
  });

  it('sees only the contact fields B chose to show', async () => {
    const rows = await asMember(a.id, (tx) => tx.select().from(contactMethods).where(eq(contactMethods.userId, b.id)));
    expect(rows.map((r) => r.kind)).toEqual(['phone']);
  });

  it('cannot read a conversation between B and C', async () => {
    const t = await asMember(a.id, (tx) => tx.select().from(threads).where(eq(threads.id, threadBC)));
    const m = await asMember(a.id, (tx) => tx.select().from(messages).where(eq(messages.threadId, threadBC)));
    expect(t).toHaveLength(0);
    expect(m).toHaveLength(0);
  });

  it('cannot post into B and C\'s conversation', async () => {
    expect(await denied(asMember(a.id, (tx) => tx.insert(messages).values({ threadId: threadBC, senderId: a.id, body: 'x' })))).toBe(true);
  });

  it('cannot send a message impersonating B', async () => {
    expect(await denied(asMember(a.id, (tx) => tx.insert(threads).values({ senderId: b.id, recipientId: c.id })))).toBe(true);
  });

  it('cannot edit or delete B\'s profile', async () => {
    const updated = await asMember(a.id, (tx) => tx.update(profiles).set({ businessName: 'Hacked' }).where(eq(profiles.userId, b.id)).returning());
    expect(updated).toHaveLength(0);
    const deleted = await asMember(a.id, (tx) => tx.delete(profiles).where(eq(profiles.userId, b.id)).returning());
    expect(deleted).toHaveLength(0);
    const { rows } = await owner.query('select business_name from profiles where user_id = $1', [b.id]);
    expect(rows[0].business_name).toBe('Biz');
  });

  it('cannot change B\'s contact details or photo', async () => {
    expect(await denied(asMember(a.id, (tx) => tx.insert(contactMethods).values({ userId: b.id, kind: 'website', value: 'https://evil.example' })))).toBe(true);
    const r = await asMember(a.id, (tx) => tx.update(contactMethods).set({ visible: true }).where(eq(contactMethods.userId, b.id)).returning());
    expect(r).toHaveLength(0);
    const p = await asMember(a.id, (tx) => tx.delete(photos).where(eq(photos.userId, b.id)).returning());
    expect(p).toHaveLength(0);
  });

  it('cannot see or revoke B\'s sessions and passkeys', async () => {
    expect(await asMember(a.id, (tx) => tx.select().from(sessions).where(eq(sessions.userId, b.id)))).toHaveLength(0);
    expect(await asMember(a.id, (tx) => tx.select().from(passkeys).where(eq(passkeys.userId, b.id)))).toHaveLength(0);
    expect(await asMember(a.id, (tx) => tx.delete(sessions).where(eq(sessions.userId, b.id)).returning())).toHaveLength(0);
    expect(await asMember(a.id, (tx) => tx.delete(passkeys).where(eq(passkeys.userId, b.id)).returning())).toHaveLength(0);
  });

  it('cannot hide or rewrite recommendations about B', async () => {
    const r = await asMember(a.id, (tx) => tx.update(recommendations).set({ hidden: true }).where(eq(recommendations.subjectId, b.id)).returning());
    expect(r).toHaveLength(0);
    // Only the `hidden` column is updatable at all, even by the subject.
    expect(await denied(asMember(b.id, (tx) => tx.update(recommendations).set({ body: 'edited' }).where(eq(recommendations.subjectId, b.id))))).toBe(true);
  });

  it('cannot read auth secrets, invites, rate limits or the audit log', async () => {
    expect(await asMember(a.id, (tx) => tx.select().from(magicLinks))).toHaveLength(0);
    expect(await asMember(a.id, (tx) => tx.select().from(invites))).toHaveLength(0);
    expect(await asMember(a.id, (tx) => tx.select().from(rateLimits))).toHaveLength(0);
    expect(await asMember(a.id, (tx) => tx.select().from(auditLog))).toHaveLength(0);
  });

  it('cannot forge, alter or erase audit entries', async () => {
    expect(await denied(asMember(a.id, (tx) => tx.insert(auditLog).values({ action: 'login.passkey', actorId: b.id })))).toBe(true);
    expect(await denied(asMember(a.id, (tx) => tx.update(auditLog).set({ action: 'x' })))).toBe(true);
    expect(await denied(asMember(a.id, (tx) => tx.delete(auditLog)))).toBe(true);
  });

  it('cannot read other people\'s reports', async () => {
    await owner.query(`insert into reports (reporter_id, target_type, target_user_id, reason) values ($1, 'profile', $2, 'spam')`, [c.id, b.id]);
    expect(await asMember(a.id, (tx) => tx.select().from(reports))).toHaveLength(0);
  });

  it('cannot promote themself', async () => {
    const r = await asMember(a.id, (tx) => tx.update(users).set({ role: 'admin' }).where(eq(users.id, a.id)).returning());
    expect(r).toHaveLength(0);
  });

  it('claiming the admin context without the admin role grants nothing', async () => {
    expect((await asAdmin(a.id, (tx) => tx.select().from(users))).map((r) => r.id)).toEqual([a.id]);
    expect(await asAdmin(a.id, (tx) => tx.select().from(invites))).toHaveLength(0);
  });
});

describe('unapproved and suspended users see nothing', () => {
  it('a pending user sees only their own profile', async () => {
    const rows = await asMember(pending.id, (tx) => tx.select().from(profiles));
    expect(rows.map((r) => r.userId)).toEqual([pending.id]);
  });

  it('a pending user sees no contacts, photos or recommendations', async () => {
    expect(await asMember(pending.id, (tx) => tx.select().from(contactMethods))).toHaveLength(0);
    expect(await asMember(pending.id, (tx) => tx.select().from(photos))).toHaveLength(0);
    expect(await asMember(pending.id, (tx) => tx.select().from(recommendations))).toHaveLength(0);
  });

  it('a pending user cannot message, recommend or report', async () => {
    expect(await denied(asMember(pending.id, (tx) => tx.insert(threads).values({ senderId: pending.id, recipientId: b.id })))).toBe(true);
    expect(await denied(asMember(pending.id, (tx) => tx.insert(recommendations).values({ subjectId: b.id, authorId: pending.id, body: 'x' })))).toBe(true);
    expect(await denied(asMember(pending.id, (tx) => tx.insert(reports).values({ reporterId: pending.id, targetType: 'profile', targetUserId: b.id, reason: 'spam' })))).toBe(true);
  });

  it('a suspended user sees nothing beyond themself', async () => {
    const rows = await asMember(suspended.id, (tx) => tx.select().from(profiles));
    expect(rows.map((r) => r.userId)).toEqual([suspended.id]);
  });

  it('active members cannot see pending or suspended members', async () => {
    const ids = (await asMember(a.id, (tx) => tx.select().from(profiles))).map((r) => r.userId);
    expect(ids).toContain(b.id);
    expect(ids).not.toContain(pending.id);
    expect(ids).not.toContain(suspended.id);
  });

  it('nobody can message a pending or suspended member', async () => {
    expect(await denied(asMember(a.id, (tx) => tx.insert(threads).values({ senderId: a.id, recipientId: suspended.id })))).toBe(true);
    expect(await denied(asMember(a.id, (tx) => tx.insert(threads).values({ senderId: a.id, recipientId: pending.id })))).toBe(true);
  });

  it('a connection with no context set reads nothing from any table', async () => {
    const tables = ['users', 'profiles', 'contact_methods', 'photos', 'passkeys', 'sessions', 'magic_links', 'invites',
      'threads', 'messages', 'recommendations', 'reports', 'blocks', 'audit_log', 'rate_limits', 'categories', 'webauthn_challenges'];
    for (const t of tables) {
      const { rows } = await appNoCtx.query(`select count(*)::int as n from ${t}`);
      expect({ t, n: rows[0].n }).toEqual({ t, n: 0 });
    }
  });
});

describe('admins', () => {
  it('can manage members but cannot read private messages that were not reported', async () => {
    expect((await asAdmin(admin.id, (tx) => tx.select().from(users))).length).toBeGreaterThan(5);
    expect(await asAdmin(admin.id, (tx) => tx.select().from(messages).where(eq(messages.id, msgBC)))).toHaveLength(0);
    expect(await asAdmin(admin.id, (tx) => tx.select().from(threads))).toHaveLength(0);
  });

  it('can read a message once it is reported', async () => {
    await owner.query(`insert into reports (reporter_id, target_type, target_user_id, message_id, reason) values ($1, 'message', $2, $3, 'spam')`, [c.id, b.id, msgBC]);
    const rows = await asAdmin(admin.id, (tx) => tx.select().from(messages).where(eq(messages.id, msgBC)));
    expect(rows[0]?.body).toBe('private hello');
  });

  it('cannot read passkeys or session tokens', async () => {
    expect(await asAdmin(admin.id, (tx) => tx.select().from(passkeys))).toHaveLength(0);
    expect(await asAdmin(admin.id, (tx) => tx.select().from(sessions).where(eq(sessions.userId, b.id)))).toHaveLength(0);
  });
});

describe('blocking', () => {
  it('a blocked member cannot start a conversation', async () => {
    const x = await makeUser();
    const y = await makeUser();
    await asMember(y.id, (tx) => tx.insert(blocks).values({ blockerId: y.id, blockedId: x.id }));
    expect(await denied(asMember(x.id, (tx) => tx.insert(threads).values({ senderId: x.id, recipientId: y.id })))).toBe(true);
    // ...and cannot see who blocked them.
    const visible = await asMember(x.id, (tx) => tx.select().from(blocks));
    expect(visible).toHaveLength(0);
  });

  it('members cannot create blocks on someone else\'s behalf', async () => {
    expect(await denied(asMember(a.id, (tx) => tx.insert(blocks).values({ blockerId: b.id, blockedId: c.id })))).toBe(true);
  });
});
