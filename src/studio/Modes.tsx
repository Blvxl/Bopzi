'use client';

import { ArrowLeft, CircleAlert, Square } from 'lucide-react';
import { useEffect } from 'react';
import { useAsset } from '@/lib/assets';
import type { ImageLayer } from '@/lib/types';
import { useStudio, type TakeSlot } from './context';
import GenerationDots from './GenerationDots';

/** How many images one idea generates. */
export const TAKE_COUNT = 1;

/** Create: one question, and the prompt bar under it. */
export function CreateIntro() {
  const s = useStudio();
  const hasArt = s.doc.layers.length > 0;
  return (
    <section className="create-intro" aria-labelledby="create-title">
      {hasArt && <button type="button" className="create-back" onClick={() => s.setView('refine')}><ArrowLeft size={14} />Back to your thumbnail</button>}
      <h1 id="create-title">Describe your game.</h1>
    </section>
  );
}

function Take({ slot, index, current, onPick }: { slot: TakeSlot; index: number; current: boolean; onPick: (id: string) => void }) {
  const s = useStudio();
  const layer = s.doc.layers.find((l): l is ImageLayer => l.type === 'image' && l.id === slot.id);
  const asset = useAsset(layer?.assetId);
  const label = `Idea ${index + 1}`;
  if (slot.status === 'ready' && layer) {
    return (
      <button type="button" className="take-tile" aria-pressed={current} aria-label={`Work on ${label.toLowerCase()}`} aria-keyshortcuts={String(index + 1)} title={`Open  (${index + 1})`} onClick={() => onPick(layer.id)}>
        {asset && asset !== 'missing' && <img src={asset.url} alt="" draggable={false} />}
        <span>{label}{slot.style && <em>{slot.style}</em>}<kbd>{index + 1}</kbd></span>
      </button>
    );
  }
  return (
    <div className={`take-tile is-${slot.status}`} role="status" aria-label={`${label}: ${slot.status === 'making' ? 'being made' : slot.status === 'failed' ? 'failed' : 'waiting'}`}>
      {slot.status === 'making' && <GenerationDots running />}
      <p>
        {slot.status === 'making' && <><b>Making {label.toLowerCase()}…</b>{slot.style && <small>In the style of {slot.style}</small>}{slot.scene && <small>{slot.scene}</small>}</>}
        {slot.status === 'waiting' && <b>{label} is next</b>}
        {slot.status === 'failed' && <><CircleAlert size={15} /><b>{label} didn't work</b><small>{slot.error}</small></>}
      </p>
    </div>
  );
}

/** Pick: the takes for the latest idea, filled in as they arrive. Clicking one opens it to refine. */
export default function TakesGrid() {
  const s = useStudio();
  // After a reload there is no batch in memory, so the latest concepts stand in for it.
  const concepts = s.doc.layers.filter((l): l is ImageLayer => l.type === 'image' && l.name === 'AI thumbnail' && !l.conceptId);
  const slots: TakeSlot[] = s.takes?.slots ?? concepts.slice(-4).map((l) => ({ status: 'ready', id: l.id }));
  const visible = s.doc.layers.find((l) => l.type === 'image' && l.name === 'AI thumbnail' && l.visible);
  const shownId = visible?.type === 'image' ? visible.conceptId ?? visible.id : null;
  const running = !!s.takes?.running;
  const making = slots.findIndex((x) => x.status === 'making');
  const ready = slots.filter((x) => x.status === 'ready').length;
  const pick = (id: string) => { s.showConcept(id); s.setView('refine'); };
  // 1 to 4 open a finished take, so choosing never needs the mouse.
  const readyIds = slots.map((x) => (x.status === 'ready' ? x.id : undefined)).join(',');
  useEffect(() => {
    const ids = readyIds.split(',');
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]');
      if (e.ctrlKey || e.metaKey || e.altKey || typing) return;
      const id = /^[1-4]$/.test(e.key) ? ids[Number(e.key) - 1] : '';
      if (id) { e.preventDefault(); s.showConcept(id); s.setView('refine'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readyIds, s]);
  return (
    <section className="takes-grid" aria-labelledby="takes-title">
      <header>
        <div>
          <h2 id="takes-title">{slots.length === 1 ? `Your ${s.isIcon ? 'icon' : 'thumbnail'}` : 'Pick one'}</h2>
          <p>{running ? (slots.length === 1 ? `Creating your ${s.isIcon ? 'icon' : 'thumbnail'}. This takes about a minute.` : `Making image ${making + 1} of ${slots.length}. ${ready ? 'You can open a finished one now.' : 'Each takes about a minute.'}`) : ready ? 'Open it to change it in plain words, or edit it by hand.' : 'Nothing came back this time. Try the idea again.'}</p>
        </div>
        {running && slots.length > 1 && s.takes?.stop && <button type="button" className="studio-quiet" onClick={s.takes.stop}><Square size={13} /><span>Stop after this one</span></button>}
        <button type="button" className="studio-quiet" disabled={running} onClick={() => s.setView('create')}><ArrowLeft size={14} /><span>New idea</span></button>
      </header>
      {/* The area measures itself so the 2 × 2 grid always fits without scrolling. */}
      <div className="takes-area">
        <div className={`takes-tiles count-${Math.min(slots.length, 4)}${s.isIcon ? ' is-square' : ''}`}>
          {slots.map((slot, i) => <Take key={i} slot={slot} index={i} current={!!slot.id && slot.id === shownId} onPick={pick} />)}
        </div>
      </div>
    </section>
  );
}
