'use client';

import { CircleAlert, ImageIcon, Plus, MoreHorizontal, Pencil, Copy, Trash2, ArrowUpRight, Check, X, Download, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteProject, duplicateProject, hasContent, listProjects, putProject } from '@/lib/db';
import type { Project } from '@/lib/types';
import { timeAgo } from '@/lib/util';

function Card({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const [renaming, setRenaming] = useState(false), [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const menu = useRef<HTMLDetailsElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const thumb = useMemo(() => project.thumb ? URL.createObjectURL(project.thumb) : null, [project.thumb]);
  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb); }, [thumb]);
  useEffect(() => { const away = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && menu.current) menu.current.open = false; }; document.addEventListener('pointerdown', away); return () => document.removeEventListener('pointerdown', away); }, []);
  const closeMenu = () => { if (menu.current) menu.current.open = false; };
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); try { await fn(); onChanged(); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Could not save that change. Try again.'); return false; } finally { setBusy(false); } };
  const href = '/studio?p=' + project.id;
  const cancelRename = () => { setName(project.name); setRenaming(false); requestAnimationFrame(() => menu.current?.querySelector('summary')?.focus()); };
  return <li className="pj-card">
    <Link className={'pj-shot' + (project.doc.size ? ' is-icon' : '')} href={href} aria-label={'Open ' + project.name}>{thumb ? <img src={thumb} alt=""/> : <ImageIcon size={24}/>}<span className="pj-open-hint">Open project <ArrowUpRight size={15}/></span></Link>
    <div className="pj-info"><div className="pj-title-row">{renaming ? <form className="pj-rename" onSubmit={async e => { e.preventDefault(); if (!name.trim()) return; if (await run(() => putProject({ ...project, name: name.trim() }))) setRenaming(false); }}><input autoFocus aria-label={'Rename ' + project.name} value={name} maxLength={80} disabled={busy} onChange={e => setName(e.target.value)} onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancelRename(); } }}/><button type="submit" aria-label="Save project name" disabled={busy || !name.trim()}><Check size={16}/></button><button type="button" aria-label="Cancel rename" disabled={busy} onClick={cancelRename}><X size={16}/></button></form> : <h3 title={project.name}><Link href={href}>{project.name}</Link></h3>}
    {!renaming && <details className="pj-menu" ref={menu} onKeyDown={e=>{if(e.key === 'Escape'){closeMenu();menu.current?.querySelector('summary')?.focus();}}}><summary aria-label={'Project actions for ' + project.name}><MoreHorizontal size={19}/></summary><nav aria-label={'Actions for ' + project.name}><Link href={href}><ArrowUpRight size={15}/>Open project</Link><button disabled={busy} onClick={() => { closeMenu(); setName(project.name); setRenaming(true); }}><Pencil size={15}/>Rename</button><button disabled={busy} onClick={() => { closeMenu(); void run(() => duplicateProject(project.id)); }}><Copy size={15}/>Duplicate</button><button className="danger" disabled={busy} onClick={() => { closeMenu(); dialog.current?.showModal(); }}><Trash2 size={15}/>Delete project</button></nav></details>}
    </div><div className="pj-meta"><span title={new Date(project.updatedAt).toLocaleString()}>Edited {timeAgo(project.updatedAt)}</span><span className="pj-format">{project.doc.size ? 'Icon' : 'Thumbnail'}</span></div>
    {project.exportedAt && <div className="pj-export-status is-exported"><Download size={12}/>Downloaded</div>}{error && <p className="pj-error" role="alert">{error}</p>}</div>
    <dialog ref={dialog} className="pj-delete-dialog" onClose={()=>menu.current?.querySelector('summary')?.focus()} onClick={e => { if(e.target === e.currentTarget && !busy) dialog.current?.close(); }} onCancel={e=>{if(busy)e.preventDefault();}}><div className="pj-delete-icon"><Trash2 size={22}/></div><h2>Delete this project?</h2><p>“{project.name}” and its saved images will be removed from this browser. This cannot be undone.</p><div><button type="button" autoFocus disabled={busy} onClick={()=>dialog.current?.close()}>Keep project</button><button type="button" className="danger" disabled={busy} onClick={()=>void run(()=>deleteProject(project.id))}>{busy?'Deleting…':'Delete project'}</button></div>{error&&<p role="alert">{error}</p>}</dialog>
  </li>;
}

export default function ProjectsList() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = projects?.filter(p => p.name.toLowerCase().includes(query.toLowerCase().trim()));

  const refresh = useCallback(() => {
    listProjects()
      .then(list => setProjects(list.filter(hasContent)))
      .catch(() => setFailed(true));
  }, []);
  useEffect(refresh, [refresh]);

  return (
    <>
      <header className="pj-head">
        <div>
          <h1>Projects</h1>
          <p>{projects && projects.length > 0 ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}` : ''}</p>
        </div>
        {projects && projects.length > 0 && (
          <div className="pj-new">
            <Link className="btn" href="/studio?format=icon">
              <Plus size={16} aria-hidden="true" /> New icon
            </Link>
            <Link className="btn primary" href="/studio">
              <Plus size={16} aria-hidden="true" /> New thumbnail
            </Link>
          </div>
        )}
      </header>

      {failed ? (
        <div className="pj-empty" role="alert">
          <CircleAlert size={28} aria-hidden="true" />
          <h2>Can’t save in this window</h2>
          <p>This browser is blocking storage, which often happens in private windows. Open Bopzi in a normal window to keep your projects.</p>
        </div>
      ) : projects === null ? (
        <div className="pj-loading" role="status" aria-label="Looking for saved projects">
          <i />
          <i />
          <i />
        </div>
      ) : projects.length === 0 ? (
        <div className="pj-empty">
          <h2>Start your first thumbnail</h2>
          <p>Projects save here as you work.</p>
          <Link className="btn primary" href="/studio">
            New thumbnail
          </Link>
        </div>
      ) : (
        <>
          <label className="pj-search"><Search size={16}/><input type="search" aria-label="Search projects" placeholder="Find a project…" value={query} onChange={e => setQuery(e.target.value)}/></label>
          {filtered?.length === 0 && <p className="pj-no-results">No projects match “{query}”.</p>}
          <ul className="pj-grid">
            {filtered?.map((p) => (
              <Card key={p.id} project={p} onChanged={refresh} />
            ))}
          </ul>
          <p className="pj-note">Saved in this browser, on this device. Download anything you want to keep.</p>
        </>
      )}
    </>
  );
}
