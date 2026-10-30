import { getSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { withDb } from '@/lib/db';
import { hit } from '@/lib/rate-limit';
import { exportAccount } from '@/lib/services/account';

export async function GET() {
  const user = await getSession();
  if (!user) return new Response('Not found', { status: 404 });
  if (!(await hit('exportsPerDay', user.userId))) return new Response('Too many requests', { status: 429 });
  const data = await withDb({ ctx: 'member', userId: user.userId }, async (tx) => {
    const d = await exportAccount(tx, user.userId);
    await audit(tx, 'account.exported', { actorId: user.userId });
    return d;
  });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="catc-directory-my-data.json"',
      'Cache-Control': 'no-store',
    },
  });
}
