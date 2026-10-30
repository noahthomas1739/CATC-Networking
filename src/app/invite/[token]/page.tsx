import type { Metadata } from 'next';
import Link from 'next/link';
import { redeemInviteAction } from '@/app/actions/auth';
import { Notice } from '@/components/Notice';
import { systemDb } from '@/lib/db';
import { hit } from '@/lib/rate-limit';
import { ipHash } from '@/lib/request';
import { findValidInvite } from '@/lib/services/invites';
import { tokenSchema } from '@/lib/validation';

export const metadata: Metadata = { title: 'Accept invitation' };

export default async function InvitePage({ params, searchParams }: PageProps<'/invite/[token]'>) {
  const { token } = await params;
  const { notice } = await searchParams;
  const valid = tokenSchema.safeParse(token).success && (await hit('inviteViewPerIp', await ipHash()));
  const invite = valid ? await systemDb((tx) => findValidInvite(tx, token)) : null;

  if (!invite) {
    return (
      <div className="stack">
        <h1>Invitation unavailable</h1>
        <p>This invitation link is invalid, has already been used, or has expired. Please ask the person who invited you for a new link.</p>
        <p><Link href="/login">Go to sign in</Link></p>
      </div>
    );
  }

  return (
    <div className="stack">
      <h1>Join the CATC Business Directory</h1>
      <p>You&rsquo;ve been invited to a private directory where Church at the Cross members can find and do business with each other.</p>
      <Notice code={notice} />
      <form action={redeemInviteAction} className="form">
        <input type="hidden" name="token" value={token} />
        <div>
          <span className="label">Email</span>
          <span>{invite.email}</span>
          <span className="hint">You&rsquo;ll use this address to sign in. It is never shown to other members unless you choose to.</span>
        </div>
        <div>
          <label htmlFor="displayName">Your name</label>
          <input id="displayName" name="displayName" type="text" required maxLength={80} autoComplete="name" />
        </div>
        <div>
          <label htmlFor="businessName">Business name</label>
          <input id="businessName" name="businessName" type="text" required maxLength={100} autoComplete="organization" />
        </div>
        <label className="check">
          <input type="checkbox" name="ageConfirm" required />
          <span>I confirm I am 18 years of age or older.</span>
        </label>
        <label className="check">
          <input type="checkbox" name="termsConfirm" required />
          <span>I agree to the <Link href="/terms" target="_blank">Terms of Use</Link> and <Link href="/privacy" target="_blank">Privacy Policy</Link>, and understand the church does not vouch for any member&rsquo;s business.</span>
        </label>
        <div><button className="btn" type="submit">Create my account</button></div>
        <p className="meta">An administrator will review your account before you can see the directory.</p>
      </form>
    </div>
  );
}
