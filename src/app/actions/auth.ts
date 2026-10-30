'use server';
import { redirect } from 'next/navigation';
import { endSession, getSession, startSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { hmac } from '@/lib/crypto';
import { systemDb } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { appOrigin } from '@/lib/env';
import { hit } from '@/lib/rate-limit';
import { ipHash } from '@/lib/request';
import { consumeMagicLink, issueMagicLink, MAGIC_LINK_TTL_MIN } from '@/lib/services/magic-links';
import { redeemInvite } from '@/lib/services/invites';
import { emailSchema, formObject, inviteRedeemSchema, tokenSchema } from '@/lib/validation';

export async function signOut() {
  const user = await getSession();
  if (user) await systemDb((tx) => audit(tx, 'logout', { actorId: user.userId }));
  await endSession();
  redirect('/login');
}

/** Always responds the same way, whether or not the account exists. */
export async function requestMagicLink(formData: FormData) {
  const parsed = emailSchema.safeParse(formData.get('email'));
  if (!parsed.success) redirect('/login?notice=invalid');
  const email = parsed.data;
  const ip = await ipHash();
  const allowed = (await hit('magicLinkPerIp', ip)) && (await hit('magicLinkPerEmail', hmac(`email:${email}`)));
  if (!allowed) redirect('/login?notice=rate_limited');

  const issued = await systemDb(async (tx) => {
    const r = await issueMagicLink(tx, email);
    if (r) await audit(tx, 'magic_link.requested', { actorId: r.userId, ipHash: ip });
    return r;
  });
  if (issued) {
    await sendEmail({
      to: email,
      subject: 'Your sign-in link for the CATC directory',
      text: `Use this link to sign in to the Church at the Cross business directory:\n\n`
        + `${appOrigin()}/auth/magic?token=${issued.token}\n\n`
        + `It works once and expires in ${MAGIC_LINK_TTL_MIN} minutes. If you didn't ask for this, you can ignore this email.\n`,
    }).catch(() => { /* respond identically even if delivery fails */ });
  }
  redirect('/login?notice=sent');
}

export async function consumeMagicLinkAction(formData: FormData) {
  const ip = await ipHash();
  if (!(await hit('magicLinkConsumePerIp', ip))) redirect('/login?notice=rate_limited');
  const token = tokenSchema.safeParse(formData.get('token'));
  if (!token.success) redirect('/login?notice=link_invalid');
  const ok = await systemDb(async (tx) => {
    const r = await consumeMagicLink(tx, token.data);
    if (!r) {
      await audit(tx, 'login.failed', { meta: { method: 'magic_link' }, ipHash: ip });
      return false;
    }
    await startSession(tx, r.userId, r.role, 'magic_link', false);
    await audit(tx, 'login.magic_link', { actorId: r.userId, ipHash: ip });
    return true;
  });
  redirect(ok ? '/directory' : '/login?notice=link_invalid');
}

export async function redeemInviteAction(formData: FormData) {
  const ip = await ipHash();
  const token = tokenSchema.safeParse(formData.get('token'));
  if (!token.success || !(await hit('inviteRedeemPerIp', ip))) redirect('/login?notice=link_invalid');
  const input = inviteRedeemSchema.safeParse(formObject(formData));
  if (!input.success) redirect(`/invite/${token.data}?notice=invalid`);
  const ok = await systemDb(async (tx) => {
    const r = await redeemInvite(tx, token.data, input.data);
    if (!r) return false;
    await audit(tx, 'invite.redeemed', { actorId: r.userId, targetId: r.inviteId, ipHash: ip });
    await startSession(tx, r.userId, r.role, 'invite', false);
    return true;
  });
  redirect(ok ? '/account?notice=welcome' : '/login?notice=link_invalid');
}
