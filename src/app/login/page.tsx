import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requestMagicLink } from '@/app/actions/auth';
import { Notice } from '@/components/Notice';
import { PasskeyLogin } from '@/components/PasskeyLogin';
import { getSession } from '@/lib/auth';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  if (await getSession()) redirect('/directory');
  const { notice } = await searchParams;
  return (
    <>
      <div className="hero">
        <h1>Find &amp; support businesses in our church family</h1>
        <p>A private directory for Church at the Cross members.</p>
      </div>
      <div className="stack">
        <h2>Sign in</h2>
        <Notice code={notice} />
        <PasskeyLogin />
        <h3>Or get a sign-in link by email</h3>
        <form action={requestMagicLink} className="form">
          <div>
            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" autoComplete="email webauthn" required maxLength={254} />
          </div>
          <div><button className="btn btn-secondary" type="submit">Email me a link</button></div>
        </form>
        <p className="meta">Membership is by invitation only. If you&rsquo;re a member of Church at the Cross and would like access, ask a directory administrator for an invite.</p>
      </div>
    </>
  );
}
