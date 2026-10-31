'use client';
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { findMoments, type Indexes, type Moment } from './insights';
import type { Media, Mode } from './model';
import { aiModelChoice } from './ModelPicker';

const titles = new Map<string, Promise<string[]>>();
/** Titles for a set of moments, asked once per set and kept for the session (and on this device). */
function nameMoments(key: string, name: string, moments: Moment[], shots: (m: Moment) => string) {
  let found = titles.get(key);
  if (!found) {
    const saved = (() => { try { return JSON.parse(localStorage.getItem(`bopzi-moments:${key}`) ?? 'null'); } catch { return null; } })();
    found = Array.isArray(saved) ? Promise.resolve(saved as string[]) : fetch('/api/video/name-moments', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bopzi-local': '1' }, body: JSON.stringify({ name, model: aiModelChoice().model, moments: moments.map(m => ({ text: m.text, shots: shots(m) })) }) })
      .then(r => r.json()).then(b => { const list = Array.isArray(b?.titles) ? b.titles as string[] : []; try { localStorage.setItem(`bopzi-moments:${key}`, JSON.stringify(list)); } catch {} return list; })
      .catch(() => { titles.delete(key); return []; });
    titles.set(key, found);
  }
  return found;
}

/**
 * The best stretches of the footage as ready-made clips, picked from what Bopzi heard and saw (laughs, back-and-forth,
 * questions and answers, big reactions). One click makes one the cut, or adds it to the end.
 */
export default function MomentsPanel({ indexes, assets, mode, disabled, analysing, onUse, onAdd }: {
  indexes: Indexes; assets: Media[]; mode: Mode; disabled: boolean; analysing: boolean;
  onUse: (m: Moment) => void; onAdd: (m: Moment) => void;
}) {
  const moments = useMemo(() => Object.values(indexes).filter(i => i.phrases.length || i.shots.length).flatMap(i => findMoments(i, mode)).sort((a, b) => b.score - a.score).slice(0, 5), [indexes, mode]);
  const [named, setNamed] = useState<string[]>([]);
  useEffect(() => {
    setNamed([]);
    if (!moments.length) return;
    const key = `${mode}:${moments.map(m => `${m.assetId.slice(0, 8)}@${m.start}`).join(',')}`;
    const name = assets.find(a => a.id === moments[0].assetId)?.name ?? 'video';
    let live = true;
    void nameMoments(key, name, moments, m => (indexes[m.assetId]?.shots ?? []).filter(s => s.end > m.start && s.start < m.end).map(s => s.description).filter(Boolean).join(' / ')).then(t => { if (live) setNamed(t); });
    return () => { live = false; };
  }, [moments, mode, assets, indexes]);

  if (!moments.length) return <div className="ve-moments is-empty"><p>{analysing ? <><Loader2 size={14} className="ve-spin"/>Bopzi is still getting to know your footage. Moments appear here when it is done.</> : 'Add footage and Bopzi suggests its best moments here.'}</p></div>;
  return <div className="ve-moments">
    <p className="ve-moments-note"><Sparkles size={13}/>Picked from what Bopzi heard and saw in your footage{analysing ? ' so far' : ''}.</p>
    <ol>{moments.map((m, i) => { const asset = assets.find(a => a.id === m.assetId); return <li key={`${m.assetId}@${m.start}`}>
      <div className="ve-moment-thumb" style={asset?.poster ? { backgroundImage: `url("${asset.poster}")` } : undefined}><span>{Math.round(m.end - m.start)}s</span></div>
      <div className="ve-moment-copy">
        <b>{named[i] || <span className="ve-moment-pending">{m.text.split(' ').slice(0, 7).join(' ')}…</span>}</b>
        <small>{Math.floor(m.start / 60)}:{String(Math.floor(m.start % 60)).padStart(2, '0')}–{Math.floor(m.end / 60)}:{String(Math.floor(m.end % 60)).padStart(2, '0')}{m.reasons.length ? ` · ${m.reasons.join(' · ')}` : ''}</small>
        <q>{m.text.slice(0, 160)}{m.text.length > 160 ? '…' : ''}</q>
      </div>
      <div className="ve-moment-actions">
        <button type="button" className="is-primary" disabled={disabled || !asset} onClick={() => onUse(m)}>Use this</button>
        <button type="button" disabled={disabled || !asset} title="Add after the current cut" onClick={() => onAdd(m)}><Plus size={13}/>Add</button>
      </div>
    </li>; })}</ol>
  </div>;
}
