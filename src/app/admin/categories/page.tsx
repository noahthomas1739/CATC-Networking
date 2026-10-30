import type { Metadata } from 'next';
import { asc } from 'drizzle-orm';
import { addCategoryAction, updateCategoryAction } from '@/app/actions/admin';
import { AdminNav } from '@/components/AdminNav';
import { Notice } from '@/components/Notice';
import { categories } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';

export const metadata: Metadata = { title: 'Categories · Admin' };

export default async function AdminCategories({ searchParams }: PageProps<'/admin/categories'>) {
  const { db } = await requireAdmin();
  const { notice } = await searchParams;
  const rows = await db((tx) => tx.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)));
  return (
    <div className="stack">
      <h1>Categories</h1>
      <AdminNav current="/admin/categories" />
      <Notice code={notice} />
      <form action={addCategoryAction} className="form card">
        <div>
          <label htmlFor="name">New category</label>
          <input id="name" name="name" type="text" required maxLength={60} />
        </div>
        <div><button className="btn" type="submit">Add category</button></div>
      </form>
      <p className="meta">Hidden categories disappear from the dropdowns. Members already using one keep it until they change it.</p>
      <ul className="plain-list stack">
        {rows.map((c) => (
          <li key={c.id} className="card">
            <form action={updateCategoryAction} className="btn-row">
              <input type="hidden" name="id" value={c.id} />
              <label className="sr-only" htmlFor={`cat-${c.id}`}>Name</label>
              <input id={`cat-${c.id}`} name="name" type="text" defaultValue={c.name} required maxLength={60} />
              <label className="sr-only" htmlFor={`act-${c.id}`}>Visibility</label>
              <select id={`act-${c.id}`} name="active" defaultValue={String(c.active)}>
                <option value="true">Shown</option>
                <option value="false">Hidden</option>
              </select>
              <button className="btn btn-secondary" type="submit">Save</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
