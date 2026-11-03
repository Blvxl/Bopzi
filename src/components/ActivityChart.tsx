'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';

export type Snapshot = { ts: string; players: number; games: number };
/** What the cursor is over. `estimated` is true between two snapshots, where the value is read off the curve. */
export type Scrub = Snapshot & { estimated: boolean };
export const RANGES = ['1D', '1W', '1M', '1Y', 'All'] as const;
export type Range = typeof RANGES[number];

const DURATIONS: Record<Exclude<Range, 'All'>, number> = { '1D': 864e5, '1W': 6048e5, '1M': 2592e6, '1Y': 31536e6 };
const PAD = { top: 38, bottom: 22, right: 16 };
const ACCENT = '#ff941f';
/** How often the header number is told where the cursor is, in ms. */
const REPORT_EVERY = 66;
/** How long a new point takes to glide into place, in ms. */
const GLIDE_MS = 900;
/** How fast the cursor catches up with the pointer each frame (1 = instantly). */
const FOLLOW = 0.4;

/** The snapshots inside a range. A range longer than the data shrinks to the data, so the line always fills the width. */
export function pointsFor(history: Snapshot[], range: Range) {
  if (!history.length) return [];
  const end = new Date(history[history.length - 1].ts).getTime();
  const start = range === 'All' ? -Infinity : end - DURATIONS[range];
  return history.filter((s) => new Date(s.ts).getTime() >= start);
}

const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const peakTime = (ts: string, range: Range) => new Date(ts).toLocaleString(undefined, range === '1D' ? { hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric' });

type P = { t: number; v: number; s: Snapshot };
type Run = { xs: number[]; ys: number[]; m: number[] };

/** Long ranges hold thousands of snapshots; one average per pixel pair is all the eye can use. */
function thin(points: P[], target: number): P[] {
  if (points.length <= target) return points;
  const size = points.length / target;
  const out: P[] = [];
  for (let i = 0; i < target; i++) {
    const part = points.slice(Math.floor(i * size), Math.max(Math.floor((i + 1) * size), Math.floor(i * size) + 1));
    const v = part.reduce((a, p) => a + p.v, 0) / part.length;
    const mid = part[Math.floor(part.length / 2)];
    out.push({ t: mid.t, v, s: { ...mid.s, players: Math.round(v) } });
  }
  out.push(points[points.length - 1]);
  return out;
}

/**
 * Slopes for a monotone cubic curve (Fritsch-Carlson): it bends like a hand-drawn line but never overshoots a peak
 * or a valley, so the curve cannot show a value that was not recorded.
 */
function slopes(xs: number[], ys: number[]) {
  const n = xs.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1e-6));
  const m = [d[0] ?? 0];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2] ?? 0);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = Math.hypot(a, b);
    if (h > 3) { m[i] = (3 * a / h) * d[i]; m[i + 1] = (3 * b / h) * d[i]; }
  }
  return m;
}

const pathOf = ({ xs, ys, m }: Run) => {
  let d = `M${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
  for (let i = 0; i < xs.length - 1; i++) {
    const k = (xs[i + 1] - xs[i]) / 3;
    d += `C${(xs[i] + k).toFixed(2)} ${(ys[i] + m[i] * k).toFixed(2)} ${(xs[i + 1] - k).toFixed(2)} ${(ys[i + 1] - m[i + 1] * k).toFixed(2)} ${xs[i + 1].toFixed(2)} ${ys[i + 1].toFixed(2)}`;
  }
  return d;
};

/** The height of the drawn curve at any x: the same cubic the path uses, so the cursor dot rides exactly on the line. */
function yAt(run: Run, x: number) {
  const { xs, ys, m } = run;
  let a = 0, b = xs.length - 1;
  if (b === 0) return ys[0];
  while (b - a > 1) { const mid = (a + b) >> 1; if (xs[mid] <= x) a = mid; else b = mid; }
  const h = xs[b] - xs[a], s = Math.min(Math.max((x - xs[a]) / h, 0), 1), s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * ys[a] + (s3 - 2 * s2 + s) * h * m[a] + (-2 * s3 + 3 * s2) * ys[b] + (s3 - s2) * h * m[b];
}

type Model = { pts: P[]; xy: { x: number; y: number }[]; runs: Run[]; paths: { line: string; area: string }[]; lo: number; hi: number; plotW: number; h: number; minY: number; peak: number };

export default function ActivityChart({ history, range, onScrub }: { history: Snapshot[]; range: Range; onScrub: (s: Scrub | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const watch = new ResizeObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const raw = useMemo(() => pointsFor(history, range).map((s): P => ({ t: new Date(s.ts).getTime(), v: s.players, s })), [history, range]);
  const { w, h } = size;
  const plotW = Math.max(w - PAD.right, 1);

  const model = useMemo<Model | null>(() => {
    if (!raw.length || !w) return null;
    const all = thin(raw, Math.max(Math.round(plotW / 2), 60));
    const pts = all;
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
    const pad = (hi - lo) * 0.2 || hi * 0.02 || 1;
    lo = Math.max(0, lo - pad); hi += pad;
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (h - PAD.top - PAD.bottom);
    // Connect recorded snapshots over their actual elapsed time; values between them are estimates.
    const span = pts[pts.length - 1].t - pts[0].t;
    const xy = pts.map((p) => ({ x: span === 0 ? plotW / 2 : ((p.t - pts[0].t) / span) * plotW, y: y(p.v) }));
    const groups = [pts.map((_, i) => i)];
    const floor = h - PAD.bottom;
    const runs = groups.map((g): Run => {
      const xs = g.map((i) => xy[i].x), ys = g.map((i) => xy[i].y);
      return { xs, ys, m: slopes(xs, ys) };
    });
    const paths = runs.map((r) => {
      const line = pathOf(r);
      return { line, area: r.xs.length > 1 ? `${line}L${r.xs[r.xs.length - 1].toFixed(2)} ${floor}L${r.xs[0].toFixed(2)} ${floor}Z` : '' };
    });
    let peak = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].v > pts[peak].v) peak = i;
    return { pts, xy, runs, paths, lo, hi, plotW, h, minY: Math.min(...xy.map((p) => p.y)), peak };
  }, [raw, w, h, plotW]);

  // The cursor is drawn by hand, once per frame, outside React: moving the mouse never re-renders the page.
  const cursor = useRef<SVGGElement>(null);
  const dot = useRef<SVGGElement>(null);
  const latest = useRef<SVGGElement>(null);
  const peakLabel = useRef<SVGGElement>(null);
  const veil = useRef<SVGRectElement>(null);
  const live = useRef({ target: null as number | null, x: 0, shown: false, raf: 0, key: '', sent: 0, timer: 0 as number, pending: null as Scrub | null });
  const modelRef = useRef(model);
  const report = useRef(onScrub);
  useEffect(() => { modelRef.current = model; report.current = onScrub; });

  const paint = useCallback((x: number, m: Model) => {
    // Find the curve under the pointer.
    let run = m.runs[0];
    for (const r of m.runs) { if (x >= r.xs[0]) run = r; }
    const cx = Math.min(Math.max(x, run.xs[0]), run.xs[run.xs.length - 1]);
    const y = yAt(run, cx);
    cursor.current?.style.setProperty('transform', `translateX(${cx}px)`);
    dot.current?.style.setProperty('transform', `translateY(${y}px)`);
    veil.current?.style.setProperty('transform', `translateX(${cx}px)`);
    // The reading: a recorded snapshot when the cursor is on one, otherwise the value on the curve at that moment.
    let near = 0;
    for (let i = 1; i < m.xy.length; i++) if (Math.abs(m.xy[i].x - cx) < Math.abs(m.xy[near].x - cx)) near = i;
    const estimated = Math.abs(m.xy[near].x - cx) > 0.75;
    const base = m.pts[near].s;
    const value = estimated ? Math.round(m.lo + (1 - (y - PAD.top) / (m.h - PAD.top - PAD.bottom)) * (m.hi - m.lo)) : base.players;
    // Between snapshots the moment is worked out along the segment the cursor is on.
    let a = near;
    if (m.xy[a].x > cx && a > 0) a--;
    const b = Math.min(a + 1, m.xy.length - 1);
    const f = m.xy[b].x > m.xy[a].x ? (cx - m.xy[a].x) / (m.xy[b].x - m.xy[a].x) : 0;
    const ts = new Date(estimated ? m.pts[a].t + f * (m.pts[b].t - m.pts[a].t) : new Date(base.ts).getTime()).toISOString();
    const key = `${ts.slice(0, 19)}|${value}`;
    if (key === live.current.key) return;
    live.current.key = key;
    // The number above the chart rolls over 450 ms; asking it to retarget on every frame is what made scrubbing heavy, so it is told about 15 times a second.
    const s = live.current;
    s.pending = { ts, players: value, games: base.games, estimated };
    const send = () => { s.timer = 0; s.sent = performance.now(); if (s.pending) report.current(s.pending); s.pending = null; };
    const wait = REPORT_EVERY - (performance.now() - s.sent);
    if (wait <= 0) send(); else if (!s.timer) s.timer = window.setTimeout(send, wait);
  }, []);

  const frame = useCallback(() => {
    const s = live.current, m = modelRef.current;
    s.raf = 0;
    if (!m || s.target === null) return;
    if (!s.shown) {
      s.shown = true;
      s.x = s.target;
      cursor.current?.style.setProperty('opacity', '1');
      latest.current?.style.setProperty('opacity', '0');
      peakLabel.current?.style.setProperty('opacity', '0');
      veil.current?.style.setProperty('opacity', '1');
      veil.current?.style.setProperty('transform', `translateX(${s.x}px)`);
    } else s.x += (s.target - s.x) * FOLLOW;
    const settled = Math.abs(s.target - s.x) < 0.05;
    if (settled) s.x = s.target;
    paint(s.x, m);
    if (!settled) s.raf = requestAnimationFrame(frame);
  }, [paint]);

  const leave = useCallback(() => {
    const s = live.current;
    s.target = null; s.shown = false; s.key = ''; s.pending = null;
    cancelAnimationFrame(s.raf); s.raf = 0;
    clearTimeout(s.timer); s.timer = 0;
    cursor.current?.style.setProperty('opacity', '0');
    latest.current?.style.setProperty('opacity', '1');
    peakLabel.current?.style.setProperty('opacity', '1');
    veil.current?.style.setProperty('opacity', '0');
    report.current(null);
  }, []);

  const move = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const m = modelRef.current;
    if (!m) return;
    const s = live.current;
    s.target = Math.min(Math.max(e.clientX - e.currentTarget.getBoundingClientRect().left, m.runs[0].xs[0]), m.runs[m.runs.length - 1].xs.at(-1) ?? 0);
    if (!s.raf) s.raf = requestAnimationFrame(frame);
  }, [frame]);

  // New data or a new size while the pointer rests on the chart: redraw the cursor on the new line.
  useEffect(() => {
    const s = live.current;
    if (model && s.target !== null) { s.key = ''; paint(s.x, model); }
  }, [model, paint]);
  useEffect(() => () => { cancelAnimationFrame(live.current.raf); clearTimeout(live.current.timer); }, []);
  useEffect(() => { leave(); }, [range, leave]);

  // A new point does not pop in: the line, the area and the end dot glide from where they were to where they now belong,
  // and the points already there ease aside as the time axis makes room. The paths are redrawn by hand, outside React.
  const shown = useRef<{ key: string; runs: { xs: number[]; ys: number[] }[]; end: { x: number; y: number } | null } | null>(null);
  const glide = useRef(0);
  useLayoutEffect(() => {
    cancelAnimationFrame(glide.current);
    if (!model) { shown.current = null; return; }
    const to = { key: `${range}|${w}|${h}`, runs: model.runs.map((r) => ({ xs: r.xs, ys: r.ys })), end: model.xy.at(-1) ?? null };
    const from = shown.current;
    // Gliding needs the same kind of picture before and after: same range and size, same breaks, at most one new point at the end of a run.
    const same = from && from.key === to.key && from.runs.length === to.runs.length && to.runs.every((r, i) => r.xs.length - from.runs[i].xs.length === 0 || r.xs.length - from.runs[i].xs.length === 1);
    if (!same || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { shown.current = to; return; }
    const start = from.runs.map((r, i) => {
      const grown = to.runs[i].xs.length > r.xs.length;
      return { xs: grown ? [...r.xs, r.xs.at(-1)!] : r.xs, ys: grown ? [...r.ys, r.ys.at(-1)!] : r.ys };
    });
    const floor = h - PAD.bottom;
    const root = box.current;
    const lines = to.runs.map((_, i) => root?.querySelector<SVGPathElement>(`path[data-line="${i}"]`) ?? null);
    const areas = to.runs.map((_, i) => root?.querySelector<SVGPathElement>(`path[data-area="${i}"]`) ?? null);
    const t0 = performance.now();
    const fromEnd = from.end ?? to.end;
    peakLabel.current?.style.setProperty('opacity', '0');
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / GLIDE_MS);
      const e = 1 - (1 - k) ** 4; // quick start, long soft landing
      const runs = to.runs.map((r, i) => ({ xs: r.xs.map((x, j) => start[i].xs[j] + (x - start[i].xs[j]) * e), ys: r.ys.map((y, j) => start[i].ys[j] + (y - start[i].ys[j]) * e) }));
      runs.forEach((r, i) => {
        const run: Run = { ...r, m: slopes(r.xs, r.ys) };
        const line = pathOf(run);
        lines[i]?.setAttribute('d', line);
        if (r.xs.length > 1) areas[i]?.setAttribute('d', `${line}L${r.xs.at(-1)!.toFixed(2)} ${floor}L${r.xs[0].toFixed(2)} ${floor}Z`);
      });
      if (to.end && fromEnd) latest.current?.style.setProperty('transform', `translate(${fromEnd.x + (to.end.x - fromEnd.x) * e}px, ${fromEnd.y + (to.end.y - fromEnd.y) * e}px)`);
      shown.current = { key: to.key, runs, end: to.end && fromEnd ? { x: fromEnd.x + (to.end.x - fromEnd.x) * e, y: fromEnd.y + (to.end.y - fromEnd.y) * e } : to.end };
      if (k < 1) glide.current = requestAnimationFrame(step);
      else { shown.current = to; if (!live.current.shown) peakLabel.current?.style.setProperty('opacity', '1'); }
    };
    // Show the starting picture before the browser paints, so the new shape never flashes at its final position first.
    step(t0);
    glide.current = requestAnimationFrame(step);
  }, [model, range, w, h]);
  useEffect(() => () => cancelAnimationFrame(glide.current), []);

  const last = model?.xy[model.xy.length - 1];
  // The highest point in view gets a label, like the peak marker above RoTerminal's line.
  const peak = model && model.pts.length > 2 ? { ...model.xy[model.peak], v: model.pts[model.peak].v, when: peakTime(model.pts[model.peak].s.ts, range) } : null;

  return (
    <div ref={box} className="smooth-chart" onPointerMove={move} onPointerDown={move} onPointerLeave={leave} onPointerCancel={leave}
      onPointerUp={(e) => { if (e.pointerType === 'touch') leave(); }}>
      <div className="chart-grid" />
      {model && w > 0 && (
        <svg width={w} height={h} className="smooth-svg" role="img" aria-label="Players in tracked games over time">
          <defs>
            <linearGradient id="sc-fill" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={model.minY} y2={h - PAD.bottom}>
              <stop offset="0" stopColor={ACCENT} stopOpacity=".3" />
              <stop offset=".4" stopColor={ACCENT} stopOpacity=".14" />
              <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="sc-edge-fade" x1="0" x2={Math.max(w * 0.05, 1)} y1="0" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#000" /><stop offset="1" stopColor="#fff" />
            </linearGradient>
            <mask id="sc-edge" maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}><rect width={w} height={h} fill="url(#sc-edge-fade)" /></mask>
          </defs>
          <g key={range} mask="url(#sc-edge)">
            {model.paths.map((p, i) => p.area && <path key={`a${i}`} data-area={i} d={p.area} fill="url(#sc-fill)" className="sc-area" />)}
            {model.paths.map((p, i) => <path key={`d${i}`} data-line={i} d={p.line} pathLength={1} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sc-line" />)}
          </g>
          {/* The part after the cursor dims, so the eye sees where "then" ends and "now" begins. Moving one rectangle is far cheaper than clipping the whole curve every frame. */}
          <rect ref={veil} className="sc-veil" x="0" y="0" width={w} height={h} />

          {last && (
            <g ref={latest} className="sc-fade" style={{ transform: `translate(${last.x}px, ${last.y}px)` }}>
              <circle r="6" fill="none" stroke={ACCENT} strokeWidth="1.5" className="sc-ring" />
              <circle r="4.5" fill={ACCENT} stroke="#0e0e0e" strokeWidth="2.5" />
            </g>
          )}
          {model.pts.length === 1 && last && <text x={last.x - 12} y={last.y - 14} textAnchor="end" className="sc-hint">Waiting for more snapshots</text>}
          <g ref={cursor} className="sc-cursor" opacity="0">
            <line y1={PAD.top - 12} y2={h - PAD.bottom + 8} stroke="#767678" strokeOpacity=".6" />
            <g ref={dot}>
              <circle r="10" fill={ACCENT} opacity=".2" />
              <circle r="5" fill={ACCENT} stroke="#0e0e0e" strokeWidth="3" />
            </g>
          </g>
        </svg>
      )}
      {!raw.length && <div className="chart-empty">No snapshots for this range yet.</div>}
    </div>
  );
}
