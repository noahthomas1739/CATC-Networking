import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="inner">
        <nav aria-label="Legal">
          <Link href="/terms">Terms of Use</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </nav>
        <p>A member-run community directory for Church at the Cross. Not an official church website.</p>
      </div>
    </footer>
  );
}
