'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Captions, Loader2, Scissors, X } from 'lucide-react';
import { fontOf } from '@/lib/fonts';
import { CAPTION_PRESETS, type CaptionStyle } from './model';
import type { CutWord } from './insights';

/**
 * The cut as a document: everything said, in order, by speaker. Click a word to jump there; drag across words (or
 * shift-click) and press Delete to cut them out of the video. Ums and pauses go with one button each. Double-click a
 * word the speech model misheard to fix it, and click a speaker's label to give them a name.
 */
export default function TranscriptPanel({ words, time, disabled, analysing, pauses, onSeek, onCut, onFixWord, onNameSpeaker, captions }: {
  words: CutWord[]; time: number; disabled: boolean; analysing: boolean; pauses: [number, number][];
  onSeek: (time: number) => void; onCut: (ranges: [number, number][], label: string) => void;
  onFixWord: (word: CutWord, text: string) => void; onNameSpeaker: (assetId: string, speaker: number, name: string) => void;
  /** Captions are the transcript on screen, so they are made and styled from here. */
  captions: { count: number; style: CaptionStyle; busy: string; onMake: () => void; onStyle: (patch: Partial<CaptionStyle>) => void };
}) {
  const [sel, setSel] = useState<[number, number] | null>(null), [looks, setLooks] = useState(false);
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null), [naming, setNaming] = useState<{ assetId: string; speaker: number; value: string } | null>(null);
  const drag = useRef<{ anchor: number; moved: boolean } | null>(null), body = useRef<HTMLDivElement>(null);
  useEffect(() => { setSel(null); }, [words]);
  useEffect(() => { const up = () => { drag.current = null; }; window.addEventListener('pointerup', up); return () => window.removeEventListener('pointerup', up); }, []);
  // Turns: a new paragraph whenever the speaker changes or there is a long pause.
  const turns = useMemo(() => {
    const out: { speaker: number; assetId: string; name?: string; from: number; to: number }[] = [];
    words.forEach((w, i) => { const last = out.at(-1); if (last && last.speaker === w.speaker && last.assetId === w.assetId && w.start - words[i - 1].end < 2.5) last.to = i; else out.push({ speaker: w.speaker, assetId: w.assetId, name: w.name, from: i, to: i }); });
    return out;
  }, [words]);
  const playing = words.findIndex(w => time >= w.start && time < w.end + .05);
  const fillers = words.filter(w => w.filler);
  const pauseTime = pauses.reduce((s, [a, b]) => s + b - a, 0);
  const [a, b] = sel ? [Math.min(...sel), Math.max(...sel)] : [-1, -1];
  /** What deleting the selection removes: from its first word to just before the next one, so no stray breath is left. */
  const selectionRange = (): [number, number] | null => {
    if (a < 0) return null;
    const next = words[b + 1], end = next && next.start - words[b].end < .6 ? next.start - .02 : words[b].end + .08;
    return [Math.max(0, words[a].start - .02), end];
  };
  const cutSelection = () => { const r = selectionRange(); if (!r || disabled) return; onCut([r], `Cut "${words.slice(a, b + 1).map(w => w.text).join(' ').slice(0, 40)}"`); setSel(null); };

  if (!words.length) return <div className="ve-transcript is-empty">{analysing ? <p><Loader2 size={14} className="ve-spin"/>Bopzi is still listening to your footage. The words appear here as soon as they are ready.</p> : <p>No speech in this cut. Add footage with talking, or check the clips are not muted.</p>}</div>;
  return <div className="ve-transcript">
    <div className="ve-transcript-bar">
      {sel ? <>
        <span>{b - a + 1} word{b === a ? '' : 's'} selected · {((selectionRange()?.[1] ?? 0) - (selectionRange()?.[0] ?? 0)).toFixed(1)}s</span>
        <button type="button" className="is-primary" disabled={disabled} onClick={cutSelection}><Scissors size={13}/>Cut from video<kbd>Del</kbd></button>
        <button type="button" aria-label="Clear selection" onClick={() => setSel(null)}><X size={13}/></button>
      </> : <>
        <span className="ve-transcript-hint">Click a word to jump · drag across words to cut · double-click to fix a word</span>
        <button type="button" aria-expanded={looks} onClick={() => setLooks(v => !v)}><Captions size={13}/>{captions.count ? 'Captions' : 'Add captions'}</button>
        <button type="button" disabled={disabled || !fillers.length} title={fillers.map(f => f.text).join(', ')} onClick={() => onCut(fillers.map(f => [f.start - .03, f.end + .03]), `Remove ${fillers.length} filler word${fillers.length === 1 ? '' : 's'}`)}>{fillers.length ? `Remove ${fillers.length} um${fillers.length === 1 ? '' : 's'}` : 'No ums'}</button>
        <button type="button" disabled={disabled || !pauses.length} onClick={() => onCut(pauses, `Remove ${pauses.length} pause${pauses.length === 1 ? '' : 's'}`)}>{pauses.length ? `Remove ${pauses.length} pause${pauses.length === 1 ? '' : 's'} (${pauseTime.toFixed(1)}s)` : 'No pauses'}</button>
      </>}
    </div>
    {looks && <div className="ve-caption-looks">
      <div className="ve-caption-looks-head">
        <button type="button" className="is-primary" disabled={disabled || !!captions.busy} onClick={captions.onMake}>{captions.busy ? <><Loader2 size={13} className="ve-spin"/>{captions.busy}</> : captions.count ? 'Make captions again' : 'Make captions'}</button>
        <label><input type="checkbox" checked={!!captions.style.emoji} disabled={disabled} onChange={e => captions.onStyle({ emoji: e.target.checked })}/>Emoji on key words 💰</label>
      </div>
      <div className="ve-caption-looks-grid" role="group" aria-label="Caption looks">{CAPTION_PRESETS.map(p => <button type="button" key={p.id} disabled={disabled} aria-pressed={captions.style.preset === p.id} onClick={() => captions.onStyle({ ...p.style, preset: p.id })}
        style={{ fontFamily: fontOf(p.style.font ?? 'fredoka').family, color: p.style.color, ['--active' as string]: p.style.activeColor, ['--glow' as string]: p.style.glow ?? 'transparent' }}>
        <span className={`is-${p.style.active ?? 'pop'}`}>{p.style.uppercase ? 'NO' : 'no'} <b>{p.style.uppercase ? 'WAY' : 'way'}</b></span><small>{p.label}</small></button>)}</div>
    </div>}    <div className="ve-transcript-body" ref={body} tabIndex={0} aria-label="Transcript of the cut" onKeyDown={e => { if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); e.stopPropagation(); cutSelection(); } if (e.key === 'Escape') setSel(null); }}>
      {turns.map((t, k) => <p key={k} className={`is-s${(t.speaker % 4) + 1}`}>
        {naming && naming.assetId === t.assetId && naming.speaker === t.speaker
          ? <input className="ve-speaker-edit" autoFocus maxLength={40} placeholder={`Speaker ${t.speaker + 1}`} value={naming.value} aria-label="Speaker name"
            onChange={e => setNaming({ ...naming, value: e.target.value })} onBlur={() => { onNameSpeaker(naming.assetId, naming.speaker, naming.value); setNaming(null); }}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setNaming(null); }}/>
          : <button type="button" className="ve-speaker-name" disabled={disabled} title="Click to name this speaker" onClick={() => setNaming({ assetId: t.assetId, speaker: t.speaker, value: t.name ?? '' })}>{t.name || `Speaker ${t.speaker + 1}`}</button>}
        {words.slice(t.from, t.to + 1).map((w, j) => { const i = t.from + j;
          if (editing?.key === w.key) return <input key={w.key} className="ve-word-edit" autoFocus value={editing.value} size={Math.max(2, editing.value.length + 1)} aria-label={`Fix "${w.text}"`}
            onChange={e => setEditing({ key: w.key, value: e.target.value })}
            onBlur={() => { if (editing.value.trim() !== w.text) onFixWord(w, editing.value); setEditing(null); }}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setEditing(null); body.current?.focus(); } }}/>;
          return <span key={w.key}
          className={`${i >= a && i <= b ? 'is-selected' : ''}${i === playing ? ' is-now' : ''}${w.filler ? ' is-filler' : ''}`}
          onPointerDown={e => { e.preventDefault(); body.current?.focus(); if (e.shiftKey && sel) { setSel([sel[0], i]); return; } drag.current = { anchor: i, moved: false }; setSel(null); }}
          onPointerEnter={() => { const d = drag.current; if (!d) return; if (i !== d.anchor) d.moved = true; if (d.moved) setSel([d.anchor, i]); }}
          onPointerUp={() => { const d = drag.current; if (d && !d.moved) onSeek(w.start); drag.current = null; }}
          onDoubleClick={() => { if (!disabled) { setSel(null); setEditing({ key: w.key, value: w.text }); } }}
          title={`${w.start.toFixed(1)}s · double-click to fix`}>{w.text}</span>; })}
      </p>)}    </div>
  </div>;
}
