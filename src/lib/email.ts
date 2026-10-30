import 'server-only';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';

export type Email = { to: string; subject: string; text: string };

/** Test hook: emails sent while NODE_ENV=test are collected here. */
export const testOutbox: Email[] = [];

/**
 * Plain-text email only: no HTML templating means no HTML injection from
 * member-supplied names. Never include message contents in emails.
 */
export async function sendEmail(mail: Email): Promise<void> {
  const e = env();
  if (e.NODE_ENV === 'test') {
    testOutbox.push(mail);
    return;
  }
  if (!e.RESEND_API_KEY) {
    // Local development: write to .dev-mail/ (gitignored) instead of sending.
    const dir = path.join(process.cwd(), '.dev-mail');
    await mkdir(dir, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    await writeFile(path.join(dir, name), `To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`, { mode: 0o600 });
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: e.EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
  });
  if (!res.ok) {
    // Status only; the response body could echo the recipient address.
    throw new Error(`Email provider returned ${res.status}`);
  }
}

/** Strip characters that could break a plain-text email or header line. */
export function plain(s: string): string {
  return s.replace(/[\r\n\t\u0000-\u001f\u007f]/g, ' ').slice(0, 120);
}
