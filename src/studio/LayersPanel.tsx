'use client';

import { ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, Copy, Eye, EyeOff, Lock, LockOpen, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAsset } from '@/lib/assets';
import { fontOf } from '@/lib/fonts';
import type { Layer } from '@/lib/types';
import { useStudio } from './context';
import { Color, IconBtn } from './controls';

function Chip({ layer }: { layer: Layer }) {
  const asset = useAsset(layer.type === 'image' ? layer.assetId : undefined);
  if (layer.type === 'image') {
    return (
      <span className="checker grid h-8 w-12 flex-none place-items-center overflow-hidden rounded-[5px] border border-ui-line">
        {asset && asset !== 'missing' && <img src={asset.url} alt="" className="max-h-full max-w-full object-contain" draggable={false} />}
      </span>
    );
  }
  return (
    <span
      className="grid h-8 w-12 flex-none place-items-center overflow-hidden rounded-[5px] border border-ui-line bg-[#1f1d1b] text-[15px] leading-none"
      style={
        layer.type === 'text'
          ? { fontFamily: fontOf(layer.font).family, fontWeight: fontOf(layer.font).weight, color: layer.fill }
          : layer.type === 'shape'
            ? { color: layer.fill || layer.stroke }
            : { background: layer.color === '#000000' ? 'radial-gradient(closest-side, #000, #2a2622)' : 'radial-gradient(closest-side, ' + layer.color + ', transparent), #151413' }
      }
    >
      {layer.type === 'text' && 'Aa'}
      {layer.type === 'shape' && '■'}
    </span>
  );
}

const label = (l: Layer) => (l.type === 'text' ? l.text.replace(/\s+/g, ' ').trim() || 'Empty text' : l.name === 'AI thumbnail' ? 'Image' : l.name);
const kind = (l: Layer) => (l.type === 'image' ? (l.role === 'character' ? 'Character' : l.role === 'background' ? 'Background' : 'Image') : l.type === 'text' ? 'Text' : l.type === 'shape' ? 'Shape' : 'Light') + (l.groupId ? ' · grouped' : '');

export default function LayersPanel() {
  const s = useStudio();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const layers = s.doc.layers;
  const hasOriginalUploads = layers.some((layer) => layer.type === 'image' && layer.original);
  const sel = s.selected;
  const index = sel ? layers.findIndex((l) => l.id === sel.id) : -1;
  const top = layers.length - 1;
  const selProtected = sel ? s.isProtected(sel) : false;

  return (
    <div className="layers-panel flex min-h-0 flex-col">
      <header className="layers-heading flex h-10 flex-none items-center justify-between gap-2 border-b border-ui-line pl-3.5 pr-2">
        <h3 className="sr-only">Layer actions</h3>
        {sel && <div className="flex">
          <IconBtn tip="Bring to front" disabled={!sel || index === top} onClick={() => sel && s.reorder(sel.id, top)}>
            <ChevronsUp size={15} />
          </IconBtn>
          <IconBtn tip="Move up  (Ctrl ])" disabled={!sel || index === top} onClick={() => sel && s.reorder(sel.id, index + 1)}>
            <ChevronUp size={15} />
          </IconBtn>
          <IconBtn tip="Move down  (Ctrl [)" disabled={!sel || index <= 0} onClick={() => sel && s.reorder(sel.id, index - 1)}>
            <ChevronDown size={15} />
          </IconBtn>
          <IconBtn tip="Send to back" disabled={!sel || index <= 0} onClick={() => sel && s.reorder(sel.id, 0)}>
            <ChevronsDown size={15} />
          </IconBtn>
          <IconBtn tip="Duplicate  (Ctrl D)" disabled={!sel} onClick={() => sel && s.duplicate(sel.id)}>
            <Copy size={14} />
          </IconBtn>
          <IconBtn
            side="left"
            tip={selProtected ? 'Protected original. Turn off Protect original uploads to delete' : 'Delete  (Del)'}
            disabled={!sel || selProtected}
            onClick={() => sel && s.remove(sel.id)}
          >
            <Trash2 size={14} />
          </IconBtn>
        </div>}
      </header>

      {/* A full picture covers the background, so its colour would change nothing you can see. */}
      {!s.doc.layers.some(l => l.type === 'image' && l.visible && l.role === 'background') && <section className="layers-background" aria-label="Thumbnail background">
        <Color label="Background colour" value={s.doc.background} onChange={s.setBackground} />
      </section>}
      {hasOriginalUploads && <label className="layers-protect"><input type="checkbox" checked={s.lockOriginals} onChange={(e) => s.setLockOriginals(e.target.checked)} /><span><b>Protect original uploads</b><small>Keep source images safe from accidental edits.</small></span></label>}

      {layers.length === 0 ? (
        <p className="layers-empty">
          Your editable pieces will show up here. Add a title or image to start.
        </p>
      ) : (
        <>
        <ul className="grid gap-1 overflow-y-auto p-2" onDragLeave={() => setOverId(null)}>
          {layers
            .slice()
            .reverse()
            .map((l) => {
              const prot = s.isProtected(l);
              return (
                <li
                  key={l.id}
                  draggable={renaming !== l.id}
                  onDragStart={(e) => {
                    setDragId(l.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', l.id);
                  }}
                  onDragOver={(e) => {
                    if (dragId && dragId !== l.id) {
                      e.preventDefault();
                      setOverId(l.id);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dragId) s.reorder(dragId, layers.findIndex((x) => x.id === l.id));
                    setDragId(null);
                    setOverId(null);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  aria-current={sel?.id === l.id || s.selectionIds.includes(l.id)}
                  className={`layer-row ${overId === l.id ? 'is-over' : ''} ${dragId === l.id ? 'opacity-40' : ''} ${l.visible ? '' : 'is-hidden'}`}
                  // A plain click in the list picks that layer alone, dropping whatever else was selected with it.
                  onClick={(e) => { if (!e.shiftKey) s.select(null); s.select(l.id, e.shiftKey); }}
                >
                  <Chip layer={l} />
                  <span className="grid min-w-0 flex-1">
                    {renaming === l.id ? (
                      <input
                        autoFocus
                        className="finput px-1.5 py-0.5 text-[13px]"
                        defaultValue={l.name}
                        onBlur={(e) => {
                          const name = e.target.value.trim();
                          if (name && name !== l.name) s.update(l.id, { name });
                          setRenaming(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
                        }}
                      />
                    ) : (
                      <span
                        className="truncate text-[13px] text-ui-fg"
                        title={l.type === 'text' ? 'Double-click to edit the text' : 'Double-click to rename'}
                        onDoubleClick={() => (l.type === 'text' ? s.editText(l.id) : setRenaming(l.id))}
                      >
                        {label(l)}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-xs text-ui-dim">
                      {kind(l)}
                      {prot && (
                        <span className="flex items-center gap-0.5 text-warn" title="Source protected: cannot be deleted, replaced, mirrored, stretched or faded">
                          <ShieldCheck size={11} /> Protected
                        </span>
                      )}
                      {l.locked && (
                        <span className="flex items-center gap-0.5" title="Pinned: cannot be moved on the canvas">
                          <Lock size={10} /> Pinned
                        </span>
                      )}
                    </span>
                  </span>
                  <IconBtn
                    side="left"
                    tip={l.visible ? 'Hide layer' : 'Show layer'}
                    className={l.visible ? '' : '!text-ui-fg'}
                    onClick={(e) => {
                      e.stopPropagation();
                      s.update(l.id, { visible: !l.visible });
                    }}
                  >
                    {l.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </IconBtn>
                  <IconBtn
                    side="left"
                    tip={l.locked ? 'Unpin (allow moving)' : 'Pin in place (lock position)'}
                    aria-pressed={l.locked}
                    className={l.locked ? '!text-warn' : ''}
                    onClick={(e) => {
                      e.stopPropagation();
                      s.update(l.id, { locked: !l.locked });
                    }}
                  >
                    {l.locked ? <Lock size={14} /> : <LockOpen size={14} />}
                  </IconBtn>
                </li>
              );
            })}
        </ul>
        </>
      )}
    </div>
  );
}
