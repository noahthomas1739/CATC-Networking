import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { and, eq, gt } from 'drizzle-orm';
import { webauthnChallenges } from '@/db/schema';
import type { Tx } from './db';
import { isSecureOrigin } from './env';
import { CHALLENGE_COOKIE } from './webauthn';

export const fail = (status = 400) => NextResponse.json({ ok: false }, { status });

export async function readJson(req: Request): Promise<unknown | null> {
  if (!req.headers.get('content-type')?.startsWith('application/json')) return null;
  const text = await req.text();
  if (text.length > 20_000) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export async function saveChallenge(tx: Tx, challenge: string, purpose: 'register' | 'authenticate', userId: string | null) {
  const [row] = await tx.insert(webauthnChallenges).values({
    challenge, purpose, userId, expiresAt: new Date(Date.now() + 5 * 60_000),
  }).returning({ id: webauthnChallenges.id });
  (await cookies()).set(CHALLENGE_COOKIE, row.id, {
    httpOnly: true, secure: isSecureOrigin(), sameSite: 'strict', path: '/api/auth/passkey', maxAge: 300,
  });
}

/** Fetch and delete (single use) the challenge referenced by the cookie. */
export async function takeChallenge(tx: Tx, purpose: 'register' | 'authenticate') {
  const jar = await cookies();
  const id = jar.get(CHALLENGE_COOKIE)?.value;
  jar.delete(CHALLENGE_COOKIE);
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await tx.delete(webauthnChallenges)
    .where(and(eq(webauthnChallenges.id, id), eq(webauthnChallenges.purpose, purpose), gt(webauthnChallenges.expiresAt, new Date())))
    .returning();
  return row ?? null;
}
