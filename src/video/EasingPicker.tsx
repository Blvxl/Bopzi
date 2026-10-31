'use client';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_BEZIER, EASINGS, easeAt, type Bezier, type Easing } from './easing';

export default function EasingPicker({ value, curve, counter = false, hold = true, disabled = false, onChange }: { value: Easing; curve?: Bezier; counter?: boolean; hold?: boolean; disabled?: boolean; onChange: (easing: Easing, curve?: Bezier) => void }) {
  const custom = curve ?? DEFAULT_BEZIER, preset = EASINGS.find(e => e.id === value)!;
  const [demo, setDemo] = useState(0), graph = useRef<SVGSVGElement>(null);
  const available = EASINGS.filter(e => !counter || !('overshoot' in e));
  useEffect(() => { let frame = 0; const start = performance.now(); const reduce = window.matchMedia('(prefers-reduced-motion: reduce)'); if (reduce.matches) { setDemo(1); return; } const tick = (now: number) => { setDemo(Math.min(1, ((now - start) % 2400) / 1600)); frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame); }, [value, curve]);
  const path = (easing: Easing, width: number, height: number, pad: number) => Array.from({ length: 81 }, (_, i) => `${i ? 'L' : 'M'}${(pad + i / 80 * width).toFixed(2)},${(pad + height * (1.5 - easeAt(easing, i / 80, custom, counter)) / 1.5).toFixed(2)}`).join(' ');
  const updateControl = (index: number, next: number) => { if (disabled) return; const result: Bezier = [...custom]; result[index] = Math.max(0, Math.min(index % 2 ? counter ? 1 : 1.5 : 1, next)); if (counter && index === 1) result[3] = Math.max(result[3], result[1]); if (counter && index === 3) result[1] = Math.min(result[1], result[3]); onChange('custom', result); };
  const drag = (event: React.PointerEvent<SVGCircleElement>, control: 0 | 1) => {
    if (disabled || !graph.current) return; event.preventDefault(); const target = event.currentTarget, rect = graph.current.getBoundingClientRect(), initial: Bezier = [...custom]; let next = initial;
    target.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => { next = [...initial]; next[control * 2] = Math.max(0, Math.min(1, ((e.clientX - rect.left) / rect.width * 240 - 16) / 208)); next[control * 2 + 1] = Math.max(0, Math.min(counter ? 1 : 1.5, 1.5 * (1 - (((e.clientY - rect.top) / rect.height * 150 - 12) / 126)))); if (counter) { if (control === 0) next[3] = Math.max(next[3], next[1]); else next[1] = Math.min(next[1], next[3]); } target.setAttribute('cx', String(16 + next[control * 2] * 208)); target.setAttribute('cy', String(12 + (1.5 - next[control * 2 + 1]) / 1.5 * 126)); };
    const clean = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', cancel); };
    const restore = () => { target.setAttribute('cx', String(16 + initial[control * 2] * 208)); target.setAttribute('cy', String(12 + (1.5 - initial[control * 2 + 1]) / 1.5 * 126)); };
    const up = () => { clean(); restore(); if (next !== initial) onChange('custom', next); };
    const cancel = () => { clean(); restore(); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up, { once: true }); target.addEventListener('pointercancel', cancel, { once: true });
  };
  return <fieldset className="ve-easing" disabled={disabled}>
    <legend>{counter ? 'Counting easing' : 'Zoom easing'}</legend>
    <div className="ve-easing-hero"><div><b>{preset.label}</b><small>{preset.hint}</small></div><svg ref={graph} viewBox="0 0 240 150" role={value === 'custom' ? 'group' : 'img'} aria-label={`${preset.label} easing graph: time horizontally, progress vertically`}>
      <path d="M16 12V138H224 M16 54H224 M16 96H224 M120 12V138 M224 12V138" className="ve-easing-grid"/>
      <path d={path(value, 208, 126, 12).replace(/(M|L)([\d.]+),/g, (_, op, x) => `${op}${Number(x) + 4},`)} className="ve-easing-curve"/>
      {value === 'custom' && <><path d={`M16 138L${16 + custom[0] * 208} ${12 + (1.5 - custom[1]) / 1.5 * 126} M224 54L${16 + custom[2] * 208} ${12 + (1.5 - custom[3]) / 1.5 * 126}`} className="ve-easing-tangent"/>{([0, 1] as const).map(control => <circle key={control} cx={16 + custom[control * 2] * 208} cy={12 + (1.5 - custom[control * 2 + 1]) / 1.5 * 126} r="6" className="ve-easing-handle" role="slider" tabIndex={disabled ? -1 : 0} aria-label={`Bézier control ${control + 1}`} aria-valuemin={0} aria-valuemax={1} aria-valuenow={custom[control * 2]} aria-valuetext={`X ${custom[control * 2].toFixed(2)}, Y ${custom[control * 2 + 1].toFixed(2)}`} onPointerDown={e => drag(e, control)} onKeyDown={e => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return; e.preventDefault(); const index = control * 2 + (e.key === 'ArrowUp' || e.key === 'ArrowDown' ? 1 : 0); updateControl(index, custom[index] + (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -.02 : .02)); }}/>)}</>}
      <circle cx={16 + demo * 208} cy={12 + (1.5 - easeAt(value, demo, custom, counter)) / 1.5 * 126} r="4" className="ve-easing-dot"/>
      <text x="16" y="149">0</text><text x="203" y="149">100%</text><text x="3" y="55">1</text>
    </svg><div className="ve-easing-demo" aria-hidden><i style={{ left: `${Math.min(1.4, Math.max(0, easeAt(value, demo, custom, counter))) / 1.4 * 100}%` }}/></div></div>
    <div className="ve-easing-options" role="radiogroup" aria-label={counter ? 'Counter easing styles' : 'Zoom easing styles'}>{available.map(e => <button type="button" key={e.id} role="radio" aria-checked={value === e.id} aria-label={`${e.label} easing`} title={e.hint} onClick={() => onChange(e.id, e.id === 'custom' ? custom : curve)}><svg viewBox="0 0 64 46" aria-hidden><path d={path(e.id, 52, 34, 6)}/></svg><span>{e.label}</span></button>)}</div>
    {value === 'custom' && <div className="ve-bezier-values">{['X1', 'Y1', 'X2', 'Y2'].map((label, index) => <label key={label}>{label}<Coordinate label={`Bézier ${label}`} value={custom[index]} max={index % 2 ? counter ? 1 : 1.5 : 1} onChange={n => updateControl(index, n)}/></label>)}</div>}
    <p className="tool-note">{counter ? 'Value stays between From and To. Use the separate bounce switch for a reward pop.' : hold ? 'The curve shapes the move from the current framing; the zoom then stays until the next "ease in and stay" zoom. Use a 1× one to ease back out.' : 'The curve shapes the push-in; this punch then returns to the original framing.'}</p>
  </fieldset>;
}

function Coordinate({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(3))));
  useEffect(() => setDraft(String(Number(value.toFixed(3)))), [value]);
  return <input type="number" aria-label={label} min={0} max={max} step=".01" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { const n = Number(draft); if (draft.trim() && Number.isFinite(n)) onChange(n); else setDraft(String(Number(value.toFixed(3)))); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/>;
}
