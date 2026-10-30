// Usage: npm run admin:invite -- you@example.com
// Creates a single-use ADMIN invite (pre-approved) and emails it. Also prints
// the link to this terminal so the very first admin can bootstrap.
import { z } from 'zod';
import { auditLog } from '../src/db/schema';
import { createInvite, INVITE_TTL_DAYS } from '../src/lib/services/invites';
import { sendEmail } from '../src/lib/email';
import { ownerDb, ownerPool } from './_db';

async function main() {
  const email = z.string().trim().toLowerCase().pipe(z.email()).safeParse(process.argv[2]);
  if (!email.success) {
    console.error('Usage: npm run admin:invite -- someone@example.com');
    process.exit(1);
  }
  const pool = ownerPool();
  const db = ownerDb(pool);
  const r = await db.transaction(async (tx) => {
    const inv = await createInvite(tx, { email: email.data, role: 'admin', createdBy: null });
    if ('error' in inv) return null;
    await tx.insert(auditLog).values({ action: 'invite.created', targetId: inv.id, meta: { via: 'cli', role: 'admin' } });
    return inv;
  });
  await pool.end();
  if (!r) {
    console.error('An account with that email already exists.');
    process.exit(1);
  }
  try {
    await sendEmail({
      to: email.data,
      subject: 'Admin invitation: CATC business directory',
      text: `You've been invited to administer the Church at the Cross business directory.\n\n${r.url}\n\n`
        + `This link works once and expires in ${INVITE_TTL_DAYS} days. After joining, add a passkey; admin tools require one.\n`,
    });
    console.log(`Invite emailed to ${email.data}.`);
  } catch {
    console.log('Email could not be sent; share the link below securely.');
  }
  console.log(`\nSingle-use admin invite (expires ${r.expiresAt.toISOString()}):\n${r.url}\n`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
