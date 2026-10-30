import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Awaiting approval' };

export default async function PendingPage() {
  const { user } = await requireUser();
  if (user.status === 'active') redirect('/directory');
  return (
    <div className="stack">
      <h1>Thanks for joining!</h1>
      <p>An administrator will review your account shortly. Until then the directory is hidden. We&rsquo;ll be ready when you sign in again.</p>
      <p>In the meantime you can <Link href="/profile">fill out your profile</Link> and <Link href="/account">add a passkey</Link> for easy sign-in.</p>
    </div>
  );
}
