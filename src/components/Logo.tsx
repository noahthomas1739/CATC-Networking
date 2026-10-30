import Link from 'next/link';

/**
 * PLACEHOLDER LOGO. The church logo is not included; see public/brand/README.md.
 * Set LOGO_SRC to '/brand/logo.svg' once an approved file has been added.
 */
const LOGO_SRC: string | null = null;

export function Logo({ href }: { href: string }) {
  return (
    <Link href={href} className="brand">
      {LOGO_SRC ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={LOGO_SRC} alt="Church at the Cross" width={160} height={36} />
      ) : (
        <span className="brand-mark" aria-hidden="true">LOGO</span>
      )}
      <span className="brand-text">
        Church at the Cross
        <small>Business Directory</small>
      </span>
    </Link>
  );
}
