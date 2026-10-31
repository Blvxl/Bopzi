'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pause, Play, X, Sparkles } from 'lucide-react';
import Preview from './Preview';
import { duration, type Media, type Timeline } from './model';
import { timelineDifferences } from './ai-review';
import type { Step, StepResult } from './operations';
/** `check`: the AI looking at finished frames of its own proposal, and what it found wrong there. */
export type EditCheck = { state: 'checking' | 'done' | 'failed'; frames: number; problems: { time?: number; problem: string; fix: string }[] };
/** `steps`: the AI's changes one by one; `enabled` says which are switched on, and `after` is always their result. */
export type EditProposal = { before: Timeline; after: Timeline; summary: string; label: string; source: 'ai' | 'pack' | 'cut'; captions?: string; instruction?: string; check?: EditCheck; steps?: Step[]; results?: StepResult[]; enabled?: boolean[] };
export default function EditReview({ proposal, assets, at, onAccept, onReject, onClose }: { proposal: EditProposal; assets: Media[]; at: number; onAccept: () => void; onReject: () => void; onClose?: () => void }) {
  const [after, setAfter] = useState(true), [playing, setPlaying] = useState(false), [time, setTime] = useState(() => {
    const first = timelineDifferences(proposal.before, proposal.after, assets).differences.find(d => d.action !== 'removed');
    const total = duration(proposal.after);
    return Math.max(0, Math.min(total, first?.afterStart !== undefined ? first.afterStart + Math.min(.35, (total - first.afterStart) / 2) : at));
  });
  const root = useRef<HTMLDivElement>(null), reject = useRef<HTMLButtonElement>(null);
  const diff = useMemo(() => timelineDifferences(proposal.before, proposal.after, assets), [proposal, assets]);
  const shown = after ? proposal.after : proposal.before, total = duration(shown);
  useEffect(() => { setTime(t => Math.max(0, Math.min(t, total))); }, [total]);
  useEffect(() => { const old = document.activeElement as HTMLElement | null; reject.current?.focus(); return () => { old?.focus(); }; }, []);
  const toggle = (value: boolean) => { setAfter(value); setPlaying(false); };
  const changes = diff.differences.length + diff.settings.length;
  return <div className="ve-review-backdrop"><div className="ve-review" ref={root} role="dialog" aria-modal="true" aria-labelledby="edit-review-title" onKeyDown={e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); (onClose ?? onReject)(); }
    if (e.key === 'Tab') { const controls = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? []), first = controls[0], last = controls.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
  }}>
    <header><div><span><Sparkles size={13}/>{proposal.source === 'ai' ? 'AI edit review' : proposal.source === 'cut' ? 'Saved cut comparison' : 'Editable Roblox pack'}</span><h2 id="edit-review-title">{proposal.source === 'ai' ? 'Review before you apply.' : proposal.label}</h2></div><button ref={reject} type="button" className="ibtn" aria-label={onClose ? "Close edit details" : "Discard proposed edit"} onClick={onClose ?? onReject}><X size={18}/></button></header>
    <div className="ve-review-body"><section className="ve-review-player" aria-label="Compare edit preview">
      <div className="ve-review-switch" role="group" aria-label="Compare versions"><button type="button" aria-pressed={!after} onClick={() => toggle(false)}>Original</button><button type="button" aria-pressed={after} onClick={() => toggle(true)}>Proposed edit</button></div>
      <div className="ve-review-video"><Preview timeline={shown} assets={assets} time={Math.min(time, total)} playing={playing} onTime={setTime} onEnd={() => setPlaying(false)} muted={false}/></div>
      <div className="ve-review-playback"><button type="button" aria-label={playing ? 'Pause review' : 'Play review'} disabled={!total} onClick={() => { if (time >= total) setTime(0); setPlaying(v => !v); }}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button><input type="range" aria-label="Review preview position" min={0} max={total || 1} step={1 / 30} value={Math.min(time, total)} disabled={!total} onChange={e => { setPlaying(false); setTime(Number(e.target.value)); }}/><span>{Math.min(time, total).toFixed(1)} / {total.toFixed(1)}s</span></div>
      <p>Your saved edit stays unchanged until you apply this proposal.</p>
    </section><section className="ve-review-changes" aria-label="Proposed changes"><p>{proposal.summary}</p>
      <div className="ve-review-counts">{(['added', 'updated', 'removed'] as const).map(action => <span key={action} className={'is-' + action}>{diff.differences.filter(d => d.action === action).length} {action === 'updated' ? 'changed' : action}</span>)}</div>
      {diff.settings.map(setting => <div className="ve-review-setting" key={setting}>{setting}</div>)}
      {diff.differences.map(d => <button type="button" className={'ve-review-item is-' + d.action} key={d.id} onClick={() => { setPlaying(false); const proposed = d.action !== 'removed'; setAfter(proposed); const t = proposed ? d.afterStart : d.beforeStart; setTime(Math.max(0, (t ?? 0) + .2)); }}><span>{d.action === 'updated' ? 'Changed' : d.action === 'added' ? 'Added' : 'Removed'} · {d.kind === 'clips' ? 'Footage' : d.kind}</span><b>{d.label}</b><small>{d.details.join(' · ')}</small></button>)}
      {!changes && <p>No timeline changes were proposed.</p>}
      {proposal.captions === 'make' && <p className="ve-review-deferred">Speech captions will be generated after applying.</p>}
      {proposal.after.effects.some(e => e.kind === 'highlight' && !e.mask && !proposal.before.effects.some(o => o.id === e.id && !(o.kind === 'highlight' && o.mask))) && <p className="ve-review-deferred">New object highlights are traced after applying; this preview shows their placement.</p>}
    </section></div>
    <footer><span>{changes} {changes === 1 ? 'change' : 'changes'} · fully editable · Undo available</span><button type="button" className="ebtn" onClick={onReject}>Discard</button><button type="button" className="ebtn go" disabled={!changes && proposal.captions !== 'make'} onClick={onAccept}><Check size={15}/>Apply {proposal.source === 'pack' ? 'pack' : 'edit'}</button></footer>
  </div></div>;
}
