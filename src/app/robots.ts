import type { MetadataRoute } from 'next';

// Private site: ask every crawler to stay out. (Pages are also login-gated
// and send X-Robots-Tag: noindex.)
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
