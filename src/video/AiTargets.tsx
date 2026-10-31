'use client';
import { useLayoutEffect, useState } from 'react';
import type { Timeline } from './model';

/** A spot the AI just aimed at, as shares (0–1) of the frame: x/y its centre, w/h its size. */
export type AiTarget = { id: string; x: number; y: number; w: number; h: number; label: string };

const LABELS: Record<string, string> = { zoom: 'Zoom', highlight: 'Highlight', blur: 'Blur' };
const share = (v: unknown, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

/** New or moved zooms, highlights and blurs: the places on screen an edit aimed at. */
export function aiTargets(before: Timeline, after: Timeline): AiTarget[] {
  const old = new Map(before.effects.map(e => [e.id, JSON.stringify(e)]));
  return after.effects.filter(e => e.kind in LABELS && old.get(e.id) !== JSON.stringify(e)).slice(0, 3).map(e => {
    const f = e as unknown as Record<string, unknown>;
    // A zoom has no box: what stays on screen at its amount is a 1/amount share of the frame around its aim.
    const amount = typeof f.amount === 'number' && f.amount > 1 ? f.amount : 1.6;
    const w = e.kind === 'zoom' ? 1 / amount : share(f.w, .3), h = e.kind === 'zoom' ? 1 / amount : share(f.h, .3);
    return { id: e.id, x: share(f.x, .5), y: share(f.y, .5), w, h, label: typeof f.label === 'string' && f.label ? f.label : LABELS[e.kind] };
  });
}

/** Soft outlines over the preview where the edit landed; they fade out by themselves. */
export function AiTargetHints({ targets, canvas }: { targets: AiTarget[]; canvas: () => HTMLCanvasElement | null }) {
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const c = canvas();
    if (!c || !targets.length) { setBox(null); return; }
    // The canvas keeps its aspect ratio inside the artboard, so the outlines are placed over the picture itself.
    setBox({ left: c.offsetLeft, top: c.offsetTop, width: c.offsetWidth, height: c.offsetHeight });
  }, [targets, canvas]);
  if (!box || !targets.length) return null;
  return <div className="ve-ai-targets" aria-hidden="true" style={box}>
    {targets.map(t => <span key={t.id} style={{ left: `${(t.x - t.w / 2) * 100}%`, top: `${(t.y - t.h / 2) * 100}%`, width: `${t.w * 100}%`, height: `${t.h * 100}%` }}><b>{t.label}</b></span>)}
  </div>;
}

/** A soft two-note tick when an edit lands, made on the spot so there is no file to load. Off unless chosen. */
export function playLandingTick() {
  try {
    const ctx = new AudioContext(), now = ctx.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * .07); gain.gain.linearRampToValueAtTime(.06, now + i * .07 + .01); gain.gain.exponentialRampToValueAtTime(.0001, now + i * .07 + .22);
      osc.connect(gain).connect(ctx.destination); osc.start(now + i * .07); osc.stop(now + i * .07 + .25);
    }
    setTimeout(() => void ctx.close(), 600);
  } catch { /* no audio here: silence is fine */ }
}
export const LANDING_SOUND_KEY = 'bopzi-ai-landing-sound';
export function landingSoundOn() { try { return localStorage.getItem(LANDING_SOUND_KEY) === '1'; } catch { return false; } }
