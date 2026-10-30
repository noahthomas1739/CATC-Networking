'use client';
import { startRegistration } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function PasskeyRegister() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const opts = await fetch('/api/auth/passkey/register-options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!opts.ok) throw new Error(opts.status === 403 ? 'admin' : 'fail');
      const response = await startRegistration({ optionsJSON: await opts.json() });
      const res = await fetch('/api/auth/passkey/register-verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(response),
      });
      if (!res.ok) throw new Error();
      router.replace('/account?notice=passkey_added');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.message === 'admin'
        ? 'For security, admins must sign in with an existing passkey before adding another.'
        : 'The passkey wasn’t added. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <button type="button" className="btn" onClick={add} disabled={busy}>{busy ? 'Follow your device’s prompt…' : 'Add a passkey'}</button>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
    </div>
  );
}
