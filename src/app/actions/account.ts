'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq, ne } from 'drizzle-orm';
import { passkeys, sessions } from '@/db/schema';
import { audit } from '@/lib/audit';
import { requireUser, revokeAllSessions, sessionCookieName } from '@/lib/auth';
import { systemDb } from '@/lib/db';
import { ipHash } from '@/lib/request';
import { deleteAccount, otherActiveAdmins } from '@/lib/services/account';
import { uuidSchema } from '@/lib/validation';

export async function removePasskeyAction(formData: FormData) {
  const { user, db } = await requireUser();
  const id = String(formData.get('id') ?? '').slice(0, 1024);
  const result = await db(async (tx) => {
    const mine = await tx.select({ id: passkeys.id }).from(passkeys).where(eq(passkeys.userId, user.userId));
    if (!mine.some((p) => p.id === id)) return 'invalid';
    if (user.role === 'admin' && mine.length <= 1) return 'last_passkey';
    await tx.delete(passkeys).where(and(eq(passkeys.id, id), eq(passkeys.userId, user.userId)));
    await audit(tx, 'passkey.removed', { actorId: user.userId });
    return 'passkey_removed';
  });
  redirect(`/account?notice=${result}`);
}

export async function revokeSessionAction(formData: FormData) {
  const { user, db } = await requireUser();
  const id = uuidSchema.safeParse(formData.get('id'));
  if (!id.success) redirect('/account?notice=invalid');
  await db(async (tx) => {
    await tx.delete(sessions).where(and(eq(sessions.id, id.data), eq(sessions.userId, user.userId)));
    await audit(tx, 'session.revoked', { actorId: user.userId });
  });
  if (id.data === user.sessionId) {
    (await cookies()).delete(sessionCookieName());
    redirect('/login');
  }
  redirect('/account?notice=session_revoked');
}

export async function revokeOtherSessionsAction() {
  const { user, db } = await requireUser();
  await db(async (tx) => {
    await tx.delete(sessions).where(and(eq(sessions.userId, user.userId), ne(sessions.id, user.sessionId)));
    await audit(tx, 'session.revoked_all', { actorId: user.userId });
  });
  redirect('/account?notice=sessions_revoked');
}

export async function deleteMyAccountAction(formData: FormData) {
  const { user } = await requireUser();
  if (formData.get('confirm') !== 'DELETE') redirect('/account?notice=confirm_delete#delete');
  const ip = await ipHash();
  const ok = await systemDb(async (tx) => {
    if (user.role === 'admin' && (await otherActiveAdmins(tx, user.userId)) === 0) return false;
    await revokeAllSessions(tx, user.userId);
    await deleteAccount(tx, user.userId);
    await audit(tx, 'account.deleted', { actorId: user.userId, targetId: user.userId, meta: { by: 'self' }, ipHash: ip });
    return true;
  });
  if (!ok) redirect('/account?notice=last_admin#delete');
  (await cookies()).delete(sessionCookieName());
  redirect('/login');
}
