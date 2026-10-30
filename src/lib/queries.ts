import 'server-only';
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import { categories, photos, profiles } from '@/db/schema';
import type { Tx } from './db';
import { likeEscape } from './validation';

export const PAGE_SIZE = 20;

export async function activeCategories(tx: Tx) {
  return tx.select({ id: categories.id, name: categories.name }).from(categories)
    .where(eq(categories.active, true)).orderBy(asc(categories.sortOrder), asc(categories.name));
}

/** Directory search. RLS limits rows to active members for active viewers. */
export async function searchDirectory(tx: Tx, f: { q: string | null; category?: number; page: number }) {
  const conds = [];
  if (f.category) conds.push(eq(profiles.categoryId, f.category));
  if (f.q) {
    const p = `%${likeEscape(f.q)}%`;
    conds.push(or(
      ilike(profiles.displayName, p), ilike(profiles.businessName, p), ilike(profiles.description, p),
      ilike(profiles.services, p), ilike(profiles.serviceArea, p), ilike(categories.name, p),
    ));
  }
  return tx.select({
    userId: profiles.userId, displayName: profiles.displayName, businessName: profiles.businessName,
    serviceArea: profiles.serviceArea, category: categories.name, hasPhoto: sql<boolean>`${photos.userId} is not null`,
  })
    .from(profiles)
    .leftJoin(categories, eq(categories.id, profiles.categoryId))
    .leftJoin(photos, eq(photos.userId, profiles.userId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(profiles.businessName), asc(profiles.displayName))
    .limit(PAGE_SIZE + 1)
    .offset((f.page - 1) * PAGE_SIZE);
}
