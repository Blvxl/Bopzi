'use client';

import { useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Side = 'top' | 'bottom' | 'left' | 'right';

/** Hover and focus tooltip. The label doubles as the accessible name. */
export function IconBtn({
  tip,
  side = 'bottom',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tip: string; side?: Side }) {
  return (
    <span className="tip" data-tip={tip} data-side={side}>
      <button type="button" aria-label={tip} className={`ibtn ${className}`} {...rest}>
        {children}
      </button>
    </span>
  );
}

export function Tip({ tip, side = 'bottom', children, block }: { tip: string; side?: Side; children: ReactNode; block?: boolean }) {
  return (
    <span className={`tip ${block ? 'block' : ''}`} data-tip={tip} data-side={side}>
      {children}
    </span>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-b border-ui-line px-3.5 py-3.5 last:border-b-0">
      <header className="flex h-6 items-center justify-between gap-2">
        <h3 className="plabel">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs text-ui-dim">
      {label}
      {children}
    </label>
  );
}

export function Num({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const shown = Math.round(value / step) * step;
  const set = (raw: string) => {
    const v = parseFloat(raw);
    if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
  };
  return (
    <div className={`grid gap-1 ${disabled ? 'opacity-40' : ''}`}>
      <div className="flex items-center justify-between gap-2 text-xs text-ui-dim">
        <span>{label}</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            aria-label={label}
            className="finput !min-h-6 w-[62px] px-1.5 py-0.5 text-right tabular-nums text-xs"
            value={Number(shown.toFixed(2))}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(e) => set(e.target.value)}
          />
          {unit && <span className="w-3 tabular-nums text-xs">{unit}</span>}
        </span>
      </div>
      <input
        type="range"
        aria-label={`${label} slider`}
        value={Math.min(max, Math.max(min, value))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => set(e.target.value)}
      />
    </div>
  );
}

const SWATCHES = ['#FFFFFF', '#111111', '#FF5A36', '#FFD95A', '#5BC2FF', '#FF8CA8', '#6BE36B', '#A56BFF'];

// Custom colours picked before, newest first, shared by every colour control and kept between visits.
const RECENT_KEY = 'bopzi:colors';
const RECENT_MAX = 5;
let recent: string[] | null = null;
const watchers = new Set<() => void>();
const NONE: string[] = [];
function readRecent() {
  if (recent) return recent;
  if (typeof localStorage === 'undefined') return NONE;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    recent = Array.isArray(saved) ? saved.filter((c): c is string => typeof c === 'string' && /^#[0-9A-F]{6}$/.test(c)).slice(0, RECENT_MAX) : [];
  } catch {
    recent = [];
  }
  return recent;
}
function remember(hex: string) {
  const colour = hex.toUpperCase();
  if (SWATCHES.includes(colour) || !/^#[0-9A-F]{6}$/.test(colour)) return;
  recent = [colour, ...readRecent().filter((c) => c !== colour)].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* kept for this visit only */ }
  watchers.forEach((w) => w());
}
const watch = (w: () => void) => { watchers.add(w); return () => { watchers.delete(w); }; };

export function Color({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (hex: string) => void }) {
  const picked = useSyncExternalStore(watch, readRecent, () => NONE);
  return (
    <div className={`grid gap-1.5 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
      <span className="text-xs text-ui-dim">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={`${label} ${hex}`}
            aria-pressed={value.toUpperCase() === hex}
            className="swatch"
            style={{ background: hex }}
            onClick={() => onChange(hex)}
          />
        ))}
        {picked.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={`${label} ${hex}, used before`}
            title={`${hex} · used before`}
            aria-pressed={value.toUpperCase() === hex}
            className="swatch is-recent"
            style={{ background: hex }}
            onClick={() => onChange(hex)}
          />
        ))}
        <label className="swatch relative grid cursor-pointer place-items-center overflow-hidden" title="Pick any colour" style={{ background: value }}>
          <span className="rounded-sm bg-black/55 px-0.5 tabular-nums text-[10px] leading-tight text-white">+</span>
          <input
            type="color"
            aria-label={`${label} custom colour`}
            className="absolute inset-0 cursor-pointer opacity-0"
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            // The picker reports every shade passed over; only the one settled on is worth remembering.
            // The browser's own "change" fires when the picker closes, which React's onChange does not tell apart.
            ref={(el) => {
              if (!el) return;
              const settle = () => remember(el.value);
              el.addEventListener('change', settle);
              return () => el.removeEventListener('change', settle);
            }}
            onBlur={(e) => remember(e.target.value)}
          />
        </label>
        <span className="ml-auto tabular-nums text-xs text-ui-dim">{value.toUpperCase()}</span>
      </div>
    </div>
  );
}

export function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; tip?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex h-8 rounded-lg border border-ui-line bg-char p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.tip}
          aria-label={o.tip}
          aria-pressed={value === o.value}
          className="grid h-full flex-1 place-items-center rounded-md text-xs text-ui-dim hover:text-ui-fg aria-pressed:bg-ui-3 aria-pressed:text-ui-fg"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
