import { afterAll, describe, expect, it } from 'vitest';
import { testOutbox } from '@/lib/email';
import { reply, sendIntroduction } from '@/lib/services/messaging';
import { asMember, makeUser, owner } from './helpers';

afterAll(() => owner.end());

describe('introductions', () => {
  it('notify the recipient without leaking the body or addresses', async () => {
    const s = await makeUser();
    const r = await makeUser();
    testOutbox.length = 0;
    const res = await asMember(s.id, (tx) => sendIntroduction(tx, s.id, r.id, 'SECRET-BODY please call me'));
    expect(res.ok).toBe(true);
    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0].to).toBe(r.email);
    expect(testOutbox[0].text).not.toContain('SECRET-BODY');
    expect(testOutbox[0].text).not.toContain(s.email);
  });

  it('new accounts are limited to 2 introductions per day', async () => {
    const s = await makeUser({ approvedDaysAgo: 1 });
    const results = [];
    for (let i = 0; i < 3; i++) {
      const r = await makeUser();
      results.push(await asMember(s.id, (tx) => sendIntroduction(tx, s.id, r.id, 'hi')));
    }
    expect(results.map((r) => r.ok)).toEqual([true, true, false]);
  });

  it('established accounts are limited to 10 per day', async () => {
    const s = await makeUser({ approvedDaysAgo: 60 });
    let sent = 0;
    for (let i = 0; i < 11; i++) {
      const r = await makeUser();
      if ((await asMember(s.id, (tx) => sendIntroduction(tx, s.id, r.id, 'hi'))).ok) sent++;
    }
    expect(sent).toBe(10);
  });

  it('blocked in either direction → unavailable, including replies', async () => {
    const s = await makeUser();
    const r = await makeUser();
    const first = await asMember(s.id, (tx) => sendIntroduction(tx, s.id, r.id, 'hi'));
    await owner.query('insert into blocks (blocker_id, blocked_id) values ($1, $2)', [r.id, s.id]);
    expect(await asMember(s.id, (tx) => sendIntroduction(tx, s.id, r.id, 'again'))).toEqual({ ok: false, error: 'unavailable' });
    if (!first.ok) throw new Error();
    expect(await asMember(s.id, (tx) => reply(tx, s.id, first.threadId, 'again'))).toEqual({ ok: false, error: 'unavailable' });
  });

  it('cannot message pending or suspended members', async () => {
    const s = await makeUser();
    for (const status of ['pending', 'suspended'] as const) {
      const r = await makeUser({ status });
      expect((await asMember(s.id, (tx) => sendIntroduction(tx, s.id, r.id, 'hi'))).ok).toBe(false);
    }
  });

  it('outsiders cannot reply into a thread', async () => {
    const s = await makeUser();
    const r = await makeUser();
    const x = await makeUser();
    const t = await asMember(s.id, (tx) => sendIntroduction(tx, s.id, r.id, 'hi'));
    if (!t.ok) throw new Error();
    expect(await asMember(x.id, (tx) => reply(tx, x.id, t.threadId, 'butting in'))).toEqual({ ok: false, error: 'unavailable' });
  });
});
