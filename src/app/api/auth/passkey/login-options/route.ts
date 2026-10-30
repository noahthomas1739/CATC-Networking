import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { systemDb } from '@/lib/db';
import { fail, saveChallenge } from '@/lib/passkey-routes';
import { hit } from '@/lib/rate-limit';
import { ipHash } from '@/lib/request';
import { rpID } from '@/lib/webauthn';

export async function POST() {
  if (!(await hit('passkeyLoginPerIp', await ipHash()))) return fail(429);
  // Discoverable credentials: no allowCredentials list, so we never reveal
  // which accounts or credentials exist.
  const options = await generateAuthenticationOptions({ rpID: rpID(), userVerification: 'required' });
  await systemDb((tx) => saveChallenge(tx, options.challenge, 'authenticate', null));
  return NextResponse.json(options);
}
