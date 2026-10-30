import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of Use' };

export default function TermsPage() {
  return (
    <article className="stack">
      <div className="draft-banner" role="note"><strong>DRAFT</strong>: pending review by a lawyer and church leadership. Not yet in effect.</div>
      <h1>Terms of Use</h1>
      <p className="meta">Last updated: [DATE]</p>

      <h2>1. What this is</h2>
      <p>The CATC Business Directory (&ldquo;the Directory&rdquo;) is a private, invitation-only website that helps members of Church at the Cross in Grapevine, Texas find and do business with one another. It is run by volunteer members. <strong>It is not an official website of Church at the Cross</strong>, and the church does not operate or control it.</p>

      <h2>2. Who can join</h2>
      <p>You must be invited, be at least 18 years old, and be approved by a Directory administrator. Administrators may decline, suspend or remove any account at their discretion, for example to protect other members.</p>

      <h2>3. No endorsement. You transact at your own risk</h2>
      <p><strong>Church at the Cross and the Directory&rsquo;s administrators do not vouch for, endorse, recommend, license, insure or guarantee any member, business, product or service listed here.</strong> Being listed does not mean anyone has checked a member&rsquo;s qualifications, licensing, insurance, background, pricing or the quality of their work. Recommendations are the personal opinions of the members who wrote them.</p>
      <p>Any agreement you make with another member is solely between you and that member. Do your own homework: check licenses and insurance, get written quotes, and use your judgment. To the fullest extent allowed by law, the church, the Directory&rsquo;s volunteers and administrators are not responsible for any loss, damage or dispute arising from dealings between members.</p>

      <h2>4. Your responsibilities</h2>
      <ul>
        <li>Keep your profile honest and up to date. Only list businesses you own or represent.</li>
        <li>Be respectful. No harassment, discrimination, threats, or offensive content.</li>
        <li>No spam or mass solicitation. Use introductions to make genuine, relevant contact. Message limits apply.</li>
        <li>Do not copy, scrape, export or share other members&rsquo; information outside the Directory, or use it for marketing lists.</li>
        <li>Do not use the Directory for multi-level-marketing recruitment, fundraising requests, or political campaigning.</li>
        <li>Keep your sign-in methods secure and tell an administrator if you think your account has been misused.</li>
      </ul>

      <h2>5. Content you post</h2>
      <p>You keep ownership of what you post. You give the Directory permission to display it to other approved members for the purpose of running the Directory. Administrators may hide or remove content that breaks these terms.</p>

      <h2>6. Reporting and blocking</h2>
      <p>Use the Report button on any profile, message or recommendation that concerns you, and the Block feature to stop a member from contacting you. Administrators review reports but cannot promise a particular outcome or timeframe.</p>

      <h2>7. Leaving</h2>
      <p>You can delete your account at any time from the Account page. See the Privacy Policy for what happens to your data.</p>

      <h2>8. Changes and availability</h2>
      <p>The Directory is provided &ldquo;as is&rdquo; by volunteers, without warranties, and may change or shut down. We will post updated terms here and tell members about significant changes.</p>

      <h2>9. Contact</h2>
      <p>Questions: [ADMIN CONTACT EMAIL].</p>
    </article>
  );
}
