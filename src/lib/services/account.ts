import 'server-only';
import { and, eq, or, inArray } from 'drizzle-orm';
import {
  blocks, contactMethods, messages, passkeys, profiles, recommendations, reports, sessions, threads, users,
} from '@/db/schema';
import type { Tx } from '../db';

/** Everything we hold about a member, for "download my data". Runs in the member's own context. */
export async function exportAccount(tx: Tx, userId: string) {
  const [account] = await tx.select().from(users).where(eq(users.id, userId));
  const [profile] = await tx.select().from(profiles).where(eq(profiles.userId, userId));
  const myThreads = await tx.select().from(threads).where(or(eq(threads.senderId, userId), eq(threads.recipientId, userId)));
  const threadIds = myThreads.map((t) => t.id);
  return {
    exportedAt: new Date().toISOString(),
    account,
    profile: profile ?? null,
    contactMethods: await tx.select().from(contactMethods).where(eq(contactMethods.userId, userId)),
    passkeys: (await tx.select({ id: passkeys.id, label: passkeys.label, createdAt: passkeys.createdAt, lastUsedAt: passkeys.lastUsedAt })
      .from(passkeys).where(eq(passkeys.userId, userId))),
    sessions: await tx.select({ device: sessions.device, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, authMethod: sessions.authMethod })
      .from(sessions).where(eq(sessions.userId, userId)),
    conversations: myThreads,
    messages: threadIds.length ? await tx.select().from(messages).where(inArray(messages.threadId, threadIds)) : [],
    recommendationsWritten: await tx.select().from(recommendations).where(eq(recommendations.authorId, userId)),
    recommendationsReceived: await tx.select().from(recommendations).where(eq(recommendations.subjectId, userId)),
    blockedMembers: await tx.select({ blockedId: blocks.blockedId, createdAt: blocks.createdAt }).from(blocks).where(eq(blocks.blockerId, userId)),
    reportsFiled: await tx.select({ id: reports.id, targetType: reports.targetType, reason: reports.reason, status: reports.status, createdAt: reports.createdAt })
      .from(reports).where(eq(reports.reporterId, userId)),
    note: 'Photos are not included in this file; your current photo is visible on your profile page.',
  };
}

/** Count active admins other than `userId` (to prevent removing the last admin). */
export async function otherActiveAdmins(tx: Tx, userId: string): Promise<number> {
  const rows = await tx.select({ id: users.id }).from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active')));
  return rows.filter((r) => r.id !== userId).length;
}

/**
 * Permanently delete an account. All personal data cascades (profile, photo,
 * contacts, passkeys, sessions, conversations, recommendations, blocks).
 * Reports keep their row with the user reference nulled. Must run in system
 * or admin context.
 */
export async function deleteAccount(tx: Tx, userId: string) {
  await tx.delete(users).where(eq(users.id, userId));
}
