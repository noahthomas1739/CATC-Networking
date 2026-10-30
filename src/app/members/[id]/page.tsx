import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import {
  blockAction, deleteOwnRecommendationAction, recommendAction, sendIntroAction, unblockAction,
} from '@/app/actions/member';
import { Avatar } from '@/components/Avatar';
import { Notice } from '@/components/Notice';
import { blocks, categories, contactMethods, photos, profiles, recommendations } from '@/db/schema';
import { isBlockedEitherWay, requireBrowsingMember } from '@/lib/auth';
import { uuidSchema } from '@/lib/validation';

export const metadata: Metadata = { title: 'Member' };

export default async function MemberPage({ params, searchParams }: PageProps<'/members/[id]'>) {
  const { user, db } = await requireBrowsingMember();
  const { id } = await params;
  const { notice } = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();

  const data = await db(async (tx) => {
    // RLS returns nothing for inactive members or hidden contact fields.
    const [p] = await tx.select({ p: profiles, category: categories.name })
      .from(profiles).leftJoin(categories, eq(categories.id, profiles.categoryId)).where(eq(profiles.userId, id));
    if (!p) return null;
    const [photo] = await tx.select({ id: photos.userId }).from(photos).where(eq(photos.userId, id));
    const contacts = await tx.select().from(contactMethods).where(and(eq(contactMethods.userId, id), eq(contactMethods.visible, true)));
    const recs = await tx.select({ r: recommendations, author: profiles.displayName })
      .from(recommendations).innerJoin(profiles, eq(profiles.userId, recommendations.authorId))
      .where(and(eq(recommendations.subjectId, id), eq(recommendations.hidden, false)))
      .orderBy(desc(recommendations.createdAt));
    const [iBlocked] = await tx.select().from(blocks).where(and(eq(blocks.blockerId, user.userId), eq(blocks.blockedId, id)));
    const blocked = await isBlockedEitherWay(tx, user.userId, id);
    return { ...p, hasPhoto: !!photo, contacts, recs, iBlocked: !!iBlocked, blocked };
  });
  if (!data) notFound();

  const { p } = data;
  const self = id === user.userId;
  const mine = data.recs.find((r) => r.r.authorId === user.userId);
  const contact = (k: string) => data.contacts.find((c) => c.kind === k)?.value;

  return (
    <article className="stack">
      <Notice code={notice} />
      <div className="member-card">
        <Avatar userId={id} name={p.displayName} hasPhoto={data.hasPhoto} large />
        <div>
          <h1>{p.businessName}</h1>
          <p className="meta">{p.displayName}{p.serviceArea ? ` · Serves ${p.serviceArea}` : ''}</p>
          {data.category && <span className="tag">{data.category}</span>}
        </div>
      </div>

      {p.description && <section><h2>About</h2><p className="prewrap">{p.description}</p></section>}
      {p.services && <section><h2>Services</h2><p className="prewrap">{p.services}</p></section>}

      <section>
        <h2>Contact</h2>
        {data.contacts.length === 0 && !p.contactNote && <p className="meta">This member prefers to be contacted through the directory.</p>}
        <ul>
          {contact('email') && <li>Email: <a href={`mailto:${contact('email')}`}>{contact('email')}</a></li>}
          {contact('phone') && <li>Phone: <a href={`tel:${contact('phone')!.replace(/[^0-9+]/g, '')}`}>{contact('phone')}</a></li>}
          {contact('website') && <li>Website: <a href={contact('website')} rel="noopener noreferrer nofollow ugc" target="_blank">{contact('website')}</a></li>}
        </ul>
        {p.contactNote && <p className="prewrap">{p.contactNote}</p>}
      </section>

      {self ? (
        <p><Link className="btn btn-secondary" href="/profile">Edit my profile</Link></p>
      ) : data.blocked ? (
        <div className="notice">
          {data.iBlocked ? 'You have blocked this member.' : 'Messaging is unavailable for this member.'}
          {data.iBlocked && (
            <form action={unblockAction} className="inline-form">
              <input type="hidden" name="userId" value={id} />
              <button className="btn-link" type="submit">Unblock</button>
            </form>
          )}
        </div>
      ) : (
        <section className="card">
          <h2>Send an introduction</h2>
          <p className="meta">They&rsquo;ll get an email saying you reached out. Neither of your email addresses is shared.</p>
          <form action={sendIntroAction} className="form">
            <input type="hidden" name="recipientId" value={id} />
            <label htmlFor="body" className="sr-only">Message</label>
            <textarea id="body" name="body" required maxLength={2000} placeholder="Hi! I'm looking for help with…" />
            <div><button className="btn" type="submit">Send introduction</button></div>
          </form>
        </section>
      )}

      <section>
        <h2>Recommendations</h2>
        {data.recs.length === 0 && <p className="meta">No recommendations yet.</p>}
        <ul className="stack plain-list" aria-label="Recommendations">
          {data.recs.map(({ r, author }) => (
            <li key={r.id} className="card">
              <p className="prewrap">&ldquo;{r.body}&rdquo;</p>
              <p className="meta">— {author}</p>
              <div className="btn-row">
                {r.authorId === user.userId ? (
                  <form action={deleteOwnRecommendationAction} className="inline-form">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="subjectId" value={id} />
                    <button className="btn-link" type="submit">Delete my recommendation</button>
                  </form>
                ) : (
                  <Link href={`/report?type=recommendation&id=${r.id}`}>Report</Link>
                )}
              </div>
            </li>
          ))}
        </ul>
        {!self && !mine && (
          <form action={recommendAction} className="form">
            <input type="hidden" name="subjectId" value={id} />
            <label htmlFor="rec">I&rsquo;ve worked with this person
              <span className="hint">A short note about your experience (500 characters max). It will show your name.</span>
            </label>
            <textarea id="rec" name="body" required maxLength={500} />
            <div><button className="btn btn-secondary" type="submit">Post recommendation</button></div>
          </form>
        )}
      </section>

      {!self && (
        <section className="btn-row">
          <Link href={`/report?type=profile&id=${id}`}>Report this profile</Link>
          {!data.iBlocked && (
            <form action={blockAction} className="inline-form">
              <input type="hidden" name="userId" value={id} />
              <button className="btn-link" type="submit">Block this member</button>
            </form>
          )}
        </section>
      )}
      <p className="meta">The church does not vouch for, endorse, or guarantee any member&rsquo;s business or services. Please use your own judgment.</p>
    </article>
  );
}
