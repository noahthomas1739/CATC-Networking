import 'server-only';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Runtime connection as the restricted `catc_app` role (never the owner).
  DATABASE_URL: z.string().url(),
  // Public origin of the site, e.g. https://directory.example.org
  APP_URL: z.string().url(),
  // Secret used to HMAC IP addresses for rate limiting and the audit log.
  HASH_SECRET: z.string().min(32),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(3).default('CATC Directory <directory@localhost>'),
  CRON_SECRET: z.string().min(32).optional(),
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  // Treat empty variables (e.g. `CRON_SECRET=` in .env) as unset.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // Only report variable names, never values.
    const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid or missing environment variables: ${names}`);
  }
  const e = parsed.data;
  // A localhost APP_URL is only usable on the developer's own machine (passkeys
  // are bound to the hostname), so local production builds may use http and
  // the .dev-mail outbox.
  const local = new URL(e.APP_URL).hostname === 'localhost';
  if (e.NODE_ENV === 'production' && !local) {
    if (!e.APP_URL.startsWith('https://')) throw new Error('APP_URL must be https in production');
    if (!e.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required in production');
  }
  cached = e;
  return e;
}

export function appOrigin(): string {
  return new URL(env().APP_URL).origin;
}

export function isSecureOrigin(): boolean {
  return appOrigin().startsWith('https://');
}
