import 'server-only';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { magicLinks, users } from '@/db/schema';
import { randomToken, sha256 } from '../crypto';
import type { Tx } from '../db';

export const MAGIC_LINK_TTL_MIN = 15;

/** Returns a token only for existing, non-suspended accounts. Callers must respond identically either way. */
export async function issueMagicLink(tx: Tx, email: string): Promise<{ token: string; userId: string } | null> {
  const [u] = await tx.select({ id: users.id, status: users.status }).from(users).where(eq(users.email, email)).limit(1);
  if (!u || u.status === 'suspended') return null;
  const token = randomToken();
  await tx.insert(magicLinks).values({
    tokenHash: sha256(token), userId: u.id, expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60_000),
  });
  return { token, userId: u.id };
}

/** Single use: marks the token used in the same statement that validates it. */
export async function consumeMagicLink(tx: Tx, token: string): Promise<{ userId: string; role: 'member' | 'admin' } | null> {
  const [link] = await tx.update(magicLinks).set({ usedAt: new Date() })
    .where(and(eq(magicLinks.tokenHash, sha256(token)), isNull(magicLinks.usedAt), gt(magicLinks.expiresAt, new Date())))
    .returning({ userId: magicLinks.userId });
  if (!link) return null;
  const [u] = await tx.select({ role: users.role, status: users.status }).from(users).where(eq(users.id, link.userId));
  if (!u || u.status === 'suspended') return null;
  return { userId: link.userId, role: u.role };
}
