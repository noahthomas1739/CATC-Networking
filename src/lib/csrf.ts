/**
 * CSRF defense for every state-changing request (runs in proxy.ts):
 * the browser-supplied Origin must equal our own origin. If Origin is absent
 * (some older browsers on same-origin POST), Sec-Fetch-Site must be
 * "same-origin". Requests with neither are refused. Session cookies are also
 * SameSite=Lax, and Next.js server actions perform their own Origin check.
 */
export function isSameOriginRequest(method: string, headers: Headers, appOrigin: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const origin = headers.get('origin');
  if (origin) return origin === appOrigin;
  return headers.get('sec-fetch-site') === 'same-origin';
}
