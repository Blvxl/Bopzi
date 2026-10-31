'use client';

import { ArrowUpRight, Check, Clapperboard, CircleAlert, Copy, Film, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { timeAgo } from '@/lib/util';
import { deleteVideoProject, duplicateVideoProject, getMedia, listVideoProjects, saveVideoProject } from '@/video/storage';
import type { SavedProject } from '@/video/model';

type VideoProjectRow = { project: SavedProject; poster?: string };

function VideoProjectCard({ row, onChanged }: { row: VideoProjectRow; onChanged: () => void }) {
  const { project, poster } = row;
  const [renaming, setRenaming] = useState(false), [name, setName] = useState(project.timeline.name), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const menu = useRef<HTMLDetailsElement>(null), dialog = useRef<HTMLDialogElement>(null), href = `/video?p=${encodeURIComponent(project.id)}`;
  useEffect(() => { const away = (e: PointerEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) menu.current.open = false; }; document.addEventListener('pointerdown', away); return () => document.removeEventListener('pointerdown', away); }, []);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); try { await fn(); onChanged(); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Could not save that change. Try again.'); return false; } finally { setBusy(false); } };
  const cancelRename = () => { setName(project.timeline.name); setRenaming(false); requestAnimationFrame(() => menu.current?.querySelector('summary')?.focus()); };
  const total = project.timeline.clips.reduce((n, c) => n + Math.max(0, c.out - c.in) / Math.max(.1, c.speed), 0);
  return <li className="pj-card">
    <Link className="pj-shot" href={href} aria-label={`Open ${project.timeline.name}`}>{poster ? <img src={poster} alt=""/> : <Clapperboard size={26}/>}<span className="pj-open-hint">Open project <ArrowUpRight size={15}/></span></Link>
    <div className="pj-info"><div className="pj-title-row">{renaming ? <form className="pj-rename" onSubmit={async e => { e.preventDefault(); const clean = name.trim(); if (!clean) return; if (await run(() => saveVideoProject({ ...project, timeline: { ...project.timeline, name: clean }, updatedAt: Date.now() }))) setRenaming(false); }}><input autoFocus aria-label={`Rename ${project.timeline.name}`} value={name} maxLength={80} disabled={busy} onChange={e => setName(e.target.value)} onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancelRename(); } }}/><button type="submit" aria-label="Save project name" disabled={busy || !name.trim()}><Check size={16}/></button><button type="button" aria-label="Cancel rename" disabled={busy} onClick={cancelRename}><X size={16}/></button></form> : <h3 title={project.timeline.name}><Link href={href}>{project.timeline.name}</Link></h3>}
      {!renaming && <details className="pj-menu" ref={menu} onKeyDown={e => { if (e.key === 'Escape') { menu.current!.open = false; menu.current?.querySelector('summary')?.focus(); } }}><summary aria-label={`Project actions for ${project.timeline.name}`}><MoreHorizontal size={19}/></summary><nav aria-label={`Actions for ${project.timeline.name}`}><Link href={href}><ArrowUpRight size={15}/>Open project</Link><button disabled={busy} onClick={() => { menu.current!.open = false; setName(project.timeline.name); setRenaming(true); }}><Pencil size={15}/>Rename</button><button disabled={busy} onClick={() => { menu.current!.open = false; void run(() => duplicateVideoProject(project.id)); }}><Copy size={15}/>Duplicate</button><button className="danger" disabled={busy} onClick={() => { menu.current!.open = false; dialog.current?.showModal(); }}><Trash2 size={15}/>Delete project</button></nav></details>}</div>
      <div className="pj-meta"><span title={new Date(project.updatedAt).toLocaleString()}>Edited {timeAgo(project.updatedAt)}</span><span className="pj-format">Video</span></div>
      <div className="pj-export-status"><Film size={12}/>{project.timeline.clips.length} clips · {total.toFixed(1)} sec</div>{error && <p className="pj-error" role="alert">{error}</p>}</div>
    <dialog ref={dialog} className="pj-delete-dialog" onClose={() => menu.current?.querySelector('summary')?.focus()} onClick={e => { if (e.target === e.currentTarget && !busy) dialog.current?.close(); }} onCancel={e => { if (busy) e.preventDefault(); }}><div className="pj-delete-icon"><Trash2 size={22}/></div><h2>Delete this project?</h2><p>“{project.timeline.name}” and its uploaded media will be removed from this browser. This cannot be undone.</p><div><button type="button" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>Keep project</button><button type="button" className="danger" disabled={busy} onClick={() => void run(() => deleteVideoProject(project.id))}>{busy ? 'Deleting…' : 'Delete project'}</button></div>{error && <p role="alert">{error}</p>}</dialog>
  </li>;
}

export default function VideoProjectsList() {
  const [rows, setRows] = useState<VideoProjectRow[] | null>(null), [failed, setFailed] = useState(false), [query, setQuery] = useState('');
  const refresh = useCallback(() => {
    listVideoProjects().then(async projects => {
      const next = await Promise.all(projects.sort((a, b) => b.updatedAt - a.updatedAt).map(async project => {
        const media = await getMedia(project.id), firstId = project.timeline.clips[0]?.assetId;
        return { project, poster: media.find(m => m.id === firstId)?.poster || media.find(m => m.poster)?.poster };
      }));
      setRows(next); setFailed(false);
    }).catch(() => setFailed(true));
  }, []);
  useEffect(refresh, [refresh]);
  const filtered = useMemo(() => rows?.filter(row => row.project.timeline.name.toLowerCase().includes(query.trim().toLowerCase())), [rows, query]);
  return <>
    <header className="pj-head"><div><h1>Video projects</h1><p>{rows ? `${rows.length} ${rows.length === 1 ? 'project' : 'projects'}` : ''}</p></div><div className="pj-new"><Link className="btn primary" href="/video"><Plus size={16} aria-hidden="true"/>New video</Link></div></header>
    {failed ? <div className="pj-empty" role="alert"><CircleAlert size={28}/><h2>Storage is not available</h2><p>This browser could not read your saved video projects. Open Bopzi in a normal browser window and try again.</p></div> : rows === null ? <div className="pj-loading" role="status" aria-label="Looking for saved video projects"><i/><i/><i/></div> : rows.length === 0 ? <div className="pj-empty"><h2>No video projects yet.</h2><p>Start a video edit and it will be saved here on this device.</p><Link className="btn primary" href="/video"><Plus size={16}/>Create a video</Link></div> : <>
      <label className="pj-search"><Search size={16}/><input type="search" aria-label="Search video projects" placeholder="Find a project…" value={query} onChange={e => setQuery(e.target.value)}/></label>
      {filtered?.length === 0 && <p className="pj-no-results">No projects match “{query}”.</p>}
      <ul className="pj-grid">{filtered?.map(row => <VideoProjectCard key={row.project.id} row={row} onChanged={refresh}/>)}</ul>
      <p className="pj-note">Saved on this device with the project’s imported media.</p>
    </>}
  </>;
}
