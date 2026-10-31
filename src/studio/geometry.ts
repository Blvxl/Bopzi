import Konva from 'konva';
import { fontOf } from '@/lib/fonts';
import { THUMBNAIL, type Layer, type Size, type TextLayer } from '@/lib/types';

/** Konva props for a text layer. Shared by the canvas node and by measuring. */
export function textProps(l: TextLayer) {
  const font = fontOf(l.font);
  const base = {
    text: l.uppercase ? l.text.toUpperCase() : l.text,
    fontFamily: font.family,
    fontStyle: font.weight,
    fontSize: l.fontSize,
    fill: l.fill,
    align: l.align,
    lineHeight: l.lineHeight,
    letterSpacing: l.letterSpacing,
    stroke: l.strokeWidth > 0 ? l.stroke : undefined,
    // The fill is painted over the stroke, so only the outer half shows.
    strokeWidth: l.strokeWidth * 2,
    lineJoin: 'round' as const,
    fillAfterStrokeEnabled: true,
  };
  const lines = l.text.split('\n').length;
  if (l.fillStops && l.fillStops.length > 1) {
    // Across the widest line, so the measured width of the text is needed first.
    const probe = new Konva.Text(base);
    const width = probe.width();
    probe.destroy();
    const stops = l.fillStops;
    return { ...base, fillPriority: 'linear-gradient' as const, fillLinearGradientStartPoint: { x: 0, y: 0 }, fillLinearGradientEndPoint: { x: width, y: 0 }, fillLinearGradientColorStops: stops.flatMap((colour, i) => [i / (stops.length - 1), colour]) };
  }
  if (l.fill2) {
    return { ...base, fillPriority: 'linear-gradient' as const, fillLinearGradientStartPoint: { x: 0, y: l.fontSize * 0.12 }, fillLinearGradientEndPoint: { x: 0, y: l.fontSize * l.lineHeight * lines * 0.92 }, fillLinearGradientColorStops: [0, l.fill, 1, l.fill2] };
  }
  return base;
}

/** Unrotated size of a layer in canvas pixels. */
export function layerSize(l: Layer) {
  if (l.type === 'text') {
    const t = new Konva.Text(textProps(l));
    const size = { w: t.width() * Math.abs(l.scaleX), h: t.height() * Math.abs(l.scaleY) };
    t.destroy();
    return size;
  }
  return { w: l.width * Math.abs(l.scaleX), h: l.height * Math.abs(l.scaleY) };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export function getCenter(l: Layer) {
  const { w, h } = layerSize(l);
  const r = rad(l.rotation);
  return {
    x: l.x + (w / 2) * Math.cos(r) - (h / 2) * Math.sin(r),
    y: l.y + (w / 2) * Math.sin(r) + (h / 2) * Math.cos(r),
  };
}

/** The upright box a layer fills on the canvas, turned or not. */
export function boundsOf(l: Layer) {
  const { w, h } = layerSize(l);
  const c = getCenter(l);
  const r = rad(l.rotation);
  const halfW = (Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r))) / 2;
  const halfH = (Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r))) / 2;
  return { left: c.x - halfW, top: c.y - halfH, right: c.x + halfW, bottom: c.y + halfH };
}

/** The x/y a layer needs so that its centre lands on `c`. */
export function originForCenter(l: Layer, c: { x: number; y: number }) {
  const { w, h } = layerSize(l);
  const r = rad(l.rotation);
  return {
    x: Math.round(c.x - (w / 2) * Math.cos(r) + (h / 2) * Math.sin(r)),
    y: Math.round(c.y - (w / 2) * Math.sin(r) - (h / 2) * Math.cos(r)),
  };
}

/** Uniform scale that makes a w×h box cover or fit inside the canvas. */
export function canvasScale(w: number, h: number, mode: 'cover' | 'contain', canvas: Size = THUMBNAIL) {
  const sx = canvas.w / w;
  const sy = canvas.h / h;
  return mode === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
}
