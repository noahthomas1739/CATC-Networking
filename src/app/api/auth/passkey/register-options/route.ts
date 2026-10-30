import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { passkeys } from '@/db/schema';
import { getSession, mayRegisterPasskey } from '@/lib/auth';
import { systemDb } from '@/lib/db';
import { fail, saveChallenge } from '@/lib/passkey-routes';
import { rpID, rpName } from '@/lib/webauthn';

export async function POST() {
  const user = await getSession();
  if (!user) return fail(401);
  return systemDb(async (tx) => {
    const existing = await tx.select({ id: passkeys.id, transports: passkeys.transports })
      .from(passkeys).where(eq(passkeys.userId, user.userId));
    if (existing.length >= 10) return fail(400);
    if (!mayRegisterPasskey(user, existing.length)) return fail(403);
    const options = await generateRegistrationOptions({
      rpName,
      rpID: rpID(),
      userName: user.email,
      userID: Buffer.from(user.userId.replace(/-/g, ''), 'hex'),
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    await saveChallenge(tx, options.challenge, 'register', user.userId);
    return NextResponse.json(options);
  });
}
