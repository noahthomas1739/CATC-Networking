import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq, or } from 'drizzle-orm';
import { profiles, threads } from '@/db/schema';
import { requireMember } from '@/lib/auth';

export const metadata: Metadata = { title: 'Messages' };

const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Chicago' });

export default async function MessagesPage() {
  const { user, db } = await requireMember();
  const rows = await db(async (tx) => {
    const ts = await tx.select().from(threads)
      .where(or(eq(threads.senderId, user.userId), eq(threads.recipientId, user.userId)))
      .orderBy(desc(threads.updatedAt)).limit(100);
    const names = new Map<string, { name: string; biz: string }>();
    for (const t of ts) {
      const other = t.senderId === user.userId ? t.recipientId : t.senderId;
      if (!names.has(other)) {
        const [p] = await tx.select({ name: profiles.displayName, biz: profiles.businessName }).from(profiles).where(eq(profiles.userId, other));
        names.set(other, p ? { name: p.name, biz: p.biz } : { name: 'Former member', biz: '' });
      }
    }
    return ts.map((t) => ({ t, other: names.get(t.senderId === user.userId ? t.recipientId : t.senderId)! }));
  });

  return (
    <div className="stack">
      <h1>Messages</h1>
      {rows.length === 0 ? (
        <p className="empty">No conversations yet. Find someone in the <Link href="/directory">directory</Link> and send an introduction.</p>
      ) : (
        <ul className="stack plain-list" aria-label="Conversations">
          {rows.map(({ t, other }) => (
            <li key={t.id} className="card">
              <Link href={`/messages/${t.id}`} className="member-card">
                <span>
                  <h3>{other.name}</h3>
                  <span className="meta">{other.biz ? `${other.biz} · ` : ''}{fmt.format(t.updatedAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
