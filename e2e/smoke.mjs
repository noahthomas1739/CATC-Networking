// End-to-end smoke test against a running server, with a virtual passkey authenticator.
// Usage (fresh dev DB with `npm run db:seed -- --demo`, RESEND_API_KEY empty, server on :3000):
//   npm run admin:invite -- firstadmin@example.com | grep /invite/ > /tmp/admin-invite.txt
//   E2E_ADMIN_INVITE_FILE=/tmp/admin-invite.txt node e2e/smoke.mjs
// Needs the `playwright` package and a Chromium (not a project dependency).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
const sharp = createRequire(import.meta.url)('sharp');

const OUT = process.env.E2E_OUT ?? '/tmp/catc-e2e';
fs.mkdirSync(`${OUT}/shots`, { recursive: true });
const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
const MAIL = path.resolve('.dev-mail');
const problems = [];
const check = (cond, msg) => { if (!cond) { problems.push(msg); console.log('✗', msg); } else console.log('✓', msg); };

function latestMail(to, re) {
  const files = fs.readdirSync(MAIL).sort().reverse();
  for (const f of files) {
    const t = fs.readFileSync(path.join(MAIL, f), 'utf8');
    if (t.includes(`To: ${to}`)) { const m = t.match(re); if (m) return { text: t, match: m[0] }; }
  }
  return null;
}

const browser = await chromium.launch();
async function ctx(name) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await c.newPage();
  page.on('console', (m) => { if (/Content Security Policy|Refused/i.test(m.text())) problems.push(`[${name}] CSP: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  const cdp = await c.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  return { c, page };
}
const shot = (page, n) => page.screenshot({ path: `${OUT}/shots/${n}.png`, fullPage: true });

// 1. First admin joins through the CLI invite and adds a passkey
const A = await ctx('admin');
await A.page.goto(fs.readFileSync(process.env.E2E_ADMIN_INVITE_FILE, 'utf8').trim());
await shot(A.page, '01-invite');
await A.page.fill('#displayName', 'Avery Admin');
await A.page.fill('#businessName', 'Directory Admin');
await A.page.check('input[name=ageConfirm]');
await A.page.check('input[name=termsConfirm]');
await A.page.click('button[type=submit]');
await A.page.waitForURL(/\/account\?notice=welcome/);
check(true, 'admin redeemed invite → account page');
// invite link is single use
const again = await (await browser.newContext()).newPage();
await again.goto(fs.readFileSync(process.env.E2E_ADMIN_INVITE_FILE, 'utf8').trim());
check(await again.getByText('Invitation unavailable').isVisible(), 'invite link cannot be reused');
// admin pages refused before a passkey sign-in
await A.page.goto(`${BASE}/admin`);
check(A.page.url().includes('notice=admin_passkey'), 'admin tools refused for non-passkey session');
await A.page.click('text=Add a passkey');
await A.page.waitForURL(/notice=passkey_added/);
check(true, 'passkey registered');
await A.page.click('nav >> text=Sign out');
await A.page.waitForURL(/\/login/);
await shot(A.page, '02-login');
await A.page.click('text=Sign in with a passkey');
await A.page.waitForURL(/\/directory/);
check(true, 'passkey sign-in works');
await A.page.goto(`${BASE}/admin`);
check(A.page.url().endsWith('/admin'), 'admin dashboard reachable after passkey sign-in');
await shot(A.page, '03-admin');

// 2. Admin invites a member
await A.page.goto(`${BASE}/admin/invites`);
await A.page.fill('#email', 'newmember@example.com');
await A.page.click('text=Send invite');
await A.page.waitForURL(/invite_created/);
const inv = latestMail('newmember@example.com', /http:\/\/localhost:3000\/invite\/[A-Za-z0-9_-]+/);
check(!!inv, 'member invite emailed');

// 3. New member signs up → pending → sees nothing
const M = await ctx('member');
await M.page.goto(inv.match);
await M.page.fill('#displayName', 'Morgan Member');
await M.page.fill('#businessName', 'Morgan Bakery');
await M.page.check('input[name=ageConfirm]');
await M.page.check('input[name=termsConfirm]');
await M.page.click('button[type=submit]');
await M.page.waitForURL(/\/account/);
for (const p of ['/directory', '/messages', '/admin']) {
  await M.page.goto(BASE + p);
  check(M.page.url().endsWith('/pending'), `pending member: ${p} → /pending`);
}
const roofer = await A.page.goto(`${BASE}/directory?q=roof`).then(() => A.page.getAttribute('a.member-card', 'href'));
await M.page.goto(BASE + roofer);
check(M.page.url().endsWith('/pending'), 'pending member cannot open a profile');
const photoRes = await M.page.request.get(`${BASE}/api/photos/${roofer.split('/').pop()}`);
check(photoRes.status() === 404, 'pending member cannot fetch photos');
const html = await M.page.request.get(`${BASE}/directory`, { maxRedirects: 0 });
check(!(await html.text()).includes('Miller Roofing'), 'pending member HTML contains no member data');
await shot(M.page, '04-pending');

// 4. Admin approves
await A.page.goto(`${BASE}/admin/members?status=pending`);
await shot(A.page, '05-admin-members');
await A.page.locator('li.card', { hasText: 'newmember@example.com' }).locator('text=Approve').click();
await A.page.waitForURL(/notice=done/);
check(!!latestMail('newmember@example.com', /approved/), 'approval email sent');

// 5. Member searches, opens a profile, sends an introduction
await M.page.goto(`${BASE}/directory`);
await shot(M.page, '06-directory');
check(await M.page.getByText('Miller Roofing Co.').isVisible(), 'approved member sees the directory');
check(!(await M.page.content()).includes('Suspended Sales') && !(await M.page.content()).includes('Pending Plumbing'), 'directory hides pending/suspended members');
await M.page.fill('#q', 'roof');
await M.page.click('button:text("Search")');
await M.page.click('text=Miller Roofing Co.');
await shot(M.page, '07-profile');
check(await M.page.getByText('817-555-0101').isVisible(), 'opted-in phone is shown');
await M.page.goto(`${BASE}/directory?q=Nguyen`);
await M.page.click('text=Nguyen Tax');
check(!(await M.page.content()).includes('taylor@example.com'), 'hidden contact email is not in the page');
check(!(await M.page.content()).includes('cpa@example.com'), 'account email is not in the page');
await M.page.fill('#body', 'Hi Taylor! UNIQUE-BODY-123 Do you do small-business taxes?');
await M.page.click('text=Send introduction');
await M.page.waitForURL(/\/messages\/.+notice=message_sent/);
await shot(M.page, '08-thread');
const note = latestMail('cpa@example.com', /introduction/);
check(!!note && !note.text.includes('UNIQUE-BODY-123') && !note.text.includes('newmember@example.com'), 'intro email has no body or sender email');
// new-account limit: 2/day
await M.page.goto(`${BASE}/directory?q=Brooks`);
await M.page.click('text=Brooks Photography');
await M.page.fill('#body', 'second intro');
await M.page.click('text=Send introduction');
await M.page.waitForURL(/notice=message_sent/);
await M.page.goto(`${BASE}/directory?q=Admin`);
await M.page.click('text=Directory Admin');
await M.page.fill('#body', 'third intro');
await M.page.click('text=Send introduction');
await M.page.waitForURL(/notice=message_limit/);
check(true, 'third introduction on day one is rate limited');

// 6. Recipient signs in by magic link, replies, reports the message
const R = await ctx('recipient');
await R.page.goto(`${BASE}/login`);
await R.page.fill('#email', 'cpa@example.com');
await R.page.click('text=Email me a link');
await R.page.waitForURL(/notice=sent/);
await R.page.fill('#email', 'nobody-here@example.com');
await R.page.click('text=Email me a link');
await R.page.waitForURL(/notice=sent/);
check(true, 'unknown email gets identical response');
const ml = latestMail('cpa@example.com', /http:\/\/localhost:3000\/auth\/magic\?token=[A-Za-z0-9_-]+/);
await R.page.goto(ml.match);
await R.page.click('text=Continue to the directory');
await R.page.waitForURL(/\/directory/);
const reuse = await (await browser.newContext()).newPage();
await reuse.goto(ml.match);
await reuse.click('text=Continue to the directory');
await reuse.waitForURL(/link_invalid/);
check(true, 'magic link is single use');
await R.page.goto(`${BASE}/messages`);
await R.page.click('text=Morgan Member');
await R.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
check(await R.page.getByText('UNIQUE-BODY-123').isVisible(), 'recipient reads the message in-app');
await R.page.fill('#body', 'Happy to help!');
await R.page.click('text=Send reply');
await R.page.waitForURL(/message_sent/);
await R.page.click('li.msg >> text=Report');
await R.page.selectOption('#reason', 'spam');
await R.page.click('text=Send report');
await R.page.waitForURL(/notice=reported/);
check(true, 'message reported');
// recipient leaves a recommendation for the bakery
await R.page.goto(`${BASE}/directory?q=Morgan`);
await R.page.click('text=Morgan Bakery');
await R.page.fill('#rec', 'Best sourdough in Grapevine.');
await R.page.click('text=Post recommendation');
await R.page.waitForURL(/rec_saved/);
// magic-link admin session should not get admin powers (cpa is member; skip)

// 7. Admin reviews the report (reported message is visible to admin)
await A.page.goto(`${BASE}/admin/reports`);
check(await A.page.getByText('UNIQUE-BODY-123').isVisible(), 'admin sees reported message content');
await shot(A.page, '09-admin-reports');
await A.page.click('text=Mark resolved');
await A.page.goto(`${BASE}/admin/audit`);
const audit = await A.page.content();
check(!audit.includes('UNIQUE-BODY-123') && !/token=/.test(audit), 'audit log has no message bodies or tokens');
await shot(A.page, '10-admin-audit');

// 8. Member hides the recommendation, uploads photo with GPS EXIF
await M.page.goto(`${BASE}/profile`);
await M.page.click('text=Hide from my profile');
await M.page.waitForURL(/rec_updated/);
const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#9aadb4' } }).jpeg()
  .withExif({ IFD0: { Make: 'GPSCAM' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '32/1 56/1 0/1' } }).toBuffer();
fs.writeFileSync(`${OUT}/gps.jpg`, jpg);
await M.page.setInputFiles('#photo', `${OUT}/gps.jpg`);
await M.page.click('button:text("Upload")');
await M.page.waitForURL(/notice=saved/);
const me = await M.page.request.get(`${BASE}/api/photos/${(await M.page.getAttribute('a[href^="/members/"]', 'href')).split('/').pop()}`);
const buf = await me.body();
const meta = await sharp(buf).metadata();
check(me.status() === 200 && meta.format === 'webp' && !meta.exif && !buf.toString('latin1').includes('GPSCAM'), 'uploaded photo re-encoded with EXIF/GPS stripped');
await shot(M.page, '11-my-profile');
await R.page.goto(`${BASE}/directory?q=Morgan`);
await R.page.click('text=Morgan Bakery');
check(!(await R.page.content()).includes('Best sourdough'), 'hidden recommendation not shown to others');

// 9. Block: recipient blocks member; member can no longer message
await R.page.click('text=Block this member');
await R.page.waitForURL(/notice=blocked/);
await M.page.goto(`${BASE}/messages`);
await M.page.click('text=Taylor Nguyen');
await M.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
check(await M.page.getByText('Replies are unavailable').isVisible(), 'blocked member cannot reply');

// 10. Sessions: member revokes; suspension signs out instantly
await M.page.goto(`${BASE}/account`);
await shot(M.page, '12-account');
await A.page.goto(`${BASE}/admin/members`);
await A.page.locator('li.card', { hasText: 'newmember@example.com' }).locator('text=Suspend').click();
await A.page.waitForURL(/notice=done/);
await M.page.goto(`${BASE}/directory`);
check(M.page.url().endsWith('/login'), 'suspended member signed out immediately');

// 11. Data export (recipient)
const exp = await R.page.request.get(`${BASE}/api/account/export`);
const data = JSON.parse(await exp.text());
check(exp.status() === 200 && data.account.email === 'cpa@example.com' && !JSON.stringify(data).includes('public_key') && !JSON.stringify(data).includes('tokenHash'), 'data export works and excludes secrets');

// 12. Admin MFA cannot be bypassed via email: magic-link session can't enroll a new passkey
const X = await ctx('attacker');
await X.page.goto(`${BASE}/login`);
await X.page.fill('#email', 'firstadmin@example.com');
await X.page.click('text=Email me a link');
await X.page.waitForURL(/notice=sent/);
await X.page.goto(latestMail('firstadmin@example.com', /http:\/\/localhost:3000\/auth\/magic\?token=[A-Za-z0-9_-]+/).match);
await X.page.click('text=Continue to the directory');
await X.page.waitForURL(/\/directory/);
await X.page.goto(`${BASE}/admin`);
check(X.page.url().includes('admin_passkey'), 'admin via email link has no admin access');
await X.page.goto(`${BASE}/account`);
await X.page.click('text=Add a passkey');
await X.page.getByText('admins must sign in with an existing passkey').waitFor();
check(true, 'email-link session cannot enroll a passkey on an admin account');

// 13. Desktop screenshot
const D = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const dp = await D.newPage();
await dp.goto(`${BASE}/login`);
await dp.screenshot({ path: `${OUT}/shots/13-login-desktop.png` });
await dp.goto(`${BASE}/privacy`);
await dp.screenshot({ path: `${OUT}/shots/14-privacy-desktop.png`, fullPage: true });

await browser.close();
console.log(`\n${problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'ALL CHECKS PASSED'}`);
