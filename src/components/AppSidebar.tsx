'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderOpen } from 'lucide-react';
import AccountMenu from './AccountMenu';
import { Mark } from './Logo';

type Item = { id: string; href: string; label: string; icon: typeof FolderOpen };

const BOTTOM: Item[] = [{ id: 'projects', href: '/projects', label: 'Projects', icon: FolderOpen }];

/** Internal check pages run without the app chrome. */
const BARE = ['/__', '/generation-preview', '/motion-check', '/video/eval'];

function current(path: string) {
  if (path.startsWith('/projects')) return 'projects';
  return '';
}

function Entry({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  const body = <><Icon size={16} strokeWidth={1.8} aria-hidden="true" /><span>{item.label}</span></>;
  // The open editor stays open: its own entry does nothing rather than starting a new project.
  if (active) return <a href={item.href} aria-current="page" onClick={(e) => e.preventDefault()}>{body}</a>;
  return <Link href={item.href}>{body}</Link>;
}

export default function AppSidebar() {
  const path = usePathname() ?? '/';
  if (BARE.some((p) => path.startsWith(p))) return null;
  const mark = <Link href="/" className="app-sidebar-mark" aria-label="Bopzi home"><Mark size={27} bg="var(--app-side)" className="text-ivory" /><strong>bopzi<span>.</span></strong></Link>;
  const on = current(path);
  if (path === '/' || path === '/pricing') {
    return (
      <nav className="app-sidebar" aria-label="Bopzi">
        {mark}
        <span className="app-sidebar-gap" />
        <Link href="/pricing">Pricing</Link>
        <Link href="/projects">Projects</Link>
        <Link href="/studio" className="app-sidebar-cta">Open studio</Link>
      </nav>
    );
  }
  return (
    <nav className="app-sidebar" aria-label="Bopzi">
      {mark}
      {BOTTOM.map((item) => <Entry key={item.id} item={item} active={on === item.id} />)}
      <span className="app-sidebar-gap" />
      <AccountMenu />
    </nav>
  );
}
