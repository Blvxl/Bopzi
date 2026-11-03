'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mark } from './Logo';

const TABS = [
  { href: '/', label: 'Overview' },
  { href: '/games', label: 'Games' },
  { href: '/rising', label: 'Rising' },
] as const;
const SOON = ['Trends', 'Genres', 'Charts'];

/** One bar across the whole top of the site. */
export default function SiteNav() {
  const path = usePathname() ?? '/';
  return (
    <header className="nav">
      <div className="nav-in">
        <Link href="/" className="nav-brand" aria-label="Bopzi home"><Mark size={30} bg="var(--bg)" className="text-ivory" /><span>bopzi<i>.</i></span></Link>
        <nav className="nav-tabs" aria-label="Sections">
          {TABS.map((t) => <Link key={t.href} href={t.href} aria-current={(t.href === '/' ? path === '/' : path.startsWith(t.href)) ? 'page' : undefined}>{t.label}</Link>)}
          {SOON.map((s) => <span key={s} className="soon" title="Coming soon">{s}</span>)}
        </nav>
        <span className="nav-pill">Free · Beta</span>
      </div>
    </header>
  );
}
