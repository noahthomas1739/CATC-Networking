'use client';
import { startAuthentication } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function PasskeyLogin() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const opts = await fetch('/api/auth/passkey/login-options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!opts.ok) throw new Error(opts.status === 429 ? 'rate' : 'fail');
      const response = await startAuthentication({ optionsJSON: await opts.json() });
      const res = await fetch('/api/auth/passkey/login-verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(response),
      });
      if (!res.ok) throw new Error(res.status === 429 ? 'rate' : 'fail');
      router.replace('/directory');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.message === 'rate'
        ? 'Too many attempts. Please wait a while and try again.'
        : 'Passkey sign-in didn’t work. Try again, or use an email link below.');
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <button type="button" className="btn" onClick={signIn} disabled={busy}>
        {busy ? 'Waiting for passkey…' : 'Sign in with a passkey'}
      </button>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
    </div>
  );
}
