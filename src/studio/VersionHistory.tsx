'use client';

import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useAsset } from '@/lib/assets';
import type { ImageLayer } from '@/lib/types';

function VersionRow({ layer, index, current, selected, onPick }: { layer: ImageLayer; index: number; current: boolean; selected: boolean; onPick: () => void }) {
  const asset = useAsset(layer.assetId);
  return <button type="button" className="history-row" aria-pressed={selected} aria-label={`Inspect version ${index + 1}`} onClick={onPick}>
    <div>{asset && asset !== 'missing' && <img src={asset.url} alt="" draggable={false}/>}</div>
    <span><b>Version {index + 1}</b><small title={layer.edit?.instruction}>{layer.edit ? `${layer.edit.area ? 'Marked area · ' : ''}${layer.edit.instruction}` : index === 0 ? 'Original image' : 'AI edit'}</small></span>
    {current && <span className="history-current"><Check size={11}/>Current</span>}
  </button>;
}

export default function VersionHistory({ versions, currentId, name, disabled, trigger, onRestore, onClose, exiting = false }: { versions: ImageLayer[]; currentId: string; name: string; disabled: boolean; trigger: RefObject<HTMLButtonElement | null>; onRestore: (id: string) => void; onClose: () => void; exiting?: boolean }) {
  const [selectedId, setSelectedId] = useState(currentId);
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const selected = versions.find(v => v.id === selectedId) ?? versions.find(v => v.id === currentId) ?? versions[0];
  const asset = useAsset(selected?.assetId);
  const index = versions.findIndex(v => v.id === selected?.id);
  useEffect(() => { close.current?.focus(); }, []);
  useEffect(() => {
    if (exiting) return;
    const outside = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) onClose(); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [onClose, trigger, exiting]);
  return <aside ref={panel} className={`version-history${exiting ? ' is-exiting' : ''}`} role="dialog" aria-label={`Version history for ${name}`} aria-hidden={exiting || undefined} inert={exiting}>
    <header><div><h2>Version history</h2><p>{name} · {versions.length} {versions.length === 1 ? 'version' : 'versions'}</p></div><button ref={close} type="button" aria-label="Close version history" onClick={onClose}><X size={16}/></button></header>
    <div className="history-preview">{asset && asset !== 'missing' ? <img src={asset.url} alt={`Preview of version ${index + 1}`} draggable={false}/> : <p>{asset === 'missing' ? 'This image is unavailable.' : 'Loading preview…'}</p>}</div>
    <p className="history-hint">Inspect an image before restoring. Your text and layers stay in place.</p>
    <div className="history-list" aria-label="Saved image versions">{[...versions].reverse().map(v => <VersionRow key={v.id} layer={v} index={versions.indexOf(v)} selected={selected?.id === v.id} current={v.id === currentId} onPick={() => setSelectedId(v.id)}/>)}</div>
    <footer>{versions.length === 1 && <p>Your next AI edit will appear here.</p>}<button type="button" className="history-restore" disabled={disabled || !asset || asset === 'missing' || selected?.id === currentId} onClick={() => selected && onRestore(selected.id)}>{selected?.id === currentId ? 'Current version' : `Restore version ${index + 1}`}</button></footer>
  </aside>;
}
