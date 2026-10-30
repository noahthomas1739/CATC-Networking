import type { Metadata } from 'next';
import { consumeMagicLinkAction } from '@/app/actions/auth';
import { tokenSchema } from '@/lib/validation';

export const metadata: Metadata = { title: 'Sign in' };

// The link only shows a button. The token is consumed by a POST, so email
// security scanners that prefetch links can't burn it.
export default async function MagicLinkPage({ searchParams }: PageProps<'/auth/magic'>) {
  const { token } = await searchParams;
  const valid = tokenSchema.safeParse(token).success;
  return (
    <div className="stack">
      <h1>Sign in</h1>
      {valid ? (
        <form action={consumeMagicLinkAction}>
          <input type="hidden" name="token" value={token as string} />
          <button className="btn" type="submit">Continue to the directory</button>
        </form>
      ) : (
        <div className="notice notice-error" role="alert">This link is invalid. Please request a new one from the sign-in page.</div>
      )}
    </div>
  );
}
