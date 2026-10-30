import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from '@simplewebauthn/server';
import { passkeys, users } from '@/db/schema';
import { audit } from '@/lib/audit';
import { startSession } from '@/lib/auth';
import { systemDb } from '@/lib/db';
import { fail, readJson, takeChallenge } from '@/lib/passkey-routes';
import { hit, isLocked } from '@/lib/rate-limit';
import { ipHash } from '@/lib/request';
import { expectedOrigin, rpID } from '@/lib/webauthn';

export async function POST(req: Request) {
  const ip = await ipHash();
  if (await isLocked('passkeyFailPerIp', ip)) return fail(429);
  const body = (await readJson(req)) as AuthenticationResponseJSON | null;

  const ok = await systemDb(async (tx) => {
    const ch = await takeChallenge(tx, 'authenticate');
    if (!ch || !body || typeof body.id !== 'string' || body.id.length > 1024) return false;
    const [pk] = await tx.select().from(passkeys).where(eq(passkeys.id, body.id)).limit(1);
    if (!pk) return false;
    const [u] = await tx.select({ role: users.role, status: users.status }).from(users).where(eq(users.id, pk.userId));
    if (!u || u.status === 'suspended') return false;
    let v;
    try {
      v = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: ch.challenge,
        expectedOrigin: expectedOrigin(),
        expectedRPID: rpID(),
        credential: { id: pk.id, publicKey: new Uint8Array(pk.publicKey), counter: pk.counter, transports: pk.transports as never },
        requireUserVerification: true,
      });
    } catch {
      return false;
    }
    if (!v.verified) return false;
    await tx.update(passkeys).set({ counter: v.authenticationInfo.newCounter, lastUsedAt: new Date() }).where(eq(passkeys.id, pk.id));
    await startSession(tx, pk.userId, u.role, 'passkey', v.authenticationInfo.userVerified);
    await audit(tx, 'login.passkey', { actorId: pk.userId, ipHash: ip });
    return true;
  });

  if (!ok) {
    await hit('passkeyFailPerIp', ip);
    await systemDb((tx) => audit(tx, 'login.failed', { meta: { method: 'passkey' }, ipHash: ip }));
    return fail(401);
  }
  return NextResponse.json({ ok: true });
}
