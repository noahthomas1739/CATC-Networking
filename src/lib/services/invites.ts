import 'server-only';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { invites, profiles, users } from '@/db/schema';
import { randomToken, sha256 } from '../crypto';
import type { Tx } from '../db';
import { appOrigin } from '../env';

export const INVITE_TTL_DAYS = 7;

/** Creates a single-use invite. Any earlier open invite for the same email is revoked. */
export async function createInvite(
  tx: Tx,
  opts: { email: string; role: 'member' | 'admin'; createdBy: string | null },
): Promise<{ id: string; url: string; expiresAt: Date } | { error: 'exists' }> {
  const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, opts.email)).limit(1);
  if (existing) return { error: 'exists' };
  await tx.update(invites).set({ revokedAt: new Date() })
    .where(and(eq(invites.email, opts.email), isNull(invites.usedAt), isNull(invites.revokedAt)));
  const token = randomToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000);
  const [row] = await tx.insert(invites).values({
    tokenHash: sha256(token), email: opts.email, role: opts.role, createdBy: opts.createdBy, expiresAt,
  }).returning({ id: invites.id });
  return { id: row.id, url: `${appOrigin()}/invite/${token}`, expiresAt };
}

const validInvite = (token: string) => and(
  eq(invites.tokenHash, sha256(token)), isNull(invites.usedAt), isNull(invites.revokedAt), gt(invites.expiresAt, new Date()),
);

export async function findValidInvite(tx: Tx, token: string) {
  const [row] = await tx.select({ id: invites.id, email: invites.email, role: invites.role })
    .from(invites).where(validInvite(token)).limit(1);
  return row ?? null;
}

/**
 * Redeem atomically: the row is locked, so two concurrent requests with the
 * same token cannot both succeed. Admin invites (CLI only) are pre-approved;
 * every other account starts as pending.
 */
export async function redeemInvite(
  tx: Tx,
  token: string,
  input: { displayName: string; businessName: string },
): Promise<{ userId: string; role: 'member' | 'admin'; inviteId: string } | null> {
  const [inv] = await tx.select().from(invites).where(validInvite(token)).limit(1).for('update');
  if (!inv) return null;
  const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, inv.email)).limit(1);
  if (taken) return null;
  const now = new Date();
  const [user] = await tx.insert(users).values({
    email: inv.email,
    role: inv.role,
    status: inv.role === 'admin' ? 'active' : 'pending',
    approvedAt: inv.role === 'admin' ? now : null,
    ageConfirmedAt: now,
    termsAcceptedAt: now,
  }).returning({ id: users.id });
  await tx.insert(profiles).values({ userId: user.id, displayName: input.displayName, businessName: input.businessName });
  await tx.update(invites).set({ usedAt: now, usedBy: user.id }).where(eq(invites.id, inv.id));
  return { userId: user.id, role: inv.role, inviteId: inv.id };
}
