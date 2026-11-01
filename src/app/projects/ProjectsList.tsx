'use client';

import { CircleAlert, ImageIcon, Plus, MoreHorizontal, Pencil, Copy, Trash2, ArrowUpRight, Check, X, Download, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteProject, duplicateProject, hasContent, listProjects, putProject } from '@/lib/db';
import type { Project } from '@/lib/types';

function Card({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const [renaming, setRenaming] = useState(false), [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const menu = useRef<HTMLDetailsElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    const url = project.thumb ? URL.createObjectURL(project.thumb) : null;
    setThumb(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [project.thumb]);
  useEffect(() => { const away = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && menu.current) menu.current.open = false; }; document.addEventListener('pointerdown', away); return () => document.removeEventListener('pointerdown', away); }, []);
  const closeMenu = () => { if (menu.current) menu.current.open = false; };
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); try { await fn(); onChanged(); return true; } catch (e) { setError(e instanceof Error ? e.message : 'Could not save that change. Try again.'); return false; } finally { setBusy(false); } };
  const href = '/studio?p=' + project.id;
  const cancelRename = () => { setName(project.name); setRenaming(false); requestAnimationFrame(() => menu.current?.querySelector('summary')?.focus()); };
  return <li className="pj-card">
    <Link className={'pj-shot' + (project.doc.size ? ' is-icon' : '')} href={href} aria-label={'Open ' + project.name}>{thumb ? <img src={thumb} alt=""/> : <ImageIcon size={24}/>}<span className="pj-open-hint">Open project <ArrowUpRight size={15}/></span></Link>
    <div className="pj-info"><div className="pj-title-row">{renaming ? <form className="pj-rename" onSubmit={async e => { e.preventDefault(); if (!name.trim()) return; if (await run(() => putProject({ ...project, name: name.trim() }))) setRenaming(false); }}><input autoFocus aria-label={'Rename ' + project.name} value={name} maxLength={80} disabled={busy} onChange={e => setName(e.target.value)} onFocus={e => e.target.select()} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); cancelRename(); } }}/><button type="submit" aria-label="Save project name" disabled={busy || !name.trim()}><Check size={16}/></button><button type="button" aria-label="Cancel rename" disabled={busy} onClick={cancelRename}><X size={16}/></button></form> : <h3 title={project.name}><Link href={href}>{project.name}</Link></h3>}
    {!renaming && <details className="pj-menu" ref={menu} onKeyDown={e=>{if(e.key === 'Escape'){closeMenu();menu.current?.querySelector('summary')?.focus();}}}><summary aria-label={'Project actions for ' + project.name}><MoreHorizontal size={19}/></summary><nav aria-label={'Actions for ' + project.name}><Link href={href}><ArrowUpRight size={15}/>Open project</Link><button disabled={busy} onClick={() => { closeMenu(); setName(project.name); setRenaming(true); }}><Pencil size={15}/>Rename</button><button disabled={busy} onClick={() => { closeMenu(); void run(() => duplicateProject(project.id)); }}><Copy size={15}/>Duplicate</button><button className="danger" disabled={busy} onClick={() => { closeMenu(); dialog.current?.showModal(); }}><Trash2 size={15}/>Delete project</button></nav></details>}
    </div>
    {project.exportedAt && <div className="pj-export-status is-exported"><Download size={12}/>Downloaded</div>}{error && <p className="pj-error" role="alert">{error}</p>}</div>
    <dialog ref={dialog} className="pj-delete-dialog" onClose={()=>menu.current?.querySelector('summary')?.focus()} onClick={e => { if(e.target === e.currentTarget && !busy) dialog.current?.close(); }} onCancel={e=>{if(busy)e.preventDefault();}}><div className="pj-delete-icon"><Trash2 size={22}/></div><h2>Delete this project?</h2><p>“{project.name}” and its saved images will be removed from this browser. This cannot be undone.</p><div><button type="button" autoFocus disabled={busy} onClick={()=>dialog.current?.close()}>Keep project</button><button type="button" className="danger" disabled={busy} onClick={()=>void run(()=>deleteProject(project.id))}>{busy?'Deleting…':'Delete project'}</button></div>{error&&<p role="alert">{error}</p>}</dialog>
  </li>;
}

type Kind = 'all' | 'thumbnail' | 'icon';
type Sort = 'recent' | 'oldest' | 'name';
const KINDS: { id: Kind; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'thumbnail', label: 'Thumbnails' }, { id: 'icon', label: 'Icons' }];
const SORTS: Record<Sort, (a: Project, b: Project) => number> = {
  recent: (a, b) => b.updatedAt - a.updatedAt,
  oldest: (a, b) => a.updatedAt - b.updatedAt,
  name: (a, b) => a.name.localeCompare(b.name),
};

export default function ProjectsList() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const filtered = projects
    ?.filter(p => p.name.toLowerCase().includes(query.toLowerCase().trim()))
    .filter(p => kind === 'all' || (kind === 'icon') === !!p.doc.size)
    .sort(SORTS[sort]);

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
        <div className="pj-new">
          <Link className="btn" href="/studio?format=icon">
            <Plus size={16} aria-hidden="true" /> New icon
          </Link>
          <Link className="btn primary" href="/studio">
            <Plus size={16} aria-hidden="true" /> New thumbnail
          </Link>
        </div>
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
        </div>
      ) : (
        <>
          <div className="pj-tools">
            <label className="pj-search"><Search size={16}/><input type="search" aria-label="Search projects" placeholder="Find a project…" value={query} onChange={e => setQuery(e.target.value)}/></label>
            <div className="pj-kinds" role="group" aria-label="Project type">{KINDS.map(k => <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>)}</div>
            <select className="pj-sort" aria-label="Sort projects" value={sort} onChange={e => setSort(e.target.value as Sort)}>
              <option value="recent">Recently edited</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name</option>
            </select>
          </div>
          {filtered?.length === 0 && <p className="pj-no-results">{query.trim() ? <>No projects match “{query}”.</> : 'No projects here yet.'}</p>}
          <ul className="pj-grid">
            {filtered?.map((p) => (
              <Card key={p.id} project={p} onChanged={refresh} />
            ))}
          </ul>
          <p className="pj-note">Saved on this computer. Download anything you want to keep.</p>
        </>
      )}
    </>
  );
}
