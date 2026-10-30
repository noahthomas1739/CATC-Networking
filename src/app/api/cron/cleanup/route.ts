import { lt, or, isNotNull, sql } from 'drizzle-orm';
import { invites, magicLinks, rateLimits, sessions, webauthnChallenges } from '@/db/schema';
import { safeEqual } from '@/lib/crypto';
import { systemDb } from '@/lib/db';
import { env } from '@/lib/env';

// Called daily by Vercel Cron (see vercel.json) with Authorization: Bearer $CRON_SECRET.
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  const given = req.headers.get('authorization') ?? '';
  if (!secret || !safeEqual(given, `Bearer ${secret}`)) return new Response('Not found', { status: 404 });
  const now = new Date();
  const day = (n: number) => new Date(now.getTime() - n * 86400_000);
  await systemDb(async (tx) => {
    await tx.delete(sessions).where(or(lt(sessions.expiresAt, now),
      sql`${sessions.lastSeenAt} < now() - make_interval(secs => ${sessions.idleSeconds})`));
    await tx.delete(magicLinks).where(or(lt(magicLinks.expiresAt, now), isNotNull(magicLinks.usedAt)));
    await tx.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, now));
    await tx.delete(invites).where(lt(invites.expiresAt, day(90)));
    await tx.delete(rateLimits).where(lt(rateLimits.windowStart, day(2)));
  });
  // audit_log is append-only for the app role. Entries older than a year are
  // pruned by the owner-run nightly backup workflow (.github/workflows/backup.yml).
  return Response.json({ ok: true });
}
