'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Overview' },
  { href: '/games', label: 'Games' },
  { href: '/rising', label: 'Rising' },
  { href: '/lists', label: 'Lists' },
] as const;
const SOON = ['Trends', 'Genres', 'Charts'];

/** One bar across the whole top of the site. */
export default function SiteNav() {
  const path = usePathname() ?? '/';
  return (
    <header className="nav">
      <div className="nav-in">
        <nav className="nav-tabs" aria-label="Sections">
          {TABS.map((t) => <Link key={t.href} href={t.href} aria-current={(t.href === '/' ? path === '/' : path.startsWith(t.href)) ? 'page' : undefined}>{t.label}</Link>)}
          {SOON.map((s) => <span key={s} className="soon" title="Coming soon">{s}</span>)}
        </nav>
      </div>
    </header>
  );
}
