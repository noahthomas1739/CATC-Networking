import 'server-only';
import { and, eq, or } from 'drizzle-orm';
import { messages, profiles, threads, users } from '@/db/schema';
import { isBlockedEitherWay } from '../auth';
import type { Tx } from '../db';
import { systemDb } from '../db';
import { plain, sendEmail } from '../email';
import { appOrigin } from '../env';
import { hit } from '../rate-limit';

export const NEW_ACCOUNT_DAYS = 7;

export type SendResult = { ok: true; threadId: string } | { ok: false; error: 'limit' | 'unavailable' };

/** Approved within the last NEW_ACCOUNT_DAYS days → stricter introduction limit. */
export async function isNewAccount(tx: Tx, userId: string): Promise<boolean> {
  const [me] = await tx.select({ approvedAt: users.approvedAt }).from(users).where(eq(users.id, userId));
  return !me?.approvedAt || Date.now() - me.approvedAt.getTime() < NEW_ACCOUNT_DAYS * 86400_000;
}

/**
 * Start (or continue) a conversation. Runs as the sender in member context,
 * so RLS independently checks: sender active, recipient active, no block.
 */
export async function sendIntroduction(tx: Tx, senderId: string, recipientId: string, body: string): Promise<SendResult> {
  if (senderId === recipientId) return { ok: false, error: 'unavailable' };
  if (await isBlockedEitherWay(tx, senderId, recipientId)) return { ok: false, error: 'unavailable' };
  const [recipient] = await tx.select({ id: profiles.userId }).from(profiles).where(eq(profiles.userId, recipientId));
  if (!recipient) return { ok: false, error: 'unavailable' }; // not visible to us (inactive or missing)

  // Existing conversation in either direction → treat as a reply.
  const [existing] = await tx.select({ id: threads.id }).from(threads).where(or(
    and(eq(threads.senderId, senderId), eq(threads.recipientId, recipientId)),
    and(eq(threads.senderId, recipientId), eq(threads.recipientId, senderId)),
  )).limit(1);
  if (existing) return reply(tx, senderId, existing.id, body);

  const limit = (await isNewAccount(tx, senderId)) ? 'introPerDayNewAccount' : 'introPerDay';
  if (!(await hit(limit, senderId))) return { ok: false, error: 'limit' };

  const [t] = await tx.insert(threads).values({ senderId, recipientId }).returning({ id: threads.id });
  await tx.insert(messages).values({ threadId: t.id, senderId, body });
  await notify(senderId, recipientId, t.id, true);
  return { ok: true, threadId: t.id };
}

export async function reply(tx: Tx, senderId: string, threadId: string, body: string): Promise<SendResult> {
  const [t] = await tx.select().from(threads).where(eq(threads.id, threadId)); // RLS: participants only
  if (!t) return { ok: false, error: 'unavailable' };
  const other = t.senderId === senderId ? t.recipientId : t.senderId;
  if (await isBlockedEitherWay(tx, senderId, other)) return { ok: false, error: 'unavailable' };
  if (!(await hit('repliesPerDay', senderId))) return { ok: false, error: 'limit' };
  await tx.insert(messages).values({ threadId, senderId, body });
  await tx.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, threadId));
  if (await hit('replyNotifyPerThread', `${threadId}:${other}`)) await notify(senderId, other, threadId, false);
  return { ok: true, threadId };
}

/**
 * Email the recipient that something is waiting. The recipient's address is
 * read in system context and never shown to the sender; the message body is
 * never put in the email.
 */
async function notify(senderId: string, recipientId: string, threadId: string, isNew: boolean) {
  const r = await systemDb(async (tx) => {
    const [to] = await tx.select({ email: users.email, status: users.status }).from(users).where(eq(users.id, recipientId));
    const [from] = await tx.select({ name: profiles.displayName, biz: profiles.businessName }).from(profiles).where(eq(profiles.userId, senderId));
    return { to, from };
  });
  if (!r.to || r.to.status !== 'active' || !r.from) return;
  const who = `${plain(r.from.name)} (${plain(r.from.biz)})`;
  await sendEmail({
    to: r.to.email,
    subject: isNew ? 'New introduction on the CATC directory' : 'New reply on the CATC directory',
    text: `${who} sent you ${isNew ? 'an introduction' : 'a reply'} on the CATC business directory.\n\n`
      + `Sign in to read it: ${appOrigin()}/messages/${threadId}\n\n`
      + `For your privacy, message contents are never included in email. Your email address was not shared.\n`,
  }).catch(() => { /* delivery failure must not fail the send; message is in-app */ });
}
