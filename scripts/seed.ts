// Usage: npm run db:seed            → default categories only (safe anywhere)
//        npm run db:seed -- --demo  → plus FAKE demo members (development only)
import { sql } from 'drizzle-orm';
import { categories, contactMethods, messages, profiles, recommendations, threads, users } from '../src/db/schema';
import { ownerDb, ownerPool } from './_db';

const CATEGORIES = [
  'Accounting & Tax', 'Auto Repair', 'Cleaning', 'Construction & Remodeling', 'Electrical', 'Financial Planning',
  'Food & Catering', 'Health & Wellness', 'HVAC', 'Insurance', 'IT & Technology', 'Landscaping & Lawn Care',
  'Legal', 'Marketing & Design', 'Painting', 'Photography & Video', 'Plumbing', 'Real Estate', 'Roofing',
  'Tutoring & Education', 'Other',
];

const DEMO = [
  { email: 'admin@example.com', name: 'Avery Admin', biz: 'Directory Admin', cat: 'Other', role: 'admin', status: 'active' },
  { email: 'roofer@example.com', name: 'Jordan Miller', biz: 'Miller Roofing Co.', cat: 'Roofing', status: 'active',
    desc: 'Family-owned roofing serving Northeast Tarrant County for 15 years. Storm damage, replacements and repairs.',
    services: 'Roof replacement\nStorm & hail damage inspections\nGutters', area: 'Grapevine, Southlake, Colleyville',
    phone: '817-555-0101', web: 'https://example.com/miller-roofing' },
  { email: 'cpa@example.com', name: 'Taylor Nguyen', biz: 'Nguyen Tax & Advisory', cat: 'Accounting & Tax', status: 'active',
    desc: 'CPA helping small businesses and families with tax planning, bookkeeping and payroll.',
    services: 'Individual & business tax returns\nBookkeeping\nPayroll setup', area: 'DFW (remote available)', email2: 'taylor@example.com' },
  { email: 'photo@example.com', name: 'Riley Brooks', biz: 'Brooks Photography', cat: 'Photography & Video', status: 'active',
    desc: 'Portraits, events and headshots.', area: 'Grapevine' },
  { email: 'pending@example.com', name: 'Casey Pending', biz: 'Pending Plumbing', cat: 'Plumbing', status: 'pending' },
  { email: 'suspended@example.com', name: 'Sam Suspended', biz: 'Suspended Sales LLC', cat: 'Other', status: 'suspended' },
] as const;

async function main() {
  const demo = process.argv.includes('--demo');
  if (demo && process.env.NODE_ENV === 'production') {
    console.error('Refusing to load demo data with NODE_ENV=production.');
    process.exit(1);
  }
  const pool = ownerPool();
  const db = ownerDb(pool);
  await db.transaction(async (tx) => {
    for (const [i, name] of CATEGORIES.entries()) {
      await tx.insert(categories).values({ name, sortOrder: name === 'Other' ? 999 : i }).onConflictDoNothing();
    }
    if (!demo) return;
    const cats = new Map((await tx.select().from(categories)).map((c) => [c.name, c.id]));
    const ids: Record<string, string> = {};
    const now = new Date();
    const approved = new Date(now.getTime() - 30 * 86400_000);
    for (const m of DEMO) {
      const [u] = await tx.insert(users).values({
        email: m.email, role: 'role' in m ? m.role : 'member', status: m.status,
        ageConfirmedAt: now, termsAcceptedAt: now, approvedAt: m.status === 'pending' ? null : approved,
      }).onConflictDoUpdate({ target: users.email, set: { status: m.status } }).returning({ id: users.id });
      ids[m.email] = u.id;
      await tx.insert(profiles).values({
        userId: u.id, displayName: m.name, businessName: m.biz, categoryId: cats.get(m.cat) ?? null,
        description: 'desc' in m ? m.desc : null, services: 'services' in m ? m.services : null,
        serviceArea: 'area' in m ? m.area : null,
      }).onConflictDoNothing();
      if ('phone' in m) await tx.insert(contactMethods).values({ userId: u.id, kind: 'phone', value: m.phone, visible: true }).onConflictDoNothing();
      if ('web' in m) await tx.insert(contactMethods).values({ userId: u.id, kind: 'website', value: m.web, visible: true }).onConflictDoNothing();
      if ('email2' in m) await tx.insert(contactMethods).values({ userId: u.id, kind: 'email', value: m.email2, visible: false }).onConflictDoNothing();
    }
    await tx.insert(recommendations).values({
      subjectId: ids['roofer@example.com'], authorId: ids['cpa@example.com'],
      body: 'Jordan replaced our roof after the spring hail. On time, fair price, and cleaned up everything.',
    }).onConflictDoNothing();
    const existing = await tx.execute(sql`select 1 from threads limit 1`);
    if (existing.rows.length === 0) {
      const [t] = await tx.insert(threads).values({ senderId: ids['photo@example.com'], recipientId: ids['cpa@example.com'] }).returning();
      await tx.insert(messages).values({ threadId: t.id, senderId: ids['photo@example.com'], body: 'Hi Taylor, I need help setting up bookkeeping for my studio. Do you take new clients?' });
    }
  });
  await pool.end();
  console.log(demo ? 'Seeded categories and demo members (all @example.com).' : 'Seeded categories.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
