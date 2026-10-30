'use server';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { blocks, messages, profiles, recommendations, reports, REPORT_REASONS } from '@/db/schema';
import { audit } from '@/lib/audit';
import { requireMember, requireUser } from '@/lib/auth';
import { hit } from '@/lib/rate-limit';
import { reply, sendIntroduction } from '@/lib/services/messaging';
import { cleanText, messageSchema, optional, recommendationSchema, uuidSchema } from '@/lib/validation';
import { z } from 'zod';

const id = (v: FormDataEntryValue | null) => {
  const r = uuidSchema.safeParse(v);
  if (!r.success) redirect('/directory');
  return r.data;
};

export async function sendIntroAction(formData: FormData) {
  const { user, db } = await requireMember();
  const to = id(formData.get('recipientId'));
  const body = messageSchema.safeParse({ body: formData.get('body') });
  if (!body.success) redirect(`/members/${to}?notice=invalid`);
  const r = await db((tx) => sendIntroduction(tx, user.userId, to, body.data.body));
  if (!r.ok) redirect(`/members/${to}?notice=message_${r.error}`);
  redirect(`/messages/${r.threadId}?notice=message_sent`);
}

export async function replyAction(formData: FormData) {
  const { user, db } = await requireMember();
  const threadId = id(formData.get('threadId'));
  const body = messageSchema.safeParse({ body: formData.get('body') });
  if (!body.success) redirect(`/messages/${threadId}?notice=invalid`);
  const r = await db((tx) => reply(tx, user.userId, threadId, body.data.body));
  redirect(`/messages/${threadId}?notice=${r.ok ? 'message_sent' : `message_${r.error}`}`);
}

export async function recommendAction(formData: FormData) {
  const { user, db } = await requireMember();
  const subject = id(formData.get('subjectId'));
  const body = recommendationSchema.safeParse({ body: formData.get('body') });
  if (!body.success || subject === user.userId) redirect(`/members/${subject}?notice=invalid`);
  if (!(await hit('recommendationsPerDay', user.userId))) redirect(`/members/${subject}?notice=rate_limited`);
  const result = await db(async (tx) => {
    const [visible] = await tx.select({ id: profiles.userId }).from(profiles).where(eq(profiles.userId, subject));
    if (!visible) return 'invalid';
    const inserted = await tx.insert(recommendations).values({ subjectId: subject, authorId: user.userId, body: body.data.body })
      .onConflictDoNothing().returning({ id: recommendations.id });
    return inserted.length ? 'rec_saved' : 'rec_exists';
  });
  redirect(`/members/${subject}?notice=${result}`);
}

/** Authors can delete their own recommendation. */
export async function deleteOwnRecommendationAction(formData: FormData) {
  const { user, db } = await requireMember();
  const recId = id(formData.get('id'));
  const subject = id(formData.get('subjectId'));
  await db((tx) => tx.delete(recommendations).where(and(eq(recommendations.id, recId), eq(recommendations.authorId, user.userId))));
  redirect(`/members/${subject}?notice=rec_removed`);
}

/** Profile owners can hide/show recommendations about them. */
export async function setRecommendationHiddenAction(formData: FormData) {
  // Pending members may also manage what is shown on their own profile.
  const { user, db } = await requireUser();
  const recId = id(formData.get('id'));
  const hidden = formData.get('hidden') === 'true';
  await db((tx) => tx.update(recommendations).set({ hidden })
    .where(and(eq(recommendations.id, recId), eq(recommendations.subjectId, user.userId))));
  redirect('/profile?notice=rec_updated#recommendations');
}

export async function blockAction(formData: FormData) {
  const { user, db } = await requireMember();
  const target = id(formData.get('userId'));
  if (target === user.userId) redirect('/directory');
  await db(async (tx) => {
    await tx.insert(blocks).values({ blockerId: user.userId, blockedId: target }).onConflictDoNothing();
    await audit(tx, 'block.added', { actorId: user.userId, targetId: target });
  });
  redirect(`/members/${target}?notice=blocked`);
}

export async function unblockAction(formData: FormData) {
  const { user, db } = await requireUser();
  const target = id(formData.get('userId'));
  await db(async (tx) => {
    await tx.delete(blocks).where(and(eq(blocks.blockerId, user.userId), eq(blocks.blockedId, target)));
    await audit(tx, 'block.removed', { actorId: user.userId, targetId: target });
  });
  redirect(formData.get('from') === 'account' ? '/account?notice=unblocked' : `/members/${target}?notice=unblocked`);
}

const reportSchema = z.object({
  type: z.enum(['profile', 'message', 'recommendation']),
  targetId: uuidSchema,
  reason: z.enum(REPORT_REASONS),
  details: optional(cleanText(1000)),
});

export async function reportAction(formData: FormData) {
  const { user, db } = await requireMember();
  const r = reportSchema.safeParse(Object.fromEntries(formData));
  if (!r.success) redirect('/directory?notice=invalid');
  if (!(await hit('reportsPerDay', user.userId))) redirect('/directory?notice=rate_limited');
  const { type, targetId, reason, details } = r.data;
  const ok = await db(async (tx) => {
    // Resolve the target through RLS: you can only report what you can see.
    let targetUserId: string | null = null;
    if (type === 'profile') {
      const [p] = await tx.select({ id: profiles.userId }).from(profiles).where(eq(profiles.userId, targetId));
      targetUserId = p?.id ?? null;
    } else if (type === 'message') {
      const [m] = await tx.select({ sender: messages.senderId }).from(messages).where(eq(messages.id, targetId));
      targetUserId = m && m.sender !== user.userId ? m.sender : null;
    } else {
      const [rec] = await tx.select({ author: recommendations.authorId }).from(recommendations).where(eq(recommendations.id, targetId));
      targetUserId = rec?.author ?? null;
    }
    if (!targetUserId) return false;
    const [row] = await tx.insert(reports).values({
      reporterId: user.userId, targetType: type, targetUserId, reason, details,
      messageId: type === 'message' ? targetId : null,
      recommendationId: type === 'recommendation' ? targetId : null,
    }).returning({ id: reports.id });
    await audit(tx, 'report.created', { actorId: user.userId, targetId: row.id, meta: { type, reason } });
    return true;
  });
  redirect(ok ? '/directory?notice=reported' : '/directory?notice=invalid');
}
