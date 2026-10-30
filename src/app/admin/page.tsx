import type { Metadata } from 'next';
import Link from 'next/link';
import { count, eq } from 'drizzle-orm';
import { AdminNav } from '@/components/AdminNav';
import { reports, users } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: 'Admin' };

export default async function AdminHome() {
  const { db } = await requireAdmin();
  const d = await db(async (tx) => ({
    pending: (await tx.select({ n: count() }).from(users).where(eq(users.status, 'pending')))[0].n,
    active: (await tx.select({ n: count() }).from(users).where(eq(users.status, 'active')))[0].n,
    openReports: (await tx.select({ n: count() }).from(reports).where(eq(reports.status, 'open')))[0].n,
  }));
  return (
    <div className="stack">
      <h1>Admin</h1>
      <AdminNav current="/admin" />
      <div className="grid grid-2">
        <div className="card"><h2>{d.pending}</h2><p><Link href="/admin/members?status=pending">Members awaiting approval</Link></p></div>
        <div className="card"><h2>{d.openReports}</h2><p><Link href="/admin/reports">Open reports</Link></p></div>
        <div className="card"><h2>{d.active}</h2><p><Link href="/admin/members">Active members</Link></p></div>
      </div>
      <p className="meta">Every admin action is recorded in the audit log. Admins cannot read members&rsquo; private messages unless a message has been reported.</p>
    </div>
  );
}
