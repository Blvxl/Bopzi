import { type Clip, type Media } from './model';
import { blurredZooms, cameraAt, type ClipSpan, type Effect } from './motion';
import { STILL, type TransitionState } from './transitions';
import { applyTransform, transformAt } from './clip-motion';
import { gradeFilter } from './grade';

/**
 * Draws one clip's picture as the preview frames it: covering the frame, cropped by the clip's own zoom and framing,
 * then moved by the zooms and shakes at that moment, and by a transition into or out of the clip (`move`, the
 * transition at a moment; see transitions.ts). The preview and the object tracer share it, so a traced outline lands
 * exactly on what the viewer sees.
 */
export function drawFootage(ctx: CanvasRenderingContext2D, picture: CanvasImageSource, asset: Media, clip: Clip, span: ClipSpan, effects: Effect[], t: number, w: number, h: number, steady = false, blur = false, move?: (time: number) => TransitionState, /** Part of the frame to fill instead of all of it, beside a split-screen video (pip.ts); the camera still moves the whole frame, as in the export. */ area?: { x: number; y: number; w: number; h: number }) {
  const box = area ?? { x: 0, y: 0, w, h }, scale = Math.max(box.w / asset.width, box.h / asset.height) * clip.zoom, dw = asset.width * scale, dh = asset.height * scale;
  const at = (time: number) => {
    const cam = steady ? { zoom: 1, fx: .5, fy: .5, dx: 0, dy: 0 } : cameraAt(effects, time, span), tr = steady || !move ? STILL : move(time);
    ctx.save();
    if (!steady) applyTransform(ctx, transformAt(clip.keyframes, time - span[0]), w, h);
    // The transition moves the whole framed picture around the frame's centre, on top of the camera.
    if (tr !== STILL) { ctx.translate(w / 2 + tr.dx * w, h / 2 + tr.dy * h); ctx.rotate(tr.rot); ctx.scale(tr.zoom, tr.zoom); ctx.translate(-w / 2, -h / 2); }
    ctx.translate(w * cam.fx, h * cam.fy); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-w * cam.fx + cam.dx * w, -h * cam.fy + cam.dy * h);
    if (clip.grade) ctx.filter = gradeFilter(clip.grade);
    if (area) { ctx.fillStyle = '#0b0a09'; ctx.fillRect(0, 0, w, h); ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip(); }
    ctx.drawImage(picture, box.x - (dw - box.w) * clip.focusX, box.y - (dh - box.h) / 2, dw, dh);
    ctx.restore();
  };
  // Motion blur: the picture as the camera saw it across a short shutter, averaged, so a fast move smears like a real
  // lens instead of stepping. During a moving punch zoom, and through the fast part of a transition.
  const tr = move && !steady ? move(t) : STILL;
  const zooming = blur && !steady && blurredZooms(effects).some(e => t >= e.start && t < e.start + e.duration) && Math.abs(cameraAt(effects, t, span).zoom / cameraAt(effects, t - SHUTTER, span).zoom - 1) > .002;
  const base = ctx.globalAlpha;
  if (zooming || blur && tr.blur > .05) {
    const shutter = SHUTTER * (1 + tr.blur);
    for (let k = 0; k < SAMPLES; k++) { ctx.globalAlpha = base / (k + 1); at(t - shutter * (1 - k / (SAMPLES - 1))); }
    ctx.globalAlpha = base;
  } else at(t);
  if (tr.glitch > 0) glitch(ctx, w, h, t, tr.glitch);
}
/** One frame's worth at 30 fps, the same span the export blends (render.ts mixes each frame with neighbouring ones). */
const SHUTTER = 1 / 30, SAMPLES = 6;

/**
 * A digital glitch over what was just drawn: a few bands of the picture torn sideways and a red and cyan split,
 * changing every frame (the export does the same with ffmpeg's rgbashift and a jittering crop).
 */
function glitch(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, amount: number) {
  const frame = Math.floor(t * 30), rand = (n: number) => { const s = Math.sin(frame * 12.9898 + n * 78.233) * 43758.5453; return s - Math.floor(s); };
  ctx.save();
  for (let i = 0; i < 6; i++) {
    const y = rand(i) * h, bh = h * (.02 + .08 * rand(i + 10)), shift = (rand(i + 20) - .5) * w * .12 * amount;
    ctx.drawImage(ctx.canvas, 0, y, w, bh, shift, y, w, bh);
  }
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .35 * amount;
  const split = w * .012 * amount;
  ctx.fillStyle = '#ff2a55'; ctx.fillRect(-split, 0, w, h);
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .25 * amount; ctx.fillStyle = '#00e5ff'; ctx.fillRect(split, 0, w, h);
  ctx.restore();
}
