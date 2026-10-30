import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { passkeys } from '@/db/schema';
import { audit } from '@/lib/audit';
import { getSession, mayRegisterPasskey } from '@/lib/auth';
import { systemDb } from '@/lib/db';
import { fail, readJson, takeChallenge } from '@/lib/passkey-routes';
import { deviceLabel, ipHash } from '@/lib/request';
import { expectedOrigin, rpID } from '@/lib/webauthn';

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return fail(401);
  const body = await readJson(req);
  if (!body) return fail();
  const label = await deviceLabel();
  const ip = await ipHash();
  return systemDb(async (tx) => {
    const ch = await takeChallenge(tx, 'register');
    if (!ch || ch.userId !== user.userId) return fail();
    const existing = await tx.select({ id: passkeys.id }).from(passkeys).where(eq(passkeys.userId, user.userId));
    if (existing.length >= 10 || !mayRegisterPasskey(user, existing.length)) return fail(403);
    let v;
    try {
      v = await verifyRegistrationResponse({
        response: body as RegistrationResponseJSON,
        expectedChallenge: ch.challenge,
        expectedOrigin: expectedOrigin(),
        expectedRPID: rpID(),
        requireUserVerification: true,
      });
    } catch {
      return fail();
    }
    if (!v.verified) return fail();
    const c = v.registrationInfo.credential;
    await tx.insert(passkeys).values({
      id: c.id, userId: user.userId, publicKey: Buffer.from(c.publicKey), counter: c.counter,
      transports: c.transports ?? [], label,
    });
    await audit(tx, 'passkey.added', { actorId: user.userId, ipHash: ip });
    return NextResponse.json({ ok: true });
  });
}
