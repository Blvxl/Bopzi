import { visibleTimeline } from './editing';
import { drawFootage } from './footage';
import { drawBlurs } from './blur';
import { drawScene } from './layers';
import { dimensions, positions, type Media, type Timeline } from './model';
import { loadOverlayPicture } from './overlays';
import { picture, seek } from './track';
import { transitionAt } from './transitions';
import { pictureAt } from './clip-motion';
import { drawVideoOverlay, footageArea, videoOverlaysAt } from './pip';
import type { Beat } from './beats';
import { audioSamples, diskLoudness } from './media-source';

/**
 * What the video AI gets to see and hear besides the timeline, all worked out on this computer: contact sheets of
 * frames sampled through each video (so it can find "the moment I die"), how loud each file is over time (explosions,
 * screams, silence), and the beat. Each is compact on purpose: a few images and short lines of text, not the footage.
 */

// Keep enough resolution to judge faces, caption placement and lighting while keeping each
// 4×4 contact sheet small enough to send with the local AI request.
const TILE_W = 320, TILE_H = 180, COLS = 4, ROWS = 4, LABEL = 18;
/** At most this many sampled frames per request, across all videos; a sheet holds 16. */
const FRAME_BUDGET = 48;

/** Sampling times for each video, in its own seconds: spread over its length, never closer than half a second. */
export function samplePlan(videos: { id: string; duration: number }[], budget = FRAME_BUDGET) {
  const total = videos.reduce((s, v) => s + v.duration, 0);
  return videos.map(v => {
    const count = Math.max(1, Math.min(Math.floor(v.duration / .5), Math.max(4, Math.round(budget * v.duration / (total || 1)))));
    return { id: v.id, times: Array.from({ length: count }, (_, i) => Number(((i + .5) * v.duration / count).toFixed(2))) };
  });
}

/**
 * Contact sheets: sampled frames in a 4×4 grid, each labelled with its video's short name (V1, V2…) and source second,
 * the same seconds the AI writes as a clip's in/out. Returns JPEG data URLs and the legend that ties V1 to a file.
 */
export async function contactSheets(assets: Media[], signal?: AbortSignal) {
  const videos = assets.filter(a => a.kind === 'video' && a.duration > 0);
  const plan = samplePlan(videos);
  const tiles: { label: string; draw: (ctx: CanvasRenderingContext2D, x: number, y: number) => void }[] = [];
  const grab = Object.assign(document.createElement('canvas'), { width: TILE_W, height: TILE_H }), g = grab.getContext('2d')!;
  for (const [n, { id, times }] of plan.entries()) {
    const asset = videos.find(v => v.id === id)!;
    let video: HTMLVideoElement;
    try { const el = await picture(asset); if (!(el instanceof HTMLVideoElement)) continue; video = el; } catch { continue; }
    for (const t of times) {
      if (signal?.aborted) throw new Error('Edit cancelled.');
      await Promise.race([seek(video, Math.min(t, Math.max(0, asset.duration - .05))), new Promise(r => setTimeout(r, 3000))]);
      // Letterboxed into the tile so vertical recordings are not squashed.
      const scale = Math.min(TILE_W / video.videoWidth, TILE_H / video.videoHeight) || 1, dw = video.videoWidth * scale, dh = video.videoHeight * scale;
      g.fillStyle = '#000'; g.fillRect(0, 0, TILE_W, TILE_H); g.drawImage(video, (TILE_W - dw) / 2, (TILE_H - dh) / 2, dw, dh);
      const shot = g.getImageData(0, 0, TILE_W, TILE_H);
      tiles.push({ label: `V${n + 1} ${t.toFixed(1)}s`, draw: (ctx, x, y) => ctx.putImageData(shot, x, y) });
    }
  }
  const sheets: string[] = [];
  for (let i = 0; i < tiles.length; i += COLS * ROWS) {
    const page = tiles.slice(i, i + COLS * ROWS), rows = Math.ceil(page.length / COLS);
    const sheet = Object.assign(document.createElement('canvas'), { width: COLS * TILE_W, height: rows * (TILE_H + LABEL) }), ctx = sheet.getContext('2d')!;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, sheet.width, sheet.height); ctx.font = 'bold 13px sans-serif'; ctx.textBaseline = 'middle';
    page.forEach((tile, j) => {
      const x = (j % COLS) * TILE_W, y = Math.floor(j / COLS) * (TILE_H + LABEL);
      tile.draw(ctx, x, y + LABEL); ctx.fillStyle = '#ffd84d'; ctx.fillText(tile.label, x + 6, y + LABEL / 2);
    });
    sheets.push(sheet.toDataURL('image/jpeg', .58));
  }
  return { sheets, legend: videos.map((v, n) => ({ ref: `V${n + 1}`, id: v.id, name: v.name })) };
}

/** Loudness in dB, a quarter second per value, for each file with sound. Kept per file: a recording never changes. */
const STEP = .25;
const levels = new Map<string, Promise<number[] | null>>();
export function loudness(asset: Media) {
  let found = levels.get(asset.id);
  if (!found) { found = measure(asset).catch(() => null); levels.set(asset.id, found); }
  return found;
}
async function measure(asset: Media) {
  // Media on disk is measured by the server the same way, without the browser decoding hours of sound.
  const measured = await diskLoudness(asset); if (measured !== undefined) return measured;
  const RATE = 8000, data = await audioSamples(asset, RATE); if (!data) return null;
  const hop = Math.round(RATE * STEP), out: number[] = [];
  for (let i = 0; i + hop <= data.length; i += hop) {
    let sum = 0; for (let j = i; j < i + hop; j++) sum += data[j] * data[j];
    out.push(Math.max(-60, Math.round(10 * Math.log10(sum / hop + 1e-12))));
  }
  return out;
}

/**
 * One file's loudness as the AI reads it: a digit per half second (0 silent … 9 very loud), then the peaks that stand
 * well above that file's usual level (a hit, a scream, an explosion) and the long silences, all in source seconds.
 */
export function describeLoudness(ref: string, db: number[]) {
  if (!db.length) return '';
  const sorted = [...db].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
  const halves: number[] = []; for (let i = 0; i < db.length; i += 2) halves.push(Math.max(db[i], db[i + 1] ?? -60));
  const digits = halves.map(v => Math.max(0, Math.min(9, Math.round((v + 54) / 6)))).join('');
  const peaks: { t: number; rise: number }[] = [];
  for (let i = 1; i < db.length - 1; i++) if (db[i] >= db[i - 1] && db[i] > db[i + 1] && db[i] - median >= 10 && db[i] > -30) peaks.push({ t: i * STEP, rise: db[i] - median });
  const top = peaks.sort((a, b) => b.rise - a.rise).slice(0, 12).sort((a, b) => a.t - b.t);
  const quiet: string[] = []; let from = -1;
  for (let i = 0; i <= db.length; i++) {
    // Well below the file's usual level, but a quiet recording still counts near-digital silence as silent.
    const silent = i < db.length && db[i] < Math.max(-55, Math.min(-45, median - 15));
    if (silent && from < 0) from = i; else if (!silent && from >= 0) { if ((i - from) * STEP >= 1.5) quiet.push(`${(from * STEP).toFixed(1)}–${(i * STEP).toFixed(1)}s`); from = -1; }
  }
  return `${ref} loudness per .5s: ${digits}` + (top.length ? ` | peaks: ${top.map(p => `${p.t.toFixed(2)}s(+${p.rise}dB)`).join(', ')}` : '') + (quiet.length ? ` | silent: ${quiet.slice(0, 10).join(', ')}` : '');
}

/** Beats as the AI reads them: bar starts, then every beat, in timeline seconds. */
export function describeBeats(beats: Beat[]) {
  if (!beats.length) return '';
  const strong = beats.filter(b => b.strong).map(b => b.time.toFixed(2)), all = beats.map(b => b.time.toFixed(2));
  const gaps = beats.slice(1).map((b, i) => b.time - beats[i].time).sort((a, b) => a - b), bpm = gaps.length ? Math.round(60 / gaps[Math.floor(gaps.length / 2)]) : 0;
  return `about ${bpm} BPM. Bar starts (best for cuts and punches): ${strong.slice(0, 80).join(', ')}. Every beat: ${all.slice(0, 200).join(', ')}`;
}

/** Everything the AI gets alongside the timeline, gathered in parallel. Audio files and videos both get loudness. */
export async function gatherContext(assets: Media[], beats: Beat[], signal?: AbortSignal) {
  const [sheets, ...loud] = await Promise.all([contactSheets(assets, signal), ...assets.filter(a => a.kind !== 'image').map(async a => ({ a, db: await loudness(a) }))]);
  const refs = new Map(sheets.legend.map(l => [l.id, l.ref])); let audioN = 0;
  for (const a of assets) if (a.kind === 'audio') refs.set(a.id, `A${++audioN}`);
  const lines = loud.map(({ a, db }) => db ? describeLoudness(refs.get(a.id) ?? a.name, db) : '').filter(Boolean);
  return { sheets: sheets.sheets, legend: [...sheets.legend, ...assets.filter(a => a.kind === 'audio').map(a => ({ ref: refs.get(a.id)!, id: a.id, name: a.name }))], loudness: lines, beats: describeBeats(beats) };
}

/**
 * One finished frame of a timeline, footage and everything on it, as the export would show it: for letting the AI check
 * its own edit. Uses its own video copies, so the preview's playhead never moves.
 */
export async function renderFrame(timeline: Timeline, assets: Media[], t: number, width = 640) {
  timeline = visibleTimeline(timeline);
  const [fw, fh] = dimensions(timeline.format), w = width, h = Math.round(width * fh / fw);
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h }), ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0b0a09'; ctx.fillRect(0, 0, w, h);
  const spots = positions(timeline), i = spots.findIndex(p => t >= p.start && t < p.end), active = spots[i];
  if (active && !timeline.layerSettings?.[active.clip.id]?.hidden) {
    const asset = assets.find(a => a.id === active.clip.assetId);
    if (asset && asset.kind !== 'audio') {
      const el = await picture(asset);
      if (el instanceof HTMLVideoElement) await Promise.race([seek(el, Math.max(0, Math.min(active.clip.out - .001, pictureAt(active.clip, t - active.start)))), new Promise(r => setTimeout(r, 3000))]);
      const next = spots[i + 1]?.clip;
      const area = active.clip.reverse ? undefined : footageArea(timeline.videoOverlays, t, fw, fh), k = w / fw;
      drawFootage(ctx, el, asset, active.clip, [active.start, active.end], timeline.effects, t, w, h, false, false, time => transitionAt(active.clip, next, active.end - active.start, time - active.start), area && { x: area.x * k, y: area.y * k, w: area.w * k, h: area.h * k });
      drawBlurs(ctx, timeline.effects, t, w, h);
    }
  }
  // Videos on top, each seeked to its own moment (the same file as the footage is seeked again after it was drawn).
  for (const o of videoOverlaysAt(timeline.videoOverlays, t)) {
    const asset = assets.find(a => a.id === o.assetId); if (!asset) continue;
    const el = await picture(asset).catch(() => undefined); if (!el) continue;
    if (el instanceof HTMLVideoElement) await Promise.race([seek(el, Math.max(0, Math.min(asset.duration - .001, o.in + t - o.start))), new Promise(r => setTimeout(r, 3000))]);
    drawVideoOverlay(ctx, o, el, asset, w, h, fw, fh);
  }
  const pictures = new Map<string, HTMLImageElement>();
  for (const o of timeline.overlays) { const p = await loadOverlayPicture(o, assets).catch(() => undefined); if (o.assetId && p) pictures.set(o.assetId, p); }
  drawScene(ctx, timeline, t, w, h, id => pictures.get(id));
  return canvas.toDataURL('image/jpeg', .75);
}
