# Security

Report a vulnerability privately to the directory administrators at **[SECURITY CONTACT EMAIL]**. Please don't open a public issue.

## What we protect

| Asset | Why it matters |
|---|---|
| The member list itself | Names and businesses of church members are valuable to spammers, scammers and people looking to target a congregation. |
| Contact details and account emails | They enable direct harassment or phishing. |
| Private messages | Business conversations between members. |
| Admin powers | An attacker with admin powers could approve impostors, suspend real members, or read reported content. |
| Member trust | A scam carried out through the directory hurts members and the church's reputation. |

## Threat model

| Actor | Example threat | Main mitigations |
|---|---|---|
| Anonymous internet visitor or crawler | Browse or scrape the directory | Every page except sign-in, invite and legal pages requires a session (`src/proxy.ts`, deny by default). `robots.txt` disallows everything; `X-Robots-Tag` and meta `noindex` are on every page. There is no public sign-up. |
| Credential attacker | Brute force, credential stuffing, account enumeration | There are no passwords. Passkeys require user verification, and magic links are 256-bit, single use and expire in 15 minutes. Rate limits and lockout apply per IP and per email. Responses are identical whether or not an account exists. |
| Email link scanner | Consumes a magic link before the user clicks it | The link opens a page with a button; the token is only consumed by a POST. |
| Malicious approved member | Read others' private data, impersonate, spam or solicit, harass | Server-side guards plus **Postgres row-level security**: members can never read other users' account rows, hidden contact fields, or other people's conversations. Introductions are limited to 10 a day, or 2 a day during an account's first 7 days. Replies are limited too. Members can block and report. Reports go to admins. |
| Pending (unapproved) user | See the directory before approval | `requireMember()` redirects them to `/pending`. RLS also returns no other members' rows to a non-active viewer. |
| Compromised member account | Abuse that member's access | Short sessions (24 hours idle, 7 days absolute). Members can view and revoke sessions. Admins can suspend, which deletes all of that member's sessions at once. |
| Compromised or rogue admin | Mass data access, impersonation | Admin tools require a user-verified passkey session, with 30 minutes idle and 8 hours absolute. Every admin action is audit-logged. Admins **cannot** read private messages unless a message has been reported (enforced by RLS). Admins cannot see passkeys or session tokens. There must always be at least one admin. |
| Cross-site attacker | CSRF, XSS, clickjacking | Strict Origin check on every non-GET request, SameSite=Lax cookies, and Next.js's own server-action origin check. React escapes all output; `dangerouslySetInnerHTML` is banned by lint. Nonce-based CSP with `strict-dynamic`, and `frame-ancestors 'none'`. |
| Malicious upload | Image-parser exploits, location leaks, stored XSS through SVG | Only JPEG, PNG and WebP are accepted, detected from the file content. Files are limited to 5 MB and 40 megapixels, then **fully re-encoded** to WebP at 400×400, which strips EXIF and GPS. Photos are stored in the database, not the web root, and served only to signed-in members with `nosniff`. |
| Database or host compromise | Read tokens, mass data exfiltration | Only SHA-256 hashes of session, invite and magic-link tokens are stored, and IPs are stored only as keyed HMACs. Neon encrypts at rest and TLS is required. The app's database role cannot bypass RLS and refuses to start if misconfigured. Minimal data is collected. |
| Supply chain | Vulnerable or hijacked dependency | Exact version pins and a committed lockfile. `npm audit` runs in CI and fails the build on moderate or higher. Dependabot covers npm and Actions, and Actions are pinned to commit SHAs. The dependency set is small (no Resend SDK, no auth framework). |

**Out of scope:** off-platform fraud between members (handled with disclaimers and reporting), a compromised member device, and a malicious hosting provider.

## How each requirement is met

### Authentication
- **Passkeys** (`@simplewebauthn/server`): discoverable credentials, `userVerification: required`, signature counter checked, and challenges stored server-side for single use with a 5-minute expiry. The **email magic link** is the fallback (`src/lib/services/magic-links.ts`).
- **No passwords** at all, so Argon2id and breached-password checks don't apply.
- **Admin MFA:** admin powers need a session created by a passkey with user verification, which combines possession of the device with a biometric or PIN (`hasAdminSession()` in `src/lib/auth.ts`). A magic-link session for an admin account gets member access only.
- **Sessions:** a random 256-bit token in a `__Host-` cookie (HttpOnly, Secure, SameSite=Lax, Path=/). Only the SHA-256 hash is stored. Members get 24 hours idle and 7 days absolute; admins get 30 minutes idle and 8 hours absolute. The session is **rotated on every login**: any existing session in that browser is deleted. Members can list and revoke sessions on the Account page.
- **Rate limits and lockout** (`src/lib/rate-limit.ts`, stored in Postgres): magic-link requests (5 per email and 20 per IP per hour), link redemption, passkey attempts (lockout after 10 failures in 15 minutes per IP), invite viewing and redemption, introductions, replies, recommendations, reports, exports and uploads.
- **Generic errors:** sign-in and invite failures always show the same message.

### Authorization and data
- **Deny by default, twice.**
  1. *Application:* pages and actions only get database access through `requireUser()`, `requireMember()` or `requireAdmin()` (`src/lib/auth.ts`), which validate the session on every request. The proxy also redirects any route not on the public allowlist when there's no session cookie.
  2. *Database:* every table has RLS enabled. Each transaction sets `app.ctx` and `app.user_id`, and with no context every policy evaluates to false. A `system` context is used only for auth bootstrap (session lookup, login, invite redemption), notification email lookup and cron cleanup.
- The app's database role (`catc_app`) owns no tables, has no `BYPASSRLS` or superuser rights, and has only column-level `UPDATE` on `recommendations.hidden` and on `reports` status fields. `audit_log` is insert-only. `assertRestrictedRole()` refuses to start otherwise.
- **Minimal data:** email, names, business info, and opt-in contact fields only. No addresses or birthdates. 18+ is confirmed at signup.
- **Encryption:** HTTPS everywhere with HSTS (2 years, preload). Neon encrypts at rest, and the backups are age-encrypted. Secrets live only in environment variables.
- **Queries** go through the Drizzle ORM or tagged `sql` templates (parameterized). All input is validated with **Zod** on the server (`src/lib/validation.ts`), and control and bidi-override characters are stripped. LIKE wildcards are escaped in search. Websites must be http or https, so `javascript:` links are impossible.

### Web hardening
- **Headers** (`next.config.ts` and `src/proxy.ts`): CSP with a per-request nonce and `strict-dynamic`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`. Also `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a Permissions-Policy that denies everything except WebAuthn, `X-Content-Type-Options: nosniff`, COOP/CORP same-origin, and `Cache-Control: no-store` on pages.
- **CSRF:** an Origin check in the proxy (`src/lib/csrf.ts`), SameSite cookies, and JSON-only WebAuthn endpoints.
- **Uploads:** see the threat table above (`src/lib/images.ts`).
- **No trackers or analytics.** Fonts are self-hosted at build time.

### Abuse prevention
- Per-member introduction and reply limits, with a stricter limit for new accounts.
- **Block** works in both directions: neither member can start or continue a conversation, and this is enforced in code and in the RLS insert policy.
- **Report** on every profile, message and recommendation.

### Operations
- The **audit log** (`audit_log`) records logins, failed logins, magic-link requests, invites, approvals, suspensions, role changes, deletions, exports, passkey changes, session revocations, reports and moderation actions. It stores IDs and HMAC'd IPs only, never message text, tokens or emails. Entries are kept for 1 year.
- **Export and delete:** members can download their data as JSON and delete their account. Deletion is immediate in the live database, and backups expire within 30 days.
- **Dependencies:** pinned, lockfile committed, `npm audit` in CI, Dependabot.
- **Tests:** `tests/rls.test.ts` (member isolation, pending and suspended visibility, admin limits, audit immutability), `tests/auth.test.ts`, `tests/messaging.test.ts`, `tests/images.test.ts`, `tests/validation.test.ts`.
- **Backups:** Neon PITR plus the nightly age-encrypted dump. The restore procedure is in the README.

## Known limitations and residual risks
- Rate limits are keyed on the client IP as reported by Vercel. A determined attacker with many IPs can still try many magic-link requests, but each one only emails the account's real owner.
- Invite links can be forwarded. Admin approval is the backstop: approve only people you recognize.
- An admin can read a message once *anyone* reports it, so a member could report a message to expose it to admins. This is intentional, so admins can moderate.
- Emails (invites, magic links) are only as secure as the member's email account.
- Neon and Vercel staff and infrastructure are trusted.

## Incident-response checklist

1. **Contain.**
   - Suspend affected or suspicious accounts (Admin → Members → Suspend signs them out everywhere at once).
   - Suspected admin compromise: a *different* admin removes their admin role, which also revokes their sessions.
   - Widespread compromise: invalidate every session with `delete from sessions;` (as the owner) and rotate `HASH_SECRET`.
   - If needed, take the site offline: Vercel → Project → Settings → pause or redeploy a maintenance page.
2. **Rotate secrets** that may be exposed: the Neon `catc_app` password (`APP_DB_PASSWORD`, then `npm run db:migrate`, then update `DATABASE_URL` in Vercel), the Neon owner password, `RESEND_API_KEY`, `CRON_SECRET` and `HASH_SECRET`. Redeploy after each change.
3. **Preserve evidence.** Export the `audit_log`, Vercel logs and Neon logs for the time window *before* making further changes. Create a Neon branch as a snapshot.
4. **Assess.** Work out what data and which members were affected and over what period. Use audit-log entries such as `login.*`, `member.*` and `account.exported`.
5. **Eradicate and recover.** Fix the cause, patch dependencies, and restore from PITR or backup if data was altered (see README). Re-run `npm test`.
6. **Notify.** Tell church leadership promptly, then affected members in plain language: what happened, what data was involved, and what they should do. Texas law (Bus. & Com. Code §521.053) requires notifying affected individuals within 60 days of determining a breach of "sensitive personal information", and notifying the Texas Attorney General if 250 or more Texans are affected. Confirm with counsel.
7. **Review.** Write a short post-incident note and update this file and the tests.
