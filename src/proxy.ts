import { NextResponse, type NextRequest } from 'next/server';
import { isSameOriginRequest } from './lib/csrf';

// Paths reachable without a session cookie. Everything else is deny-by-default:
// no cookie → redirect to /login. (The cookie is fully validated server-side
// by requireUser()/requireMember()/requireAdmin(); this is only a fast gate.)
const PUBLIC = [/^\/login$/, /^\/auth\/magic$/, /^\/invite\/[^/]+$/, /^\/terms$/, /^\/privacy$/, /^\/robots\.txt$/,
  /^\/api\/auth\/passkey\/login-(options|verify)$/, /^\/api\/cron\/cleanup$/];

export function proxy(request: NextRequest) {
  const appOrigin = new URL(process.env.APP_URL ?? request.nextUrl.origin).origin;
  const { pathname } = request.nextUrl;

  if (!isSameOriginRequest(request.method, request.headers, appOrigin) && pathname !== '/api/cron/cleanup') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const hasSession = request.cookies.has('__Host-catc_session') || request.cookies.has('catc_session');
  if (!hasSession && !PUBLIC.some((p) => p.test(pathname))) {
    if (pathname.startsWith('/api/')) return new NextResponse('Not found', { status: 404 });
    return NextResponse.redirect(new URL('/login', appOrigin));
  }

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
  const dev = process.env.NODE_ENV === 'development';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self'${dev ? " 'unsafe-inline'" : ` 'nonce-${nonce}'`}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  const reqHeaders = new Headers(request.headers);
  reqHeaders.set('x-nonce', nonce);
  reqHeaders.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  // Member data must never be stored by shared caches or the back/forward cache on shared devices.
  res.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/).*)'],
};
