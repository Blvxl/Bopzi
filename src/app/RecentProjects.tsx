'use client';

import { ArrowRight, ImageIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { hasContent, listProjects } from '@/lib/db';
import { timeAgo } from '@/lib/util';

type Recent = { id: string; name: string; kind: 'Thumbnail' | 'Icon'; updatedAt: number; image?: string };

export default function RecentProjects() {
  const [rows, setRows] = useState<Recent[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true, made: Recent[] = [];
    void listProjects().then(projects => {
      made = projects.filter(hasContent).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8).map(p => ({ id: p.id, name: p.name, kind: p.doc.size ? 'Icon' : 'Thumbnail', updatedAt: p.updatedAt, image: p.thumb ? URL.createObjectURL(p.thumb) : undefined }));
      if (live) setRows(made); else made.forEach(r => r.image && URL.revokeObjectURL(r.image));
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; made.forEach(r => r.image && URL.revokeObjectURL(r.image)); };
  }, []);
  // A first visit has nothing to show here, so the section only appears once there is.
  if (!failed && !rows?.length) return null;
  return <section className="home-recent" aria-labelledby="recent-title"><header><h2 id="recent-title">Your projects</h2><Link href="/projects">View all <ArrowRight size={15}/></Link></header>
    {failed ? <p role="alert">Projects couldn’t be loaded. Check your browser storage settings.</p> : <ul>{rows?.map(r => <li key={r.id}><Link href={'/studio?p=' + encodeURIComponent(r.id)}><span className={'home-shot' + (r.kind === 'Icon' ? ' is-icon' : '')}>{r.image ? <img src={r.image} alt=""/> : <ImageIcon size={22}/>}</span><b title={r.name}>{r.name}</b><small>{r.kind} · {timeAgo(r.updatedAt)}</small></Link></li>)}</ul>}
  </section>;
}
