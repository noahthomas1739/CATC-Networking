import 'server-only';
import { auditLog } from '@/db/schema';
import type { Tx } from './db';

export type AuditAction =
  | 'login.passkey' | 'login.magic_link' | 'login.failed' | 'logout' | 'magic_link.requested'
  | 'session.revoked' | 'session.revoked_all' | 'passkey.added' | 'passkey.removed'
  | 'invite.created' | 'invite.revoked' | 'invite.redeemed'
  | 'member.approved' | 'member.suspended' | 'member.reactivated' | 'member.removed' | 'member.role_changed'
  | 'account.exported' | 'account.deleted'
  | 'report.created' | 'report.resolved' | 'report.dismissed'
  | 'recommendation.removed' | 'category.created' | 'category.updated'
  | 'block.added' | 'block.removed';

type Meta = Record<string, string | number | boolean | null>;

/**
 * Append to the audit log inside the caller's transaction. Never pass
 * secrets, tokens, email addresses, or message contents in `meta`.
 */
export async function audit(
  tx: Tx,
  action: AuditAction,
  e: { actorId?: string | null; targetId?: string | null; meta?: Meta; ipHash?: string | null } = {},
) {
  await tx.insert(auditLog).values({
    action,
    actorId: e.actorId ?? null,
    targetId: e.targetId ?? null,
    meta: e.meta ?? {},
    ipHash: e.ipHash ?? null,
  });
}
