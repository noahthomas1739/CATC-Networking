import type { Metadata } from 'next';
import { desc } from 'drizzle-orm';
import { createInviteAction, revokeInviteAction } from '@/app/actions/admin';
import { AdminNav } from '@/components/AdminNav';
import { Notice } from '@/components/Notice';
import { invites } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { INVITE_TTL_DAYS } from '@/lib/services/invites';

export const metadata: Metadata = { title: 'Invites · Admin' };
const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' });

export default async function AdminInvites({ searchParams }: PageProps<'/admin/invites'>) {
  const { db } = await requireAdmin();
  const { notice } = await searchParams;
  const rows = await db((tx) => tx.select({
    id: invites.id, email: invites.email, role: invites.role, createdAt: invites.createdAt, expiresAt: invites.expiresAt,
    usedAt: invites.usedAt, revokedAt: invites.revokedAt,
  }).from(invites).orderBy(desc(invites.createdAt)).limit(200));
  const now = new Date();
  const state = (r: (typeof rows)[number]) =>
    r.usedAt ? 'Used' : r.revokedAt ? 'Revoked' : r.expiresAt < now ? 'Expired' : 'Open';

  return (
    <div className="stack">
      <h1>Invites</h1>
      <AdminNav current="/admin/invites" />
      <Notice code={notice} />
      <form action={createInviteAction} className="form card">
        <div>
          <label htmlFor="email">Invite a member by email
            <span className="hint">They&rsquo;ll get a single-use link that expires in {INVITE_TTL_DAYS} days. You&rsquo;ll still approve their account after they sign up.</span>
          </label>
          <input id="email" name="email" type="email" required maxLength={254} />
        </div>
        <div><button className="btn" type="submit">Send invite</button></div>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Email</th><th>Status</th><th>Created</th><th>Expires</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.email}{r.role === 'admin' && <> <span className="tag">Admin</span></>}</td>
                <td>{state(r)}</td>
                <td>{fmt.format(r.createdAt)}</td>
                <td>{fmt.format(r.expiresAt)}</td>
                <td>{state(r) === 'Open' && (
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn-link" type="submit">Revoke</button>
                  </form>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
