'use client';

import { useMemo } from 'react';
import { Layer as KLayer, Stage } from 'react-konva';
import { THUMBNAIL } from '@/lib/types';
import { getCenter, layerSize } from './geometry';
import type { KitItem } from './kit';
import LayerNode from './LayerNode';

const W = 104;
const H = 76;
const idle = () => {};

/**
 * A kit piece on its card, drawn by the same code that draws it on the canvas, so the card shows exactly
 * what is added. The piece is built at thumbnail size and scaled down to fit.
 */
export default function KitThumb({ item, fontsVersion }: { item: KitItem; fontsVersion: number }) {
  const view = useMemo(() => {
    // Pinned, so nothing on the card can be picked up or dragged.
    const layers = item.build(THUMBNAIL).map((l) => ({ ...l, locked: true }));
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const l of layers) {
      const { w, h } = layerSize(l);
      const c = getCenter(l);
      // A turned layer may reach as far as its longer side in any direction; outlines and shadows reach a little further.
      const reach = l.rotation ? Math.hypot(w, h) / 2 : 0;
      const edge = ('strokeWidth' in l ? l.strokeWidth : 0) + (l.shadow.enabled ? l.shadow.blur * 0.5 + Math.abs(l.shadow.offsetY) : 0) + (l.glow.enabled ? l.glow.blur * 0.6 : 0);
      left = Math.min(left, c.x - (reach || w / 2) - edge);
      right = Math.max(right, c.x + (reach || w / 2) + edge);
      top = Math.min(top, c.y - (reach || h / 2) - edge);
      bottom = Math.max(bottom, c.y + (reach || h / 2) + edge);
    }
    const scale = Math.min((W * 0.9) / (right - left), (H * 0.84) / (bottom - top));
    return { layers, scale, x: W / 2 - ((left + right) / 2) * scale, y: H / 2 - ((top + bottom) / 2) * scale };
    // Lettering is measured again once its font has arrived.
  }, [item, fontsVersion]);

  return (
    <Stage width={W} height={H} listening={false}>
      <KLayer x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}>
        {view.layers.map((l) => (
          <LayerNode key={l.id} layer={l} fontsVersion={fontsVersion} onSelect={idle} onCommit={idle} onEditText={idle} onMenu={idle} />
        ))}
      </KLayer>
    </Stage>
  );
}
