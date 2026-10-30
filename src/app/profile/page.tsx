import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { removePhotoAction, saveProfileAction, uploadPhotoAction } from '@/app/actions/profile';
import { setRecommendationHiddenAction } from '@/app/actions/member';
import { Avatar } from '@/components/Avatar';
import { Notice } from '@/components/Notice';
import { contactMethods, photos, profiles, recommendations } from '@/db/schema';
import { requireUser } from '@/lib/auth';
import { activeCategories } from '@/lib/queries';

export const metadata: Metadata = { title: 'My profile' };

export default async function ProfilePage({ searchParams }: PageProps<'/profile'>) {
  const { user, db } = await requireUser();
  const { notice } = await searchParams;
  const d = await db(async (tx) => {
    const [p] = await tx.select().from(profiles).where(eq(profiles.userId, user.userId));
    const [photo] = await tx.select({ id: photos.userId }).from(photos).where(eq(photos.userId, user.userId));
    const contacts = await tx.select().from(contactMethods).where(eq(contactMethods.userId, user.userId));
    const recs = await tx.select({ r: recommendations, author: profiles.displayName }).from(recommendations)
      .leftJoin(profiles, eq(profiles.userId, recommendations.authorId))
      .where(eq(recommendations.subjectId, user.userId)).orderBy(desc(recommendations.createdAt));
    return { p, hasPhoto: !!photo, contacts, recs, cats: await activeCategories(tx) };
  });
  const c = (k: string) => d.contacts.find((x) => x.kind === k);
  const p = d.p;

  return (
    <div className="stack">
      <h1>My profile</h1>
      <Notice code={notice} />
      {user.status === 'active' && <p><Link href={`/members/${user.userId}`}>See how others see your profile →</Link></p>}

      <section className="card">
        <h2>Photo <span className="hint">Optional</span></h2>
        <div className="member-card">
          <Avatar userId={user.userId} name={p?.displayName ?? '?'} hasPhoto={d.hasPhoto} large />
          <div className="stack">
            <form action={uploadPhotoAction} className="form">
              <label htmlFor="photo">Upload a photo
                <span className="hint">JPEG, PNG or WebP, up to 5 MB. We crop it square and remove location and camera data.</span>
              </label>
              <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required />
              <div><button className="btn btn-secondary" type="submit">Upload</button></div>
            </form>
            {d.hasPhoto && (
              <form action={removePhotoAction}><button className="btn-link" type="submit">Remove photo</button></form>
            )}
          </div>
        </div>
      </section>

      <form action={saveProfileAction} className="form">
        <div>
          <label htmlFor="displayName">Your name</label>
          <input id="displayName" name="displayName" type="text" required maxLength={80} defaultValue={p?.displayName ?? ''} />
        </div>
        <div>
          <label htmlFor="businessName">Business name</label>
          <input id="businessName" name="businessName" type="text" required maxLength={100} defaultValue={p?.businessName ?? ''} />
        </div>
        <div>
          <label htmlFor="categoryId">Category</label>
          <select id="categoryId" name="categoryId" defaultValue={p?.categoryId ?? ''}>
            <option value="">Choose a category</option>
            {d.cats.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="description">Short description <span className="hint">Optional, 600 characters max.</span></label>
          <textarea id="description" name="description" maxLength={600} defaultValue={p?.description ?? ''} />
        </div>
        <div>
          <label htmlFor="services">Services offered <span className="hint">Optional.</span></label>
          <textarea id="services" name="services" maxLength={600} defaultValue={p?.services ?? ''} />
        </div>
        <div>
          <label htmlFor="serviceArea">Service area <span className="hint">Optional, e.g. &ldquo;Grapevine, Southlake, Colleyville&rdquo;. Please don&rsquo;t enter a street address.</span></label>
          <input id="serviceArea" name="serviceArea" type="text" maxLength={120} defaultValue={p?.serviceArea ?? ''} />
        </div>

        <fieldset>
          <legend>Contact details (optional)</legend>
          <p className="hint">Members can always reach you with &ldquo;Send introduction&rdquo; without seeing your details. Each item below is shown only if you tick &ldquo;Show to members&rdquo;.</p>
          {([
            ['email', 'Business email', 'email'],
            ['phone', 'Phone', 'tel'],
            ['website', 'Website', 'url'],
          ] as const).map(([kind, label, type]) => (
            <div key={kind} className="stack">
              <div>
                <label htmlFor={`${kind}.value`}>{label}</label>
                <input id={`${kind}.value`} name={`${kind}.value`} type={type === 'url' ? 'text' : type} inputMode={type === 'url' ? 'url' : undefined}
                  maxLength={200} defaultValue={c(kind)?.value ?? ''} />
              </div>
              <label className="check">
                <input type="checkbox" name={`${kind}.visible`} defaultChecked={c(kind)?.visible ?? false} />
                <span>Show to members</span>
              </label>
            </div>
          ))}
          <div>
            <label htmlFor="contactNote">Contact preferences <span className="hint">Optional, e.g. &ldquo;Text preferred, weekdays after 5pm&rdquo;.</span></label>
            <input id="contactNote" name="contactNote" type="text" maxLength={200} defaultValue={p?.contactNote ?? ''} />
          </div>
        </fieldset>
        <div><button className="btn" type="submit">Save profile</button></div>
      </form>

      <section id="recommendations">
        <h2>Recommendations about you</h2>
        {d.recs.length === 0 && <p className="meta">None yet.</p>}
        <ul className="stack plain-list">
          {d.recs.map(({ r, author }) => (
            <li key={r.id} className="card">
              <p className="prewrap">&ldquo;{r.body}&rdquo;</p>
              <p className="meta">— {author ?? 'A member'}{r.hidden ? ' · Hidden from others' : ''}</p>
              <form action={setRecommendationHiddenAction}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="hidden" value={r.hidden ? 'false' : 'true'} />
                <button className="btn-link" type="submit">{r.hidden ? 'Show on my profile' : 'Hide from my profile'}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
