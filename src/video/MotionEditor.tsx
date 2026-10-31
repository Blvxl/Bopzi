'use client';
import { useState } from 'react';
import { Diamond, Plus, Trash2 } from 'lucide-react';
import { IDENTITY, transformAt, type Keyframe, type Transform } from './clip-motion';
import EasingPicker from './EasingPicker';

const PROPERTIES: { key: keyof Transform; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'scale', label: 'Scale', min: .1, max: 5, step: .01, unit: '×' },
  { key: 'x', label: 'Horizontal offset', min: -1, max: 1, step: .01, unit: '' },
  { key: 'y', label: 'Vertical offset', min: -1, max: 1, step: .01, unit: '' },
  { key: 'rotation', label: 'Rotation', min: -360, max: 360, step: 1, unit: '°' },
  { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: .01, unit: '' },
];
export default function MotionEditor({ frames = [], length, localTime, disabled, onChange, onSeek }: { frames?: Keyframe[]; length: number; localTime: number; disabled: boolean; onChange: (frames: Keyframe[]) => void; onSeek: (time: number) => void }) {
  const [active, setActive] = useState(0), [property, setProperty] = useState<keyof Transform>('scale'), [draft, setDraft] = useState<Keyframe[] | null>(null);
  const keys = draft ?? frames, index = Math.min(active, Math.max(0, keys.length - 1)), current = keys[index], config = PROPERTIES.find(p => p.key === property)!;
  const update = (patch: Partial<Keyframe>) => { const next = frames.map((k, i) => i === index ? { ...k, ...patch } : k).sort((a, b) => a.time - b.time); if (next.some((k, i) => i && k.time - next[i - 1].time < .001)) return; onChange(next); };
  const graphY = (value: number) => 100 - (value - config.min) / (config.max - config.min) * 88;
  const drag = (e: React.PointerEvent<SVGCircleElement>, at: number) => {
    if (disabled) return; e.preventDefault(); const target = e.currentTarget, matrix = target.ownerSVGElement!.getScreenCTM()?.inverse(); if (!matrix) return; target.setPointerCapture(e.pointerId); setActive(at); let last = frames;
    const move = (ev: PointerEvent) => { const point = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(matrix), min = at ? frames[at - 1].time + .01 : 0, max = at < frames.length - 1 ? frames[at + 1].time - .01 : length; const time = Math.max(min, Math.min(max, Math.round((point.x - 12) / 296 * length * 30) / 30)); const value = Math.max(config.min, Math.min(config.max, config.min + (100 - point.y) / 88 * (config.max - config.min))); last = frames.map((k, i) => i === at ? { ...k, time, [property]: Math.round(value / config.step) * config.step } : k); setDraft(last); };
    const finish = (ev: PointerEvent) => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', finish); target.removeEventListener('pointercancel', finish); setDraft(null); if (ev.type !== 'pointercancel' && last !== frames && !last.some((k, i) => i && k.time <= last[i - 1].time)) { onChange(last); onSeek(last[at].time); } };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', finish, { once: true }); target.addEventListener('pointercancel', finish, { once: true });
  };
  const plot = Array.from({ length: 101 }, (_, i) => { const time = i / 100 * length; return `${12 + i * 2.96},${graphY(transformAt(keys, time)[property])}`; }).join(' ');
  return <details className="ve-work-section" open={frames.length > 0}><summary><Diamond size={14}/>Motion keyframes<span>{frames.length || 'Add motion'}</span></summary><fieldset disabled={disabled} className="ve-fields">
    <p className="ve-work-hint">Animate relative to the layer’s normal position. The last point holds until the layer ends.</p>
    <button className="ebtn" type="button" onClick={() => { const at = Math.round(Math.max(0, Math.min(length, localTime)) * 30) / 30; const found = frames.findIndex(k => Math.abs(k.time - at) < .02); if (found >= 0) { setActive(found); return; } const next = [...frames, { ...transformAt(frames, at), time: at, easing: 'easeInOut' as const }, ...(!frames.length && at > .02 ? [{ ...IDENTITY, time: 0, easing: 'easeInOut' as const }] : [])].sort((a, b) => a.time - b.time); if (next.length <= 32) { onChange(next); setActive(next.findIndex(k => k.time === at)); } }} disabled={frames.length >= 32 || disabled}><Plus size={14}/>Keyframe at playhead</button>
    {current && <><select className="finput" aria-label="Graph property" value={property} onChange={e => setProperty(e.target.value as keyof Transform)}>{PROPERTIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
      <svg className="ve-motion-graph" viewBox="0 0 320 112" aria-label={`${config.label} keyframe graph`}><path d="M12 100H308M12 12V100" className="ve-graph-grid"/><polyline points={plot} fill="none" className="ve-graph-line"/><line x1={12 + Math.max(0, Math.min(1, localTime / length)) * 296} x2={12 + Math.max(0, Math.min(1, localTime / length)) * 296} y1={8} y2={104} className="ve-graph-playhead"/>{keys.map((k, i) => <circle key={i} cx={12 + k.time / length * 296} cy={graphY(k[property])} r={i === index ? 6 : 4.5} className={i === index ? 'is-active' : ''} onPointerDown={e => drag(e, i)}/>)}</svg>
      <div className="ve-keyframe-list">{keys.map((k, i) => <button type="button" className={i === index ? 'is-active' : ''} key={i} onClick={() => { setActive(i); onSeek(k.time); }}><Diamond size={10}/>{k.time.toFixed(2)}s</button>)}</div>
      <Numeric key={`time-${index}-${current.time}`} label="Time in layer" value={current.time} min={index ? keys[index - 1].time + .01 : 0} max={index < keys.length - 1 ? keys[index + 1].time - .01 : length} step={1 / 30} onChange={time => { update({ time }); onSeek(time); }}/>
      <div className="ve-work-numbers">{PROPERTIES.map(p => <Numeric key={`${p.key}-${index}-${current[p.key]}`} label={p.label + p.unit} value={current[p.key]} min={p.min} max={p.max} step={p.step} onChange={v => update({ [p.key]: v })}/>)}</div>
      {index < keys.length - 1 && <EasingPicker value={current.easing} curve={current.curve} disabled={disabled} onChange={(easing, curve) => update({ easing, curve })}/>}
      <button className="ebtn" type="button" onClick={() => { onChange(frames.filter((_, i) => i !== index)); setActive(Math.max(0, index - 1)); }}><Trash2 size={13}/>Delete keyframe</button>
    </>}
  </fieldset></details>;
}
export function Numeric({ label, value, min, max, step = .1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(4))));
  return <label className="ve-field">{label}<input className="finput" type="number" aria-label={label} min={min} max={max} step={step} value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { const v = Number(draft); if (draft && Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v))); else setDraft(String(value)); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/></label>;
}
