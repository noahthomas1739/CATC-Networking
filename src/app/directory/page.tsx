import type { Metadata } from 'next';
import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { requireBrowsingMember } from '@/lib/auth';
import { activeCategories, PAGE_SIZE, searchDirectory } from '@/lib/queries';
import { searchSchema } from '@/lib/validation';

export const metadata: Metadata = { title: 'Directory' };

export default async function DirectoryPage({ searchParams }: PageProps<'/directory'>) {
  const { db } = await requireBrowsingMember();
  const f = searchSchema.parse(await searchParams);
  const [cats, rows] = await db(async (tx) => [await activeCategories(tx), await searchDirectory(tx, f)] as const);
  const results = rows.slice(0, PAGE_SIZE);
  const qs = (page: number) => {
    const p = new URLSearchParams();
    if (f.q) p.set('q', f.q);
    if (f.category) p.set('category', String(f.category));
    p.set('page', String(page));
    return `/directory?${p}`;
  };

  return (
    <>
      <h1>Member businesses</h1>
      <form className="search-bar" role="search" action="/directory">
        <div>
          <label htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={f.q ?? ''} placeholder="e.g. roofer, CPA, photographer" maxLength={80} />
        </div>
        <div>
          <label htmlFor="category">Category</label>
          <select id="category" name="category" defaultValue={f.category ?? ''}>
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><button className="btn" type="submit">Search</button></div>
      </form>

      {results.length === 0 ? (
        <p className="empty">No members found. Try a different search or category.</p>
      ) : (
        <ul className="grid grid-2" aria-label="Results">
          {results.map((m) => (
            <li key={m.userId} className="card">
              <Link className="member-card" href={`/members/${m.userId}`}>
                <Avatar userId={m.userId} name={m.displayName} hasPhoto={m.hasPhoto} />
                <span>
                  <h3>{m.businessName}</h3>
                  <span className="meta">{m.displayName}{m.serviceArea ? ` · ${m.serviceArea}` : ''}</span>
                  {m.category && <><br /><span className="tag">{m.category}</span></>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <nav className="pager" aria-label="Pages">
        {f.page > 1 ? <Link href={qs(f.page - 1)}>← Previous</Link> : <span />}
        {rows.length > PAGE_SIZE ? <Link href={qs(f.page + 1)}>Next →</Link> : <span />}
      </nav>
    </>
  );
}
