'use server';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { categories, recommendations, reports, users } from '@/db/schema';
import { audit } from '@/lib/audit';
import { requireAdmin, revokeAllSessions } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { appOrigin } from '@/lib/env';
import { ipHash } from '@/lib/request';
import { deleteAccount, otherActiveAdmins } from '@/lib/services/account';
import { createInvite, INVITE_TTL_DAYS } from '@/lib/services/invites';
import { categoryNameSchema, emailSchema, uuidSchema } from '@/lib/validation';
import { invites } from '@/db/schema';

const memberAction = z.object({
  userId: uuidSchema,
  op: z.enum(['approve', 'suspend', 'reactivate', 'remove', 'make_admin', 'make_member']),
});

export async function memberAdminAction(formData: FormData) {
  const { user, db } = await requireAdmin();
  const p = memberAction.safeParse(Object.fromEntries(formData));
  if (!p.success || p.data.userId === user.userId) redirect('/admin/members?notice=invalid');
  const { userId, op } = p.data;
  const ip = await ipHash();
  const result = await db(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId));
    if (!target) return { notice: 'invalid' };
    const act = { actorId: user.userId, targetId: userId, ipHash: ip };
    switch (op) {
      case 'approve':
        if (target.status !== 'pending') return { notice: 'invalid' };
        await tx.update(users).set({ status: 'active', approvedAt: new Date(), approvedBy: user.userId }).where(eq(users.id, userId));
        await audit(tx, 'member.approved', act);
        return { notice: 'done', email: target.email };
      case 'suspend':
        if (target.role === 'admin' && (await otherActiveAdmins(tx, userId)) === 0) return { notice: 'last_admin' };
        await tx.update(users).set({ status: 'suspended' }).where(eq(users.id, userId));
        await revokeAllSessions(tx, userId); // takes effect immediately
        await audit(tx, 'member.suspended', act);
        return { notice: 'done' };
      case 'reactivate':
        if (target.status !== 'suspended') return { notice: 'invalid' };
        await tx.update(users).set({ status: 'active' }).where(eq(users.id, userId));
        await audit(tx, 'member.reactivated', act);
        return { notice: 'done' };
      case 'remove':
        if (target.role === 'admin' && (await otherActiveAdmins(tx, userId)) === 0) return { notice: 'last_admin' };
        await deleteAccount(tx, userId);
        await audit(tx, 'member.removed', act);
        return { notice: 'done' };
      case 'make_admin':
      case 'make_member': {
        const role = op === 'make_admin' ? 'admin' : 'member';
        if (role === 'member' && (await otherActiveAdmins(tx, userId)) === 0) return { notice: 'last_admin' };
        await tx.update(users).set({ role }).where(eq(users.id, userId));
        await revokeAllSessions(tx, userId); // new privileges require a fresh sign-in
        await audit(tx, 'member.role_changed', { ...act, meta: { role } });
        return { notice: 'done' };
      }
    }
  });
  if (result.email) {
    await sendEmail({
      to: result.email,
      subject: 'You’re approved for the CATC business directory',
      text: `Your account on the Church at the Cross business directory has been approved.\n\nSign in: ${appOrigin()}/login\n`,
    }).catch(() => {});
  }
  redirect(`/admin/members?notice=${result.notice}`);
}

export async function createInviteAction(formData: FormData) {
  const { user, db } = await requireAdmin();
  const email = emailSchema.safeParse(formData.get('email'));
  if (!email.success) redirect('/admin/invites?notice=invalid');
  const r = await db(async (tx) => {
    const inv = await createInvite(tx, { email: email.data, role: 'member', createdBy: user.userId });
    if ('error' in inv) return null;
    await audit(tx, 'invite.created', { actorId: user.userId, targetId: inv.id, ipHash: await ipHash() });
    return inv;
  });
  if (!r) redirect('/admin/invites?notice=invite_exists');
  await sendEmail({
    to: email.data,
    subject: 'You’re invited to the Church at the Cross business directory',
    text: `You've been invited to join a private directory where Church at the Cross members find and do business with each other.\n\n`
      + `Accept your invitation: ${r.url}\n\nThis link works once and expires in ${INVITE_TTL_DAYS} days.\n`,
  });
  redirect('/admin/invites?notice=invite_created');
}

export async function revokeInviteAction(formData: FormData) {
  const { user, db } = await requireAdmin();
  const id = uuidSchema.safeParse(formData.get('id'));
  if (!id.success) redirect('/admin/invites?notice=invalid');
  await db(async (tx) => {
    await tx.update(invites).set({ revokedAt: new Date() }).where(eq(invites.id, id.data));
    await audit(tx, 'invite.revoked', { actorId: user.userId, targetId: id.data });
  });
  redirect('/admin/invites?notice=invite_revoked');
}

const reportOp = z.object({ id: uuidSchema, op: z.enum(['resolve', 'dismiss', 'remove_recommendation']) });

export async function reportAdminAction(formData: FormData) {
  const { user, db } = await requireAdmin();
  const p = reportOp.safeParse(Object.fromEntries(formData));
  if (!p.success) redirect('/admin/reports?notice=invalid');
  await db(async (tx) => {
    const [r] = await tx.select().from(reports).where(eq(reports.id, p.data.id));
    if (!r) return;
    if (p.data.op === 'remove_recommendation' && r.recommendationId) {
      await tx.delete(recommendations).where(eq(recommendations.id, r.recommendationId));
      await audit(tx, 'recommendation.removed', { actorId: user.userId, targetId: r.recommendationId });
    }
    const status = p.data.op === 'dismiss' ? 'dismissed' : 'resolved';
    await tx.update(reports).set({ status, resolvedBy: user.userId, resolvedAt: new Date() }).where(eq(reports.id, r.id));
    await audit(tx, status === 'dismissed' ? 'report.dismissed' : 'report.resolved', { actorId: user.userId, targetId: r.id });
  });
  redirect('/admin/reports?notice=done');
}

export async function addCategoryAction(formData: FormData) {
  const { user, db } = await requireAdmin();
  const name = categoryNameSchema.safeParse(formData.get('name'));
  if (!name.success) redirect('/admin/categories?notice=invalid');
  await db(async (tx) => {
    const [c] = await tx.insert(categories).values({ name: name.data }).onConflictDoNothing().returning({ id: categories.id });
    if (c) await audit(tx, 'category.created', { actorId: user.userId, meta: { categoryId: c.id } });
  });
  redirect('/admin/categories?notice=done');
}

const catUpdate = z.object({ id: z.coerce.number().int().positive(), name: categoryNameSchema, active: z.enum(['true', 'false']) });

export async function updateCategoryAction(formData: FormData) {
  const { user, db } = await requireAdmin();
  const p = catUpdate.safeParse(Object.fromEntries(formData));
  if (!p.success) redirect('/admin/categories?notice=invalid');
  const ok = await db(async (tx) => {
    const [clash] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.name, p.data.name));
    if (clash && clash.id !== p.data.id) return false;
    await tx.update(categories).set({ name: p.data.name, active: p.data.active === 'true' }).where(and(eq(categories.id, p.data.id)));
    await audit(tx, 'category.updated', { actorId: user.userId, meta: { categoryId: p.data.id, active: p.data.active === 'true' } });
    return true;
  });
  redirect(`/admin/categories?notice=${ok ? 'done' : 'invalid'}`);
}
