'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FolderOpen, House, ImageIcon, SquareDashed } from 'lucide-react';
import AccountMenu from './AccountMenu';
import { Mark } from './Logo';

type Item = { id: string; href: string; label: string; icon: typeof House; plain?: boolean };

/** The studio loads its project when the page loads, so links into it are plain page loads. */
const TOP: Item[] = [
  { id: 'home', href: '/', label: 'Home', icon: House },
  { id: 'thumbnail', href: '/studio', label: 'Thumbnail', icon: ImageIcon, plain: true },
  { id: 'icon', href: '/studio?format=icon', label: 'Icon', icon: SquareDashed, plain: true },
];
const BOTTOM: Item[] = [{ id: 'projects', href: '/projects', label: 'Projects', icon: FolderOpen }];

/** Internal check pages run without the app chrome. */
const BARE = ['/__', '/generation-preview', '/motion-check', '/video/eval'];

function current(path: string) {
  if (path === '/') return 'home';
  if (path.startsWith('/projects')) return 'projects';
  // An icon project opens as /studio?p=…, so the editor itself is always shown as Thumbnail.
  if (path.startsWith('/studio')) return 'thumbnail';
  return '';
}

function Entry({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  const body = <><Icon size={16} strokeWidth={1.8} aria-hidden="true" /><span>{item.label}</span></>;
  // The open editor stays open: its own entry does nothing rather than starting a new project.
  if (active) return <a href={item.href} aria-current="page" onClick={(e) => e.preventDefault()}>{body}</a>;
  return item.plain ? <a href={item.href}>{body}</a> : <Link href={item.href}>{body}</Link>;
}

export default function AppSidebar() {
  const path = usePathname() ?? '/';
  const [icon, setIcon] = useState(false);
  useEffect(() => { setIcon(path === '/studio' && new URLSearchParams(window.location.search).get('format') === 'icon'); }, [path]);
  if (BARE.some((p) => path.startsWith(p))) return null;
  const mark = <Link href="/" className="app-sidebar-mark" aria-label="Bopzi home"><Mark size={27} bg="var(--app-side)" className="text-ivory" /><strong>bopzi<span>.</span></strong></Link>;
  // The home page keeps project access and a direct route into the studio.
  if (path === '/') return (
    <nav className="app-sidebar is-home" aria-label="Bopzi">
      {mark}
      <span className="app-sidebar-gap" />
      <Link href="/projects"><span>Projects</span></Link>
      <a className="app-sidebar-cta" href="/studio"><span>Open studio</span></a>
      <AccountMenu />
    </nav>
  );
  const on = icon ? 'icon' : current(path);
  return (
    <nav className="app-sidebar" aria-label="Bopzi">
      {mark}
      {TOP.map((item) => <Entry key={item.id} item={item} active={on === item.id} />)}
      <span className="app-sidebar-gap" />
      {BOTTOM.map((item) => <Entry key={item.id} item={item} active={on === item.id} />)}
      <AccountMenu />
    </nav>
  );
}
