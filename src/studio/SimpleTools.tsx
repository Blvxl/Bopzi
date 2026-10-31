'use client';

import { Eraser, Group, MousePointer2, Search, Shapes, Sticker, Sun, Ungroup, FlipHorizontal2, RefreshCw, Type, Layers, ChevronUp, ChevronDown, Copy, Trash2, Lock, Unlock, X, Pencil } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ACCEPT_ATTR } from '@/lib/assets';
import { EDITOR_FONTS, fontOf } from '@/lib/fonts';
import { useStudio } from './context';
import { LIGHT_PRESETS, TEXT_PRESETS } from './factory';
import { KIT, type KitItem } from './kit';
import KitThumb from './KitThumb';
import { ARROWS, RAINBOW } from './callouts';
import { Color, Num } from './controls';
import LayersPanel from './LayersPanel';
import Inspector, { NO_OUTLINE } from './Inspector';

/** What the side panel shows. Edit is the default: the selected object's settings, or the canvas's. */
export type Tool = 'text' | 'kit' | 'light' | 'layers' | 'properties';
const TOOLS = [
  { id: null, label: 'Edit', icon: MousePointer2, key: 'V' },
  { id: 'text', label: 'Text', icon: Type, key: 'T' },
  { id: 'kit', label: 'Kit', icon: Shapes, key: 'K' },
  { id: 'light', label: 'Light', icon: Sun, key: 'L' },
  { id: 'layers', label: 'Layers', icon: Layers, key: '' },
] as const;
/** Single keys that switch the panel, as in other design tools. */
export const TOOL_KEYS: Record<string, Tool | null> = { v: null, t: 'text', k: 'kit', l: 'light' };
const TITLES: Record<Tool, string> = { text: 'Text', kit: 'Kit', light: 'Light', layers: 'Layers', properties: 'Properties' };

function KitCard({ item, fontsVersion, onAdd }: { item: KitItem; fontsVersion: number; onAdd: () => void }) {
  return (
    <button type="button" className="kit-card" aria-label={`Add ${item.label.toLowerCase()}`} onClick={onAdd}>
      <span className="kit-preview" aria-hidden="true"><KitThumb item={item} fontsVersion={fontsVersion} /></span>
      <small>{item.label}</small>
    </button>
  );
}

const RECENT_KEY = 'bopzi:kit-recent';
const RECENT_MAX = 6;
const HIDDEN_KIT_ITEMS = new Set(['gain', 'multiplier']);
const VISIBLE_KIT = KIT.filter((item) => item.group !== 'Badges' && !HIDDEN_KIT_ITEMS.has(item.id));
const KIT_GROUPS = [...new Set(VISIBLE_KIT.map((k) => k.group))];

/** The manual tools as one labelled segmented control in the top bar. Each one picks what the side panel shows. */
export function ToolSwitch({ tool, onTool }: { tool: Tool | null; onTool: (tool: Tool | null) => void }) {
  const current = tool === 'properties' ? null : tool;
  return (
    <div className="tool-switch" role="radiogroup" aria-label="Tools">
      {TOOLS.map(t => (
        <button key={t.label} type="button" role="radio" aria-checked={current === t.id} title={t.key ? `${t.label}  (${t.key})` : t.label} onClick={() => onTool(t.id)}>
          <t.icon size={15} aria-hidden="true" /><span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/** What the selection is called in the panel heading. */
function kindOf(s: ReturnType<typeof useStudio>) {
  const l = s.selected;
  if (!l) return s.isIcon ? 'Icon' : 'Thumbnail';
  if (s.selectionIds.length > 1) return l.groupId ? 'Group' : `${s.selectionIds.length} layers`;
  return l.type === 'text' ? 'Text' : l.type === 'light' ? 'Light' : l.type === 'shape' ? 'Shape' : l.type === 'image' && l.arrow ? 'Arrow' : l.type === 'image' && l.role === 'background' ? 'Image' : 'Character';
}

/** The docked side panel: the open tool, or by default the quick actions and settings of what is selected. */
export function ToolPanel({ tool, onClose }: { tool: Tool | null; onClose: () => void }) {
  const s = useStudio();
  const editing = !tool || tool === 'properties';
  return (
    <aside className="studio-panel" aria-label={editing ? 'Settings' : TITLES[tool]}>
      <header>
        <h2>{editing ? kindOf(s) : TITLES[tool]}</h2>
        {!editing && <button type="button" className="studio-panel-done" onClick={onClose}>Done</button>}
      </header>
      <div className="studio-panel-body tool-drawer-body">
        {editing ? (s.doc.layers.length && !s.selected ? <LayersPanel /> : <>
          {s.selected && <SelectionTools />}
          <Inspector />
        </>) : <ToolBody tool={tool} />}
      </div>
    </aside>
  );
}

/** The contents of a manual tool. */
function ToolBody({ tool }: { tool: Tool }) {
  const s = useStudio();
  const text = s.selected?.type === 'text' ? s.selected : undefined;

  // ---- the kit: a search over everything in it, and the pieces used last, kept between visits
  const [kitQuery, setKitQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => { try { const saved: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); if (Array.isArray(saved)) setRecent(saved.filter((id): id is string => typeof id === 'string')); } catch { /* starts empty */ } }, []);
  const addPiece = (id: string) => {
    s.addKit(id);
    const next = [id, ...recent.filter(x => x !== id)].slice(0, RECENT_MAX);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* remembered for this visit only */ }
  };
  const recentPieces = recent.flatMap(id => VISIBLE_KIT.filter(k => k.id === id));
  const words = kitQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (name: string, group: string) => words.every(w => `${name} ${group}`.toLowerCase().includes(w));
  const found = words.length ? VISIBLE_KIT.filter(k => matches(k.label, k.group)) : null;
  // Opening Text with a title already on the canvas goes straight to editing it.
  useEffect(() => { if (tool === 'text' && text?.type === 'text' && s.selected?.id !== text.id) s.select(text.id); }, [tool]);

  return (
    <>
        {tool === 'text' && <>
          {text?.type === 'text' && <div className="title-controls">
            <label className="grid gap-2">Text<textarea ref={s.textInputRef} className="finput" rows={3} onFocus={() => s.select(text.id)} value={text.text} onChange={e => s.update(text.id, { text: e.target.value }, `${text.id}:text`)} /></label>
            <label className="grid gap-2">Font<select className="finput" value={text.font} onChange={e => s.update(text.id, { font: e.target.value })}>{EDITOR_FONTS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
            <Num label="Text size" min={24} max={400} value={text.fontSize} onChange={fontSize => s.update(text.id, { fontSize }, `${text.id}:size`)} />
            <Color label="Text colour" value={text.fill} onChange={fill => s.update(text.id, { fill })} />
            <label className="protect-toggle"><input type="checkbox" checked={!!text.fill2} onChange={e => s.update(text.id, { fill2: e.target.checked ? '#FF9D1C' : undefined })} /> Fade to a second colour</label>
            {text.fill2 && <Color label="Bottom colour" value={text.fill2} onChange={fill2 => s.update(text.id, { fill2 })} />}
          </div>}
          <button className="ebtn w-full" onClick={() => s.addText()}><Type size={16} /> Add text</button>
          <div className="preset-heading"><h3 className="tool-subheading">Text styles</h3><p>{text ? 'Choose a look for this title.' : 'Pick a look to add a title.'}</p></div>
          <div className="type-cards">{TEXT_PRESETS.map(p => <button key={p.id} aria-label={`${text ? 'Apply' : 'Add'} ${p.label} text style`} onClick={() => text ? s.update(text.id, p.props) : s.addText(p)}><span style={{ fontFamily: fontOf(p.props.font ?? 'luckiest').family, color: p.props.fill, textShadow: '0 2px 0 #000' }}>{p.sample}</span><small>{p.label}</small></button>)}</div>
        </>}
        {tool === 'kit' && <>
          <label className="kit-search">
            <Search size={14} aria-hidden="true" />
            <input type="search" aria-label="Search the kit" placeholder="Search pieces" value={kitQuery} onChange={e => setKitQuery(e.target.value)} />
            {kitQuery && <button type="button" aria-label="Clear search" onClick={() => setKitQuery('')}><X size={13} /></button>}
          </label>
          {found ? <>
            {/* Searching flattens the curated kit into one short results list. */}
            {found.length > 0 && <div className="kit-cards">{found.map(k => <KitCard key={k.id} item={k} fontsVersion={s.fontsVersion} onAdd={() => addPiece(k.id)} />)}</div>}
            {!found.length && <p className="tool-note">No matching pieces. Try “button”, “arrow” or “title”.</p>}
          </> : <>
            {recentPieces.length > 0 && <div className="kit-group">
              <h3 className="tool-subheading">Recently used</h3>
              <div className="kit-cards">{recentPieces.map(k => <KitCard key={k.id} item={k} fontsVersion={s.fontsVersion} onAdd={() => addPiece(k.id)} />)}</div>
            </div>}
            {s.saved.length > 0 && <>
              <h3 className="tool-subheading">My kit</h3>
              <div className="kit-saved">{s.saved.map(p => <span key={p.id}><button type="button" onClick={() => s.addSaved(p.id)}>{p.name}</button><button type="button" aria-label={`Remove ${p.name} from My kit`} title="Remove from My kit" onClick={() => s.removeSaved(p.id)}><X size={12} /></button></span>)}</div>
            </>}
            {KIT_GROUPS.map(g => <div key={g} className="kit-group">
              <h3 className="tool-subheading">{g}</h3>
              <div className="kit-cards">{VISIBLE_KIT.filter(k => k.group === g).map(k => <KitCard key={k.id} item={k} fontsVersion={s.fontsVersion} onAdd={() => addPiece(k.id)} />)}</div>
            </div>)}
          </>}
        </>}
        {tool === 'light' && <>
          <div className="light-cards">{LIGHT_PRESETS.map(p => <button key={p.id} onClick={() => s.addLight(p)}><i style={{ background: p.color === '#000000' ? 'radial-gradient(closest-side, #000, transparent)' : `radial-gradient(closest-side, ${p.color}, transparent)` }} /><span>{p.label}<small>{p.hint}</small></span></button>)}</div>
          <p className="tool-note">A light is a soft glow you can move, stretch and recolour. Put it behind a character for a rim light, or use Shade to darken a corner.</p>
        </>}
        {tool === 'layers' && <LayersPanel />}
    </>
  );
}

const SHAPE_FILLS = ['#FFFFFF', '#111111', '#FF4A3D', '#FFD95A', '#6BFF86', '#4C9BFF'];
const TEXT_FILLS = [
  { id: 'white', label: 'White', swatch: '#FFFFFF', patch: { fill: '#FFFFFF', fill2: undefined, fillStops: undefined } },
  { id: 'warm', label: 'Yellow to orange', swatch: 'linear-gradient(#FFF04A, #FF9D1C)', patch: { fill: '#FFF04A', fill2: '#FF9D1C', fillStops: undefined } },
  { id: 'rainbow', label: 'Rainbow', swatch: `linear-gradient(90deg, ${RAINBOW.join(', ')})`, patch: { fill: '#FFFFFF', fill2: undefined, fillStops: RAINBOW } },
];

/**
 * The quick actions for what is selected, at the top of the side panel, with what you would reach for next:
 * for text its font, size and colour; for an arrow its colour and direction; for an image, replacing and flipping it.
 * The detailed settings follow below it in the panel.
 */
export function SelectionTools() {
  const s = useStudio(), l = s.selected;
  const file = useRef<HTMLInputElement>(null);
  if (!l) return null;
  const index = s.doc.layers.findIndex(x => x.id === l.id);
  const arrow = l.type === 'image' ? l.arrow : undefined;
  const many = s.selectionIds.length > 1;
  // A group moves through the stack as one, so it is its top and bottom layers that can run out of room.
  const places = s.selectionIds.map(id => s.doc.layers.findIndex(x => x.id === id));
  const topmost = many ? Math.max(...places) : index, lowest = many ? Math.min(...places) : index;
  const kind = many ? (l.groupId ? 'Group' : `${s.selectionIds.length} layers`) : l.type === 'text' ? 'Text' : l.type === 'light' ? 'Light' : l.type === 'shape' ? 'Shape' : arrow ? 'Arrow' : l.role === 'background' ? 'Image' : 'Character';
  const fill = l.type === 'text' ? (l.fillStops?.length ? 'rainbow' : l.fill2 ? 'warm' : l.fill.toUpperCase() === '#FFFFFF' ? 'white' : '') : '';
  return (
    <div className="selection-tools" role="toolbar" aria-label={`${kind} actions`}>
      {l.type === 'text' && <>
        <button title="Type on the canvas" aria-label="Edit text" onClick={() => s.editText(l.id)}><Pencil size={15} /></button>
        <select className="sel-font" aria-label="Font" value={l.font} onChange={e => s.update(l.id, { font: e.target.value })}>{EDITOR_FONTS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select>
        <span className="sel-size" role="group" aria-label="Text size">
          <button aria-label="Smaller" onClick={() => s.update(l.id, { fontSize: Math.max(24, Math.round(l.fontSize * 0.9)), strokeWidth: Math.round(l.strokeWidth * 0.9 * 10) / 10 }, `${l.id}:size`)}>−</button>
          <b>{l.fontSize}</b>
          <button aria-label="Larger" onClick={() => s.update(l.id, { fontSize: Math.min(600, Math.round(l.fontSize * 1.1)), strokeWidth: Math.round(l.strokeWidth * 1.1 * 10) / 10 }, `${l.id}:size`)}>+</button>
        </span>
        <span className="sel-swatches" role="group" aria-label="Text colour">{TEXT_FILLS.map(f => <button key={f.id} title={f.label} aria-label={f.label} aria-pressed={fill === f.id} style={{ background: f.swatch }} onClick={() => s.update(l.id, f.patch)} />)}</span>
        <label className="sel-color" title="Custom text colour"><input type="color" aria-label="Custom text colour" value={l.fill} onChange={e => s.update(l.id, { fill: e.target.value, fill2: undefined, fillStops: undefined }, `${l.id}:color`)} /></label>
      </>}
      {arrow && <>
        <span className="sel-swatches" role="group" aria-label="Arrow colour">{ARROWS.map(a => <button key={a.id} title={a.label} aria-label={a.label} aria-pressed={arrow.color === a.color} style={{ background: a.color }} onClick={() => void s.recolorArrow(l.id, a.color)} />)}</span>
        <button title="Flip" aria-label="Flip the arrow" onClick={() => s.update(l.id, { flipX: !(l.type === 'image' && l.flipX) })}><FlipHorizontal2 size={15} /></button>
      </>}
      {l.type === 'image' && !arrow && <>
        <button title="Replace image" aria-label="Replace image" disabled={s.isProtected(l)} onClick={() => file.current?.click()}><RefreshCw size={15} /></button>
        <button title="Flip" aria-label="Flip the image" onClick={() => s.update(l.id, { flipX: !l.flipX })}><FlipHorizontal2 size={15} /></button>
        <button title="Outline" aria-label="Outline" aria-pressed={!!l.outline?.enabled} onClick={() => s.update(l.id, { outline: { ...(l.outline ?? NO_OUTLINE), enabled: !l.outline?.enabled } })}><Sticker size={15} /></button>
        <button title={s.cutting === l.id ? s.cutStatus : 'Remove background'} aria-label="Remove background" aria-busy={s.cutting === l.id} disabled={!!s.cutting} onClick={() => void s.cutout(l.id)}>{s.cutting === l.id ? <i className="spinner" /> : <Eraser size={15} />}</button>
        <input ref={file} type="file" hidden accept={ACCEPT_ATTR} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void s.replaceImage(l.id, f); }} />
      </>}
      {l.type === 'shape' && <>
        <span className="sel-swatches" role="group" aria-label="Shape colour">{SHAPE_FILLS.map(f => <button key={f} title={f} aria-label={`Fill ${f}`} aria-pressed={l.fill.toUpperCase() === f && !l.fill2} style={{ background: f }} onClick={() => s.update(l.id, { fill: f, fill2: undefined })} />)}</span>
        <button title="Flip" aria-label="Flip the shape" onClick={() => s.update(l.id, { flipX: !l.flipX })}><FlipHorizontal2 size={15} /></button>
        <label className="sel-color" title="Custom fill colour"><input type="color" aria-label="Custom fill colour" value={/^#[0-9a-f]{6}$/i.test(l.fill) ? l.fill : '#ffffff'} onChange={e => s.update(l.id, { fill: e.target.value, fill2: undefined }, `${l.id}:color`)} /></label>
      </>}
      {many && !l.groupId && <button title="Group  (Ctrl G)" aria-label="Group" onClick={s.group}><Group size={15} /></button>}
      {l.groupId && <button title="Ungroup  (Ctrl Shift G)" aria-label="Ungroup" onClick={s.ungroup}><Ungroup size={15} /></button>}
      <button title="Move forward" aria-label="Move forward" disabled={topmost === s.doc.layers.length - 1} onClick={() => s.reorder(l.id, index + 1)}><ChevronUp size={15} /></button>
      <button title="Move backward" aria-label="Move backward" disabled={lowest === 0} onClick={() => s.reorder(l.id, index - 1)}><ChevronDown size={15} /></button>
      <button title={l.locked ? 'Unlock position' : 'Lock position'} aria-label={l.locked ? 'Unlock position' : 'Lock position'} onClick={() => s.update(l.id, { locked: !l.locked })}>{l.locked ? <Lock size={15} /> : <Unlock size={15} />}</button>
      <button title="Duplicate" aria-label="Duplicate object" onClick={() => s.duplicate(l.id)}><Copy size={15} /></button>
      <button title={s.isProtected(l) ? 'Original is protected' : 'Delete'} aria-label="Delete object" disabled={s.isProtected(l)} onClick={() => s.remove(l.id)}><Trash2 size={15} /></button>
    </div>
  );
}
