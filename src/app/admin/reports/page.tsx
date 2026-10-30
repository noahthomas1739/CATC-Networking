import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq, inArray } from 'drizzle-orm';
import { reportAdminAction } from '@/app/actions/admin';
import { AdminNav } from '@/components/AdminNav';
import { Notice } from '@/components/Notice';
import { messages, profiles, recommendations, reports } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: 'Reports · Admin' };
const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' });

function Op({ id, op, label }: { id: string; op: string; label: string }) {
  return (
    <form action={reportAdminAction} className="inline-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <button className="btn btn-secondary" type="submit">{label}</button>
    </form>
  );
}

export default async function AdminReports({ searchParams }: PageProps<'/admin/reports'>) {
  const { db } = await requireAdmin();
  const { notice, show } = await searchParams;
  const d = await db(async (tx) => {
    const rows = await tx.select().from(reports)
      .where(show === 'all' ? undefined : eq(reports.status, 'open'))
      .orderBy(desc(reports.createdAt)).limit(200);
    const userIds = [...new Set(rows.flatMap((r) => [r.reporterId, r.targetUserId]).filter((x): x is string => !!x))];
    const msgIds = rows.map((r) => r.messageId).filter((x): x is string => !!x);
    const recIds = rows.map((r) => r.recommendationId).filter((x): x is string => !!x);
    // Admin RLS exposes message bodies only for reported messages.
    return {
      rows,
      names: new Map((userIds.length ? await tx.select({ id: profiles.userId, n: profiles.displayName }).from(profiles).where(inArray(profiles.userId, userIds)) : []).map((p) => [p.id, p.n])),
      msgs: new Map((msgIds.length ? await tx.select({ id: messages.id, body: messages.body }).from(messages).where(inArray(messages.id, msgIds)) : []).map((m) => [m.id, m.body])),
      recs: new Map((recIds.length ? await tx.select({ id: recommendations.id, body: recommendations.body }).from(recommendations).where(inArray(recommendations.id, recIds)) : []).map((r) => [r.id, r.body])),
    };
  });
  const name = (id: string | null) => (id && d.names.get(id)) || 'Deleted member';

  return (
    <div className="stack">
      <h1>Reports</h1>
      <AdminNav current="/admin/reports" />
      <Notice code={notice} />
      <p>{show === 'all' ? <Link href="/admin/reports">Show open only</Link> : <Link href="/admin/reports?show=all">Show all reports</Link>}</p>
      {d.rows.length === 0 && <p className="empty">No reports.</p>}
      <ul className="plain-list stack">
        {d.rows.map((r) => (
          <li key={r.id} className="card stack">
            <p className="meta">{fmt.format(r.createdAt)} · {r.status} · reported by {name(r.reporterId)}</p>
            <h3>{r.targetType} · {r.reason}</h3>
            <p>
              About: {r.targetUserId ? <Link href={`/members/${r.targetUserId}`}>{name(r.targetUserId)}</Link> : 'Deleted member'}
              {r.targetUserId && <> · <Link href={`/admin/members`}>Manage members</Link></>}
            </p>
            {r.messageId && <blockquote className="msg prewrap">{d.msgs.get(r.messageId) ?? '(message deleted)'}</blockquote>}
            {r.recommendationId && <blockquote className="msg prewrap">{d.recs.get(r.recommendationId) ?? '(recommendation deleted)'}</blockquote>}
            {r.details && <p className="prewrap"><strong>Reporter&rsquo;s note:</strong> {r.details}</p>}
            {r.status === 'open' && (
              <div className="btn-row">
                <Op id={r.id} op="resolve" label="Mark resolved" />
                <Op id={r.id} op="dismiss" label="Dismiss" />
                {r.recommendationId && d.recs.has(r.recommendationId) && <Op id={r.id} op="remove_recommendation" label="Remove recommendation" />}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
