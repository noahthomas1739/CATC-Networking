import { getSession, hasAdminSession } from '@/lib/auth';
import { signOut } from '@/app/actions/auth';
import { Logo } from './Logo';
import { NavLinks } from './NavLinks';

export async function SiteHeader() {
  const user = await getSession();
  const items = !user ? [] : user.status !== 'active'
    ? [{ href: '/profile', label: 'My profile' }, { href: '/account', label: 'Account' }]
    : [
      { href: '/directory', label: 'Directory' },
      { href: '/messages', label: 'Messages' },
      { href: '/profile', label: 'My profile' },
      { href: '/account', label: 'Account' },
      ...(user.role === 'admin' && hasAdminSession(user) ? [{ href: '/admin', label: 'Admin' }] : []),
    ];
  return (
    <header className="site-header">
      <div className="inner">
        <Logo href={user ? '/directory' : '/login'} />
        {user && (
          <nav aria-label="Main">
            <ul className="nav">
              <NavLinks items={items} />
              <li>
                <form action={signOut}>
                  <button type="submit">Sign out</button>
                </form>
              </li>
            </ul>
          </nav>
        )}
      </div>
    </header>
  );
}
