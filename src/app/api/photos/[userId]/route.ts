import { eq } from 'drizzle-orm';
import { photos } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { withDb } from '@/lib/db';
import { uuidSchema } from '@/lib/validation';

// Photos live in the database (not the web root) and are served only to
// signed-in members, subject to the same RLS rules as profiles.
export async function GET(_req: Request, ctx: RouteContext<'/api/photos/[userId]'>) {
  const { userId } = await ctx.params;
  const user = await getSession();
  if (!user || !uuidSchema.safeParse(userId).success) return new Response('Not found', { status: 404 });
  const [row] = await withDb({ ctx: 'member', userId: user.userId }, (tx) =>
    tx.select({ data: photos.data }).from(photos).where(eq(photos.userId, userId)));
  if (!row) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
