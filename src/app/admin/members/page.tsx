import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { memberAdminAction } from '@/app/actions/admin';
import { AdminNav } from '@/components/AdminNav';
import { Notice } from '@/components/Notice';
import { profiles, users } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: 'Members · Admin' };
const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Chicago' });
const STATUSES = ['pending', 'active', 'suspended'] as const;

function Op({ userId, op, label, danger, primary }: { userId: string; op: string; label: string; danger?: boolean; primary?: boolean }) {
  return (
    <form action={memberAdminAction} className="inline-form">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="op" value={op} />
      <button className={danger ? 'btn btn-danger' : primary ? 'btn' : 'btn btn-secondary'} type="submit">{label}</button>
    </form>
  );
}

export default async function AdminMembers({ searchParams }: PageProps<'/admin/members'>) {
  const { user, db } = await requireAdmin();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const rows = await db((tx) => tx.select({ u: users, p: profiles }).from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(status ? eq(users.status, status) : undefined)
    .orderBy(desc(users.createdAt)).limit(500));

  return (
    <div className="stack">
      <h1>Members</h1>
      <AdminNav current="/admin/members" />
      <Notice code={sp.notice} />
      <p className="btn-row">
        <Link href="/admin/members">All</Link>
        {STATUSES.map((s) => <Link key={s} href={`/admin/members?status=${s}`} aria-current={status === s ? 'page' : undefined}>{s[0].toUpperCase() + s.slice(1)}</Link>)}
      </p>
      <ul className="plain-list stack" aria-label="Members">
        {rows.map(({ u, p }) => (
          <li key={u.id} className="card stack">
            <div>
              <h3>{p?.displayName ?? 'No profile'}{u.role === 'admin' && <> <span className="tag">Admin</span></>}</h3>
              <p className="meta">
                {p?.businessName && <>{p.businessName}<br /></>}
                {u.email}<br />
                Status: <strong>{u.status}</strong> · joined {fmt.format(u.createdAt)}
              </p>
            </div>
            {u.id === user.userId ? <p className="meta">This is you.</p> : (
              <>
                <div className="btn-row">
                  {u.status === 'pending' && <Op userId={u.id} op="approve" label="Approve" primary />}
                  {u.status !== 'suspended' && <Op userId={u.id} op="suspend" label="Suspend" danger />}
                  {u.status === 'suspended' && <Op userId={u.id} op="reactivate" label="Reactivate" />}
                  {u.status === 'active' && u.role === 'member' && <Op userId={u.id} op="make_admin" label="Make admin" />}
                  {u.role === 'admin' && <Op userId={u.id} op="make_member" label="Remove admin" />}
                </div>
                <details>
                  <summary>Delete this account…</summary>
                  <p className="meta">Permanently deletes their profile, photo, messages and recommendations. This can&rsquo;t be undone.</p>
                  <Op userId={u.id} op="remove" label="Yes, delete permanently" danger />
                </details>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="meta">Suspending signs the member out everywhere immediately. Deleting permanently removes all of their data.</p>
    </div>
  );
}
