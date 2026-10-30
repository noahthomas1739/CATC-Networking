import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { reportAction } from '@/app/actions/member';
import { requireMember } from '@/lib/auth';
import { uuidSchema } from '@/lib/validation';

export const metadata: Metadata = { title: 'Report' };

const LABELS = { profile: 'profile', message: 'message', recommendation: 'recommendation' } as const;

export default async function ReportPage({ searchParams }: PageProps<'/report'>) {
  await requireMember();
  const { type, id } = await searchParams;
  if (typeof type !== 'string' || !(type in LABELS) || !uuidSchema.safeParse(id).success) notFound();
  return (
    <div className="stack">
      <h1>Report a {LABELS[type as keyof typeof LABELS]}</h1>
      <p>Reports go privately to the directory administrators. The member you report is not told who reported them.</p>
      <form action={reportAction} className="form">
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="targetId" value={id as string} />
        <div>
          <label htmlFor="reason">Reason</label>
          <select id="reason" name="reason" required defaultValue="">
            <option value="" disabled>Choose one</option>
            <option value="spam">Spam or unwanted solicitation</option>
            <option value="scam">Possible scam or fraud</option>
            <option value="harassment">Harassment</option>
            <option value="inappropriate">Inappropriate content</option>
            <option value="other">Something else</option>
          </select>
        </div>
        <div>
          <label htmlFor="details">Details <span className="hint">Optional, 1000 characters max.</span></label>
          <textarea id="details" name="details" maxLength={1000} />
        </div>
        <div><button className="btn" type="submit">Send report</button></div>
      </form>
    </div>
  );
}
