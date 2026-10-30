import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { replyAction } from '@/app/actions/member';
import { Notice } from '@/components/Notice';
import { messages, profiles, threads } from '@/db/schema';
import { isBlockedEitherWay, requireMember } from '@/lib/auth';
import { uuidSchema } from '@/lib/validation';

export const metadata: Metadata = { title: 'Conversation' };

const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' });

export default async function ThreadPage({ params, searchParams }: PageProps<'/messages/[id]'>) {
  const { user, db } = await requireMember();
  const { id } = await params;
  const { notice } = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();

  const d = await db(async (tx) => {
    const [t] = await tx.select().from(threads).where(eq(threads.id, id)); // RLS: participants only
    if (!t) return null;
    const otherId = t.senderId === user.userId ? t.recipientId : t.senderId;
    const [other] = await tx.select({ name: profiles.displayName }).from(profiles).where(eq(profiles.userId, otherId));
    const msgs = await tx.select().from(messages).where(eq(messages.threadId, id)).orderBy(asc(messages.createdAt));
    return { otherId, otherName: other?.name ?? null, msgs, blocked: await isBlockedEitherWay(tx, user.userId, otherId) };
  });
  if (!d) notFound();
  const name = d.otherName ?? 'Former member';

  return (
    <div className="stack">
      <p><Link href="/messages">← All messages</Link></p>
      <h1>Conversation with {d.otherName ? <Link href={`/members/${d.otherId}`}>{name}</Link> : name}</h1>
      <Notice code={notice} />
      <ol className="stack plain-list" aria-label="Messages">
        {d.msgs.map((m) => {
          const mine = m.senderId === user.userId;
          return (
            <li key={m.id} className={`msg${mine ? ' msg-mine' : ''}`}>
              <header>
                <span>{mine ? 'You' : name}</span>
                <span>
                  <time dateTime={m.createdAt.toISOString()}>{fmt.format(m.createdAt)}</time>
                  {!mine && <> · <Link href={`/report?type=message&id=${m.id}`}>Report</Link></>}
                </span>
              </header>
              <p>{m.body}</p>
            </li>
          );
        })}
      </ol>
      {d.blocked || !d.otherName ? (
        <p className="notice">Replies are unavailable for this conversation.</p>
      ) : (
        <form action={replyAction} className="form">
          <input type="hidden" name="threadId" value={id} />
          <label htmlFor="body">Reply</label>
          <textarea id="body" name="body" required maxLength={2000} />
          <div><button className="btn" type="submit">Send reply</button></div>
        </form>
      )}
    </div>
  );
}
