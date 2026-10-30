import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, inArray } from 'drizzle-orm';
import { AdminNav } from '@/components/AdminNav';
import { auditLog, profiles } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: 'Audit log · Admin' };
const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Chicago' });
const PAGE = 100;

export default async function AdminAudit({ searchParams }: PageProps<'/admin/audit'>) {
  const { db } = await requireAdmin();
  const page = Math.max(1, Math.min(1000, Number((await searchParams).page) || 1));
  const d = await db(async (tx) => {
    const rows = await tx.select().from(auditLog).orderBy(desc(auditLog.id)).limit(PAGE + 1).offset((page - 1) * PAGE);
    const ids = [...new Set(rows.flatMap((r) => [r.actorId, r.targetId]).filter((x): x is string => !!x))];
    const names = ids.length ? await tx.select({ id: profiles.userId, n: profiles.displayName }).from(profiles).where(inArray(profiles.userId, ids)) : [];
    return { rows, names: new Map(names.map((n) => [n.id, n.n])) };
  });
  const who = (id: string | null) => (id ? d.names.get(id) ?? `${id.slice(0, 8)}…` : '—');

  return (
    <div className="stack">
      <h1>Audit log</h1>
      <AdminNav current="/admin/audit" />
      <p className="meta">Security events and admin actions. Contains IDs only: never message contents, tokens, or passwords.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Event</th><th>By</th><th>Target</th><th>Details</th></tr></thead>
          <tbody>
            {d.rows.slice(0, PAGE).map((r) => (
              <tr key={r.id}>
                <td>{fmt.format(r.createdAt)}</td>
                <td>{r.action}</td>
                <td>{who(r.actorId)}</td>
                <td>{who(r.targetId)}</td>
                <td>{Object.keys(r.meta).length ? JSON.stringify(r.meta) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="pager">
        {page > 1 ? <Link href={`/admin/audit?page=${page - 1}`}>← Newer</Link> : <span />}
        {d.rows.length > PAGE ? <Link href={`/admin/audit?page=${page + 1}`}>Older →</Link> : <span />}
      </nav>
    </div>
  );
}
