'use client';
import { useRef } from 'react';
import { snapTime } from './editing';

export default function TimingEditor({ start, duration, countDelay, countDuration, total, anchors, disabled, onChange }: { start: number; duration: number; countDelay?: number; countDuration?: number; total: number; anchors: number[]; disabled: boolean; onChange: (patch: Record<string, number>) => void }) {
  const bar = useRef<HTMLDivElement>(null), length = Math.max(total, start + duration, .1);
  const drag = (e: React.PointerEvent<HTMLButtonElement>, kind: 'start' | 'end' | 'countStart' | 'countEnd') => {
    if (disabled || !bar.current) return; e.preventDefault(); const rect = bar.current.getBoundingClientRect(), target = e.currentTarget; target.setPointerCapture(e.pointerId); const originalLeft = target.style.left; let value: Record<string, number> = {};
    const calculate = (clientX: number) => { const t = Math.min(length, snapTime((clientX - rect.left) / rect.width * length, anchors, rect.width / length));
      value = kind === 'start' ? { start: Math.min(t, start + duration - .1), duration: start + duration - Math.min(t, start + duration - .1) }
        : kind === 'end' ? { duration: Math.max(.1, t - start) }
        : kind === 'countStart' ? { countDelay: Math.max(0, Math.min(t - start, duration - .01)), countDuration: Math.max(.01, Math.min(duration, (countDelay ?? 0) + (countDuration ?? duration)) - Math.max(0, Math.min(t - start, duration - .01))) }
        : { countDuration: Math.max(.01, Math.min(duration - (countDelay ?? 0), t - start - (countDelay ?? 0))) };
      target.style.left = `${t / length * 100}%`; };
    const move = (ev: PointerEvent) => calculate(ev.clientX);
    const clean = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', cancel); };
    const cancel = () => { clean(); target.style.left = originalLeft; };
    const up = () => { clean(); target.style.left = originalLeft; if (Object.keys(value).length) onChange(value); };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up, { once: true }); target.addEventListener('pointercancel', cancel, { once: true });
  };
  const handle = (label: string, value: number, kind: 'start' | 'end' | 'countStart' | 'countEnd') => <button type="button" className={`ve-time-handle is-${kind}`} style={{ left: `${value / length * 100}%` }} aria-label={label} title={`${label}: ${value.toFixed(2)}s — drag or use arrow keys`} disabled={disabled} onPointerDown={e => drag(e, kind)} onKeyDown={e => { if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); const delta = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / 30); if (kind === 'start') { const next = Math.max(0, Math.min(start + duration - .1, start + delta)); onChange({ start: next, duration: start + duration - next }); } else if (kind === 'end') onChange({ duration: Math.max(.1, Math.min(length - start, duration + delta)) }); else if (kind === 'countStart') onChange({ countDelay: Math.max(0, Math.min(duration - .01, (countDelay ?? 0) + delta)) }); else onChange({ countDuration: Math.max(.01, Math.min(duration - (countDelay ?? 0), (countDuration ?? duration) + delta)) }); }}>◆</button>;
  return <div className="ve-timing"><b>Animation timing</b><p className="tool-note">White handles: visibility. Gold: counting. Snaps to playhead and clip edges.</p><div className="ve-timing-bar" ref={bar}><span style={{ left: `${start / length * 100}%`, width: `${duration / length * 100}%` }}/>{countDuration !== undefined && <i style={{ left: `${(start + (countDelay ?? 0)) / length * 100}%`, width: `${Math.min(countDuration, duration - (countDelay ?? 0)) / length * 100}%` }}/>} {handle('Layer starts', start, 'start')}{handle('Layer ends', start + duration, 'end')}{countDuration !== undefined && <>{handle('Counting starts', start + (countDelay ?? 0), 'countStart')}{handle('Counting finishes', start + (countDelay ?? 0) + countDuration, 'countEnd')}</>}</div><small>{start.toFixed(2)}s → {(start + duration).toFixed(2)}s</small></div>;
}
