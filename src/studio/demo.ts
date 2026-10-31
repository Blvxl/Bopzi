import type { DemoSpec } from '@/lib/demos';
import { CANVAS_H, CANVAS_W, type AssetRecord, type Doc, type ImageLayer, type Layer, type LightLayer, type TextLayer } from '@/lib/types';
import { makeImageLayer, makeLightLayer, makeTextLayer } from './factory';
import { originForCenter } from './geometry';

/** Downloads one of a demo's image files so it can be stored like any upload. */
export async function fetchDemoFile(url: string, name: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  const blob = await res.blob();
  const ext = url.slice(url.lastIndexOf('.'));
  return new File([blob], `${name}${ext}`, { type: blob.type });
}

/**
 * Turns a demo spec into ordinary layers: background, light, character, title.
 * Call after the editor fonts have loaded, because text is measured to centre it.
 */
export function buildDemoDoc(demo: DemoSpec, bg: AssetRecord, ch: AssetRecord): { doc: Doc; selectId: string } {
  const at = (cx: number, cy: number) => ({ x: cx * CANVAS_W, y: cy * CANVAS_H });

  const c = demo.character;
  const k = (c.h * CANVAS_H) / ch.height;
  let character: ImageLayer = { ...makeImageLayer(ch, 'character'), name: 'Demo character', scaleX: k, scaleY: k, rotation: c.rotation };
  if (c.shadow) character.shadow = { ...c.shadow };
  if (c.glow) character.glow = { ...c.glow };
  character = { ...character, ...originForCenter(character, at(c.cx, c.cy)) };

  const light = (l: DemoSpec['lights'][number]): LightLayer => ({
    ...makeLightLayer({ id: l.label, label: l.label, hint: '', color: l.color, blend: l.blend, size: l.w, opacity: l.opacity }),
    height: l.h,
    x: Math.round(l.cx * CANVAS_W - l.w / 2),
    y: Math.round(l.cy * CANVAS_H - l.h / 2),
  });

  const texts = demo.texts.map((t, i): TextLayer => {
    const { cx, cy, rotation, shadow, glow, text, ...props } = t;
    const layer: TextLayer = { ...makeTextLayer({ id: demo.id, label: '', sample: text, props }), name: i === 0 ? 'Title' : 'Tag', rotation };
    if (shadow) layer.shadow = { ...shadow };
    if (glow) layer.glow = { ...glow };
    return { ...layer, ...originForCenter(layer, at(cx, cy)) };
  });

  const layers: Layer[] = [
    makeImageLayer(bg, 'background'),
    ...demo.lights.filter((l) => !l.front).map(light),
    character,
    ...demo.lights.filter((l) => l.front).map(light),
    ...texts,
  ];
  return { doc: { background: demo.canvas, layers }, selectId: texts[0]?.id ?? character.id };
}
