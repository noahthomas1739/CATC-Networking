import type { Metadata } from 'next';
import { desc, eq } from 'drizzle-orm';
import {
  deleteMyAccountAction, removePasskeyAction, revokeOtherSessionsAction, revokeSessionAction,
} from '@/app/actions/account';
import { unblockAction } from '@/app/actions/member';
import { Notice } from '@/components/Notice';
import { PasskeyRegister } from '@/components/PasskeyRegister';
import { blocks, passkeys, profiles, sessions } from '@/db/schema';
import { requireUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Account' };

const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' });
const METHOD = { passkey: 'Passkey', magic_link: 'Email link', invite: 'Invitation' } as const;

export default async function AccountPage({ searchParams }: PageProps<'/account'>) {
  const { user, db } = await requireUser();
  const { notice } = await searchParams;
  const d = await db(async (tx) => ({
    keys: await tx.select({ id: passkeys.id, label: passkeys.label, createdAt: passkeys.createdAt, lastUsedAt: passkeys.lastUsedAt })
      .from(passkeys).where(eq(passkeys.userId, user.userId)).orderBy(desc(passkeys.createdAt)),
    sess: await tx.select().from(sessions).where(eq(sessions.userId, user.userId)).orderBy(desc(sessions.lastSeenAt)),
    blocked: await tx.select({ id: blocks.blockedId, name: profiles.displayName }).from(blocks)
      .leftJoin(profiles, eq(profiles.userId, blocks.blockedId)).where(eq(blocks.blockerId, user.userId)),
  }));

  return (
    <div className="stack">
      <h1>Account</h1>
      <Notice code={notice} />
      <p className="meta">Signed in as {user.email}. Your email is never shown to other members.</p>

      <section className="card">
        <h2>Passkeys</h2>
        <p>A passkey lets you sign in with your phone&rsquo;s face or fingerprint unlock, or your computer&rsquo;s PIN. There is no password to steal.{user.role === 'admin' ? ' Admin tools require a passkey sign-in.' : ''}</p>
        {d.keys.length > 0 && (
          <ul className="plain-list stack">
            {d.keys.map((k) => (
              <li key={k.id} className="btn-row">
                <span>{k.label} · added {fmt.format(k.createdAt)}{k.lastUsedAt ? ` · last used ${fmt.format(k.lastUsedAt)}` : ''}</span>
                <form action={removePasskeyAction} className="inline-form">
                  <input type="hidden" name="id" value={k.id} />
                  <button className="btn-link" type="submit">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <PasskeyRegister />
      </section>

      <section className="card">
        <h2>Where you&rsquo;re signed in</h2>
        <ul className="plain-list stack">
          {d.sess.map((s) => (
            <li key={s.id} className="btn-row">
              <span>
                {s.device || 'Unknown device'} · {METHOD[s.authMethod]} · last active {fmt.format(s.lastSeenAt)}
                {s.id === user.sessionId && <strong> (this device)</strong>}
              </span>
              <form action={revokeSessionAction} className="inline-form">
                <input type="hidden" name="id" value={s.id} />
                <button className="btn-link" type="submit">Sign out</button>
              </form>
            </li>
          ))}
        </ul>
        {d.sess.length > 1 && (
          <form action={revokeOtherSessionsAction}><button className="btn btn-secondary" type="submit">Sign out all other devices</button></form>
        )}
      </section>

      <section className="card">
        <h2>Blocked members</h2>
        {d.blocked.length === 0 ? <p className="meta">You haven&rsquo;t blocked anyone.</p> : (
          <ul className="plain-list stack">
            {d.blocked.map((b) => (
              <li key={b.id} className="btn-row">
                <span>{b.name ?? 'Member'}</span>
                <form action={unblockAction} className="inline-form">
                  <input type="hidden" name="userId" value={b.id} />
                  <input type="hidden" name="from" value="account" />
                  <button className="btn-link" type="submit">Unblock</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Your data</h2>
        <p>Download a copy of everything the directory stores about you.</p>
        <p><a className="btn btn-secondary" href="/api/account/export" download>Download my data</a></p>
      </section>

      <section className="card" id="delete">
        <h2>Delete my account</h2>
        <p>This permanently deletes your profile, photo, contact details, messages, recommendations and sign-in methods right away. Copies in encrypted backups are erased within 30 days. This can&rsquo;t be undone.</p>
        <form action={deleteMyAccountAction} className="form">
          <div>
            <label htmlFor="confirm">Type DELETE to confirm</label>
            <input id="confirm" name="confirm" type="text" autoComplete="off" required pattern="DELETE" />
          </div>
          <div><button className="btn btn-danger" type="submit">Delete my account</button></div>
        </form>
      </section>
    </div>
  );
}
