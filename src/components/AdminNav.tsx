import Link from 'next/link';

const ITEMS = [
  ['/admin', 'Overview'], ['/admin/members', 'Members'], ['/admin/invites', 'Invites'],
  ['/admin/reports', 'Reports'], ['/admin/audit', 'Audit log'], ['/admin/categories', 'Categories'],
] as const;

export function AdminNav({ current }: { current: string }) {
  return (
    <nav className="admin-nav" aria-label="Admin">
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={current === href ? 'page' : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
