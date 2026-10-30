# CATC Business Directory

A private, invitation-only business directory for members of **Church at the Cross** (Grapevine, TX), so members can find and do business with each other: "I need a roofer," "I'm a CPA looking for clients."

> A member-run community directory for Church at the Cross. Not an official church website.

- **Stack:** Next.js 16 (App Router, TypeScript), PostgreSQL with row-level security, Drizzle ORM, passkeys via SimpleWebAuthn, Zod, sharp. Hosting is Vercel + Neon, with email through Resend.
- **Security model:** see [SECURITY.md](SECURITY.md).
- **Open decisions** for church leadership: see [DECISIONS.md](DECISIONS.md).

## Features

| | |
|---|---|
| Invite-only | Admins send single-use invites that expire in 7 days. There is no public sign-up. |
| Admin approval | New accounts stay **pending** and see nothing until an admin approves them. Suspension takes effect immediately. |
| Sign-in | Passkeys (Face ID, fingerprint or device PIN) are the primary method; a 15-minute single-use email link is the fallback. There are no passwords. Admin tools require a passkey sign-in. |
| Profiles | Name and business are required. Photo, category, description, services, service area and contact preferences are optional, and each contact field has its own "show to members" switch. |
| Directory | Keyword search and category filter. Nothing is visible when logged out, and nothing is indexable. |
| Introductions | In-app messages. The recipient gets an email notice that contains neither the message text nor the sender's address. |
| Recommendations | "I've worked with this person" notes. The profile owner can hide them; admins can remove them. |
| Safety | Report on every profile, message and recommendation; block; per-member message limits; a stricter limit during an account's first week. |
| Admin | Approve, suspend or delete members; manage invites; review reports; view the audit log; edit categories. |
| Your data | Members can see and revoke their active sessions, download their data as JSON, and delete their account. |

## Local development

Requirements: Node 22 and PostgreSQL 16+ (or Docker).

```bash
npm ci

# 1. Database. The owner role runs migrations; the app connects as the restricted catc_app role.
#    With a local Postgres superuser:
psql -U postgres -c "create role catc_owner login password 'dev-owner-password' createrole"
psql -U postgres -c "create database catc owner catc_owner"
psql -U postgres -d catc -c "create extension citext; create extension pgcrypto"
#    For tests, repeat the last two lines with database name catc_test.

# 2. Environment
cp .env.example .env            # then set HASH_SECRET: openssl rand -base64 48

# 3. Schema, categories, and optional fake demo members (all @example.com)
npm run db:migrate
npm run db:seed -- --demo

# 4. Run
npm run dev                     # http://localhost:3000
```

**Signing in locally.** With `RESEND_API_KEY` empty, emails are written to `.dev-mail/` (gitignored) instead of being sent. Request a sign-in link for `admin@example.com` (or any demo address) and open the link from the newest file. Passkeys work on `http://localhost` in Chrome, Safari and Firefox.

**First admin (local or production):**

```bash
npm run admin:invite -- you@example.com
```

This creates a single-use, pre-approved **admin** invite, emails it, and prints the link to your terminal. After joining, add a passkey on the Account page, sign out, and sign back in with the passkey to unlock the admin tools.

### Checks

```bash
npm run typecheck && npm run lint && npm test
```

`npm test` rebuilds the `catc_test` database from migrations and runs the authorization suite as the restricted app role. That includes RLS tests such as "member A cannot read member B's private data" and "unapproved users see nothing", plus tests for the auth flows, rate limits, CSRF, input validation, EXIF stripping and messaging limits. Override the owner connection with `TEST_DATABASE_URL_MIGRATE` if yours differs.

**End-to-end smoke test** (optional, needs Playwright + Chromium): runs the whole flow in a phone-sized browser with a virtual passkey. That covers invite, passkey, approval, messaging, limits, reports, blocking, suspension, export, and checks that admin MFA can't be bypassed via email. See the header of `e2e/smoke.mjs`.

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel | **Pooled** Neon URL for the `catc_app` role (never the owner). The app refuses to start if this role is a superuser, can bypass RLS, or owns tables. |
| `APP_URL` | Vercel | Public origin, e.g. `https://directory.example.org`. Passkeys are bound to this hostname, so changing it later means members must add new passkeys. |
| `HASH_SECRET` | Vercel | 32+ random characters, used to HMAC IP addresses for rate limiting and the audit log. |
| `RESEND_API_KEY` | Vercel | Resend API key (sending access only, restricted to your domain). |
| `EMAIL_FROM` | Vercel | e.g. `CATC Directory <directory@your-domain.org>`. Must be on the domain you verified in Resend. |
| `CRON_SECRET` | Vercel | 32+ random characters. Vercel Cron sends it to `/api/cron/cleanup`. |
| `DATABASE_URL_MIGRATE` | your machine / CI only | **Direct** (unpooled) Neon URL for the owner role. Used only by `db:migrate`, `db:seed` and `admin:invite`. **Never put this in Vercel.** |
| `APP_DB_PASSWORD` | your machine only | Password that `db:migrate` assigns to `catc_app`. |

Secrets live only in Vercel's environment settings and your local `.env`. `.env*` is gitignored except `.env.example`.

## Deploying (Vercel + Neon)

1. **Neon:** create a project in a US region (e.g. `aws-us-east-2`) on Postgres 16 or 17. Copy the owner's **direct** connection string.
2. **Migrate** from your machine, with the owner URL and a strong app password (`openssl rand -base64 32`):
   ```bash
   DATABASE_URL_MIGRATE='postgres://neondb_owner:…@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require' \
   APP_DB_PASSWORD='…' npm run db:migrate
   DATABASE_URL_MIGRATE='…' npm run db:seed          # categories only
   ```
   The migration creates `catc_app` with SQL, **not** in the Neon console. Console-created roles join `neon_superuser`, which can bypass RLS.
3. **App connection string:** take Neon's *pooled* host (`-pooler`), with user `catc_app`, your `APP_DB_PASSWORD`, and `?sslmode=require`.
4. **Resend:** verify your sending domain (SPF + DKIM, and add a DMARC record), then create an API key with "sending access" for that domain only.
5. **Vercel:** import the GitHub repo. Set the variables in the table above (Production scope), set the Node.js version to 22, and choose a function region near your Neon region. Add your custom domain. HTTPS and HSTS are automatic.
6. **Cron:** `vercel.json` schedules a daily cleanup of expired sessions, links and invites. Vercel sends `CRON_SECRET` automatically.
7. **First admin:** `DATABASE_URL_MIGRATE=… APP_URL=https://your-domain … npm run admin:invite -- you@example.com`. The script needs `APP_URL`, `HASH_SECRET`, `DATABASE_URL` and the Resend variables in your local environment so the link points at production and the email sends.
8. **Backups:** add the `BACKUP_DATABASE_URL` and `BACKUP_AGE_RECIPIENT` repository secrets (see below).
9. **Optional hardening:** enable Vercel Deployment Protection for preview deployments, and turn on Neon IP Allow (paid plans) for the owner role.

## Backups and restore

There are two layers:

- **Neon point-in-time restore.** The restore window depends on your plan (7 days on Launch). Use this for "undo the last hour" incidents.
- **Nightly encrypted dump.** `.github/workflows/backup.yml` runs `pg_dump`, encrypts the output with [age](https://age-encryption.org) to a public key, and stores it as a GitHub Actions artifact for **30 days**. Only the holder of the private key can decrypt it.

**One-time setup:**

```bash
age-keygen -o catc-backup-key.txt     # keep this file OFFLINE (password manager + printed copy)
# Copy the "public key: age1…" line into the repo secret BACKUP_AGE_RECIPIENT.
# Put the Neon owner direct URL into the repo secret BACKUP_DATABASE_URL.
```

**Restore from Neon PITR:** in the Neon console go to *Branches → Create branch → from a point in time*, verify the data on that branch, then either restore it to the main branch or point Vercel's `DATABASE_URL` at it.

**Restore from an encrypted dump** (this procedure was tested locally with a full dump and restore):

```bash
gh run download <run-id> -n catc-db-backup                 # or download from the Actions UI
age -d -i catc-backup-key.txt catc-YYYYMMDD….dump.age > restore.dump
# On the target database (a fresh Neon branch or project), as the owner:
psql "$OWNER_URL" -c "create role catc_app login nobypassrls password '<APP_DB_PASSWORD>'"   # skip if it exists
pg_restore --no-owner --exit-on-error -d "$OWNER_URL" restore.dump
DATABASE_URL_MIGRATE="$OWNER_URL" APP_DB_PASSWORD='…' npm run db:migrate   # no-op apart from the role password
```

Then check that RLS is still enabled: `select relname from pg_class where relrowsecurity` should list every app table. Point `DATABASE_URL` at the restored database, and **delete `restore.dump` afterwards**. Practise a restore once a quarter.

## Project layout

```
db/migrations/        SQL schema + RLS policies (source of truth)
scripts/              migrate, seed, admin:invite (operator-run, owner role)
src/proxy.ts          CSP nonce, CSRF origin check, logged-out gate
src/lib/auth.ts       sessions + requireUser/requireMember/requireAdmin guards
src/lib/db.ts         per-request DB context for RLS (member/admin/system)
src/lib/services/     invites, magic links, messaging, account export/delete
src/app/              pages, server actions and API routes
tests/                Vitest suites against a real Postgres
public/brand/README   which logo/favicon files to supply
```

## Brand assets you need to supply

The church logo is **not** included. A dashed "LOGO" placeholder is shown in the header. See [public/brand/README.md](public/brand/README.md): you need `logo.svg` (header), `icon.png` (512×512 favicon) and `apple-icon.png` (180×180). The colors and type follow the Church Center site: charcoal, forest green, slate, sage and taupe, with a soft serif for headlines (Fraunces) and letter-spaced sans for labels (Montserrat). All of these are tokens at the top of `src/app/globals.css`.
