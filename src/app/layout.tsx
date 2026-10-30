import type { Metadata, Viewport } from 'next';
import { Fraunces, Montserrat } from 'next/font/google';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

// Fonts are downloaded at build time and self-hosted: no requests to Google from members' browsers.
const fraunces = Fraunces({ subsets: ['latin'], weight: ['600'], variable: '--font-fraunces', display: 'swap' });
const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-montserrat', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'CATC Business Directory', template: '%s · CATC Business Directory' },
  description: 'Private member directory.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#2b2b2b' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${montserrat.variable}`}>
      <body>
        <a className="skip-link" href="#main">Skip to content</a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
