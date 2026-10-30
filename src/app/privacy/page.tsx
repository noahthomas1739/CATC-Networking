import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <article className="stack">
      <div className="draft-banner" role="note"><strong>DRAFT</strong>: pending review by a lawyer and church leadership. Not yet in effect.</div>
      <h1>Privacy Policy</h1>
      <p className="meta">Last updated: [DATE]</p>

      <p>The CATC Business Directory is a private, member-run directory for Church at the Cross members. It is not an official church website. This policy explains, in plain English, what we collect and why.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your email address, your role (member/admin) and status, and the dates you joined, were approved, confirmed you are 18+, and accepted the terms.</li>
        <li><strong>Profile (you choose):</strong> your name, business name, and optionally a photo, category, description, services, service area, contact preferences, and business email, phone and website.</li>
        <li><strong>Activity:</strong> messages you send through the Directory, recommendations, reports, and members you block.</li>
        <li><strong>Security:</strong> passkey public keys (never your fingerprint or face; those stay on your device), sign-in sessions with a rough device description such as &ldquo;Safari on iOS&rdquo;, and a security log of events like sign-ins and admin actions. IP addresses are stored only as one-way scrambled codes used to stop abuse.</li>
      </ul>
      <p>We do <strong>not</strong> collect home addresses, birthdates, payment information, or information about anyone under 18. Please don&rsquo;t put these in your profile.</p>

      <h2>Who can see what</h2>
      <ul>
        <li>Only approved, signed-in members can see the Directory. Nothing is public or indexed by search engines.</li>
        <li>Other members see your profile. Your email, phone and website are shown <strong>only</strong> if you turn on &ldquo;Show to members&rdquo; for each one.</li>
        <li>Your sign-in email is never shown to other members. When someone sends you an introduction, we email you a notice without revealing your address to them.</li>
        <li>Messages are visible only to the two people in the conversation. Administrators can read a message only if someone reports it.</li>
        <li>Administrators can see account details (including email addresses) to approve and manage members.</li>
      </ul>

      <h2>What we don&rsquo;t do</h2>
      <p>We don&rsquo;t sell or rent your information, show ads, or use third-party analytics or tracking. We only use one sign-in cookie, which is necessary for the site to work.</p>

      <h2>Service providers</h2>
      <p>The Directory is hosted by Vercel (website) and Neon (database), and email is delivered by Resend. They process data on our behalf under their own security and privacy terms. Data is encrypted in transit and at rest.</p>

      <h2>Your choices</h2>
      <ul>
        <li><strong>Download:</strong> use &ldquo;Download my data&rdquo; on the Account page.</li>
        <li><strong>Correct:</strong> edit your profile at any time.</li>
        <li><strong>Delete:</strong> use &ldquo;Delete my account&rdquo;. Your account and data are removed from the live system immediately, including conversations you were part of. Encrypted backups expire and are erased within 30 days. The security log keeps only anonymous IDs.</li>
      </ul>

      <h2>Retention</h2>
      <p>We keep your data while you have an account. Expired sign-in links, invitations and sessions are deleted automatically. Security log entries are kept for up to 1 year.</p>

      <h2>Security</h2>
      <p>We use passkeys and single-use email links instead of passwords, encrypt all connections, limit how often actions can be repeated, and record administrator actions. No system is perfectly secure. If we learn of a breach affecting your data, we will notify affected members promptly.</p>

      <h2>Contact</h2>
      <p>Questions or requests: [ADMIN CONTACT EMAIL].</p>
    </article>
  );
}
