'use client';

import KonvaLib from 'konva';
import type Konva from 'konva';
import { useMemo } from 'react';
import { Circle, Ellipse, Group, Image as KImage, Path, Rect, Shape, Text as KText, TextPath as KTextPath } from 'react-konva';
import { useAsset } from '@/lib/assets';
import type { ImageLayer, Layer, LayerPatch, LightLayer, ShapeLayer, TextLayer } from '@/lib/types';
import { clamp, hexToRgba } from '@/lib/util';
import { textProps } from './geometry';
import { scalePath, shapeOf } from './shapes';
import { SOFT, drawWidget } from './widgets';

type Props = {
  layer: Layer;
  fontsVersion: number;
  /** `additive` is a shift-click: the layer joins what is already selected. */
  onSelect: (id: string, additive?: boolean) => void;
  onCommit: (id: string, patch: LayerPatch) => void;
  onEditText: (id: string) => void;
  /** A right-click on the layer, with where on the screen it happened. */
  onMenu: (id: string, at: { x: number; y: number }) => void;
};

/**
 * A canvas node carries one shadow, so a drop shadow plus a glow is drawn as stacked passes of the
 * same shape. Konva scales shadows with the node, so values are divided back into canvas pixels.
 */
function effectPasses(l: Layer, flipped = false): object[] {
  const sx = Math.abs(l.scaleX) || 1;
  const sy = Math.abs(l.scaleY) || 1;
  const k = Math.min(sx, sy);
  const passes: object[] = [];
  if (l.shadow.enabled) {
    passes.push({
      shadowColor: l.shadow.color,
      shadowBlur: l.shadow.blur / k,
      shadowOffsetX: ((flipped ? -1 : 1) * l.shadow.offsetX) / sx,
      shadowOffsetY: l.shadow.offsetY / sy,
      shadowOpacity: l.shadow.opacity,
    });
  }
  if (l.glow.enabled) {
    const glow = { shadowColor: l.glow.color, shadowBlur: l.glow.blur / k, shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 1 };
    for (let i = 0; i < clamp(l.glow.strength, 1, 3); i++) passes.push(glow);
  }
  return passes.length ? passes : [{}];
}

const OUTLINE_STEPS = 32;

type Look = { left: number; top: number; right: number; bottom: number; corner: number; blur: number; brightness: number; saturation: number; opaque: boolean; edge: string; r: number };

/**
 * The picture as the layer shows it: trimmed, with rounded corners, blurred or brightened, and with a solid
 * edge around its own shape. All sizes are in the picture's own pixels. The stored file is never changed.
 * Returns the drawing and where its top-left corner sits relative to the untrimmed picture.
 */
function prepare(img: HTMLImageElement, o: Look) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const sx = Math.round(W * o.left), sy = Math.round(H * o.top);
  const sw = Math.max(1, Math.round(W * (1 - o.left - o.right))), sh = Math.max(1, Math.round(H * (1 - o.top - o.bottom)));
  const base = document.createElement('canvas');
  base.width = sw;
  base.height = sh;
  const ctx = base.getContext('2d')!;
  if (o.corner > 0) {
    ctx.beginPath();
    ctx.roundRect(0, 0, sw, sh, (Math.min(sw, sh) * o.corner) / 100);
    ctx.clip();
  }
  const filters = [o.blur > 0 ? `blur(${o.blur}px)` : '', o.brightness !== 100 ? `brightness(${o.brightness}%)` : '', o.saturation !== 100 ? `saturate(${o.saturation}%)` : ''].filter(Boolean);
  if (filters.length) ctx.filter = filters.join(' ');
  // A blurred photo fades out at its edges unless it is drawn a little larger than its frame.
  const over = o.opaque ? o.blur * 2 : 0;
  ctx.drawImage(img, sx, sy, sw, sh, -over, -over, sw + over * 2, sh + over * 2);
  if (o.r <= 0) return { canvas: base, x: sx, y: sy };

  // The edge is the picture stamped in a ring and filled with one colour, so it follows whatever is opaque.
  const pad = Math.ceil(o.r) + 2;
  const out = document.createElement('canvas');
  out.width = sw + pad * 2;
  out.height = sh + pad * 2;
  const edge = out.getContext('2d')!;
  for (let i = 0; i < OUTLINE_STEPS; i++) {
    const a = (i / OUTLINE_STEPS) * Math.PI * 2;
    edge.drawImage(base, pad + Math.cos(a) * o.r, pad + Math.sin(a) * o.r);
  }
  edge.globalCompositeOperation = 'source-in';
  edge.fillStyle = o.edge;
  edge.fillRect(0, 0, out.width, out.height);
  edge.globalCompositeOperation = 'source-over';
  edge.drawImage(base, pad, pad);
  return { canvas: out, x: sx - pad, y: sy - pad };
}

function ImageBody({ layer }: { layer: ImageLayer }) {
  const asset = useAsset(layer.assetId);
  const img = asset && asset !== 'missing' ? asset.img : null;
  const opaque = !!asset && asset !== 'missing' && !asset.record.hasAlpha;
  const scale = Math.abs(layer.scaleX) || 1;
  const outline = layer.outline?.enabled ? layer.outline : null;
  const { crop, corner = 0, adjust } = layer;
  // Widths are given in canvas pixels, so a scaled-down picture needs more of its own pixels for the same look.
  const r = outline ? Math.round(outline.width / scale) : 0;
  const blur = adjust?.blur ? Math.round((adjust.blur / scale) * 2) / 2 : 0;
  const plain = !crop && !corner && !adjust && !r;
  const drawn = useMemo(
    () => (img && !plain ? prepare(img, { left: crop?.left ?? 0, top: crop?.top ?? 0, right: crop?.right ?? 0, bottom: crop?.bottom ?? 0, corner, blur, brightness: adjust?.brightness ?? 100, saturation: adjust?.saturation ?? 100, opaque, edge: outline?.color ?? '#FFFFFF', r }) : null),
    [img, plain, crop?.left, crop?.top, crop?.right, crop?.bottom, corner, blur, adjust?.brightness, adjust?.saturation, opaque, outline?.color, r],
  );
  if (!asset || asset === 'missing') {
    return (
      <Rect
        width={layer.width}
        height={layer.height}
        fill="rgba(255,255,255,0.06)"
        stroke={asset === 'missing' ? '#FF5A36' : '#a39d93'}
        strokeWidth={4 / (Math.abs(layer.scaleX) || 1)}
        dash={[18, 14]}
      />
    );
  }
  const w = drawn?.canvas.width ?? layer.width, h = drawn?.canvas.height ?? layer.height;
  const left = drawn?.x ?? 0;
  // Mirrored about the middle of the whole picture, so trimming one side stays on that side.
  const inner = { image: drawn?.canvas ?? asset.img, width: w, height: h, scaleX: layer.flipX ? -1 : 1, x: layer.flipX ? layer.width - left : left, y: drawn?.y ?? 0 };
  return (
    <>
      {effectPasses(layer, layer.flipX).map((fx, i) => (
        <KImage key={i} {...inner} {...fx} />
      ))}
    </>
  );
}

/** One line of lettering along an arc. `curve` runs from -100 to 100; at either end the line is a half circle. */
function arcFor(width: number, fontSize: number, curve: number) {
  const angle = (Math.abs(curve) / 100) * Math.PI;
  // A little longer than the words, or the last letter is dropped for not fitting.
  const radius = (width * 1.1) / angle;
  const chord = 2 * radius * Math.sin(angle / 2);
  const rise = radius * (1 - Math.cos(angle / 2));
  const up = curve > 0;
  const y = up ? rise + fontSize : fontSize;
  return { data: `M0 ${y} A${radius} ${radius} 0 0 ${up ? 1 : 0} ${chord} ${y}`, w: chord, h: rise + fontSize * 1.15 };
}

function TextBody({ layer, fontsVersion }: { layer: TextLayer; fontsVersion: number }) {
  const props = textProps(layer);
  const size = useMemo(() => {
    const probe = new KonvaLib.Text(textProps(layer));
    const measured = { w: probe.width(), h: probe.height() };
    probe.destroy();
    return measured;
    // Measured again when the fonts arrive, and whenever anything that changes the size does.
  }, [layer.text, layer.font, layer.fontSize, layer.letterSpacing, layer.lineHeight, layer.uppercase, layer.strokeWidth, fontsVersion]);
  const plate = layer.plate?.enabled ? layer.plate : null;
  const second = layer.stroke2?.enabled && layer.stroke2.width > 0 ? layer.stroke2 : null;
  const arc = !!layer.curve && Math.abs(layer.curve) >= 2 && size.w > 0 ? arcFor(size.w, layer.fontSize, layer.curve) : null;
  // An arc carries one line, so line breaks become spaces.
  const bent = arc ? { ...props, text: props.text.replace(/\s*\n\s*/g, ' '), data: arc.data, align: 'center' as const, textBaseline: 'bottom' as const } : null;
  // The plate sits behind the words wherever the bend puts them.
  const box = arc ?? size;
  const letters = (key: string, extra: object) => (bent ? <KTextPath key={key} {...bent} {...extra} /> : <KText key={key} {...props} {...extra} />);
  return (
    <>
      {plate && (
        <Rect
          x={-plate.padX}
          y={-plate.padY}
          width={box.w + plate.padX * 2}
          height={box.h + plate.padY * 2}
          cornerRadius={Math.min(plate.radius, (box.h + plate.padY * 2) / 2)}
          fill={plate.color}
          stroke={plate.strokeWidth > 0 ? plate.stroke : undefined}
          strokeWidth={plate.strokeWidth}
          {...(layer.shadow.enabled ? effectPasses({ ...layer, glow: { ...layer.glow, enabled: false } })[0] : {})}
        />
      )}
      {/* The outer outline is the same lettering again, wider and behind. */}
      {second && letters(`second-${fontsVersion}`, { fill: second.color, fillPriority: 'color', stroke: second.color, strokeWidth: (layer.strokeWidth + second.width) * 2 })}
      {effectPasses(layer).map((fx, i) =>
        // Remount once web fonts arrive so Konva measures with the real glyphs.
        letters(`${i}-${fontsVersion}`, fx),
      )}
    </>
  );
}

function ShapeBody({ layer }: { layer: ShapeLayer }) {
  const def = shapeOf(layer.shape);
  const w = Math.max(1, layer.width), h = Math.max(1, layer.height);
  const paint = {
    ...(layer.fill ? (layer.fill2 ? { fillPriority: 'linear-gradient' as const, fillLinearGradientStartPoint: { x: 0, y: 0 }, fillLinearGradientEndPoint: { x: 0, y: h }, fillLinearGradientColorStops: [0, layer.fill, 1, layer.fill2] } : { fill: layer.fill }) : {}),
    // On a filled shape the outline sits wholly outside it, as on lettering: drawn at twice the width, under the fill.
    ...(layer.strokeWidth > 0 ? { stroke: layer.stroke, strokeWidth: layer.fill ? layer.strokeWidth * 2 : layer.strokeWidth, lineJoin: 'round' as const, fillAfterStrokeEnabled: !!layer.fill } : {}),
    // An unfilled shape is only its line, which is hard to catch with the pointer.
    hitStrokeWidth: Math.max(layer.strokeWidth, 28),
  };
  // Mirrored about its own middle, so a curved arrow can point the other way.
  const flip = { x: layer.flipX ? w : 0, scaleX: layer.flipX ? -1 : 1 };
  if (def.kind === 'widget') {
    // Some are see-through, so a solid copy underneath would show.
    const ring = layer.shape === 'key-ring';
    const clear = SOFT.has(layer.shape);
    return (
      <>
        {/* A plain copy underneath casts the shadow and catches the pointer; the piece itself is painted over it. */}
        {effectPasses(layer).map((fx, i) =>
          ring ? <Ellipse key={i} x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} fill="rgba(0,0,0,0)" /> : <Rect key={i} width={w} height={h} cornerRadius={Math.min(layer.radius ?? h / 2, w / 2, h / 2)} fill={clear ? 'rgba(0,0,0,0)' : layer.stroke} {...(clear ? {} : fx)} />,
        )}
        <Shape listening={false} sceneFunc={(context) => drawWidget(context._context, layer)} />
      </>
    );
  }
  return (
    <Group {...flip}>
      {effectPasses(layer, !!layer.flipX).map((fx, i) =>
        def.kind === 'rect' ? (
          <Rect key={i} width={w} height={h} cornerRadius={Math.min(layer.radius ?? 0, w / 2, h / 2)} {...paint} {...fx} />
        ) : def.kind === 'ellipse' ? (
          <Ellipse key={i} x={w / 2} y={h / 2} radiusX={w / 2} radiusY={h / 2} {...paint} {...fx} />
        ) : (
          <Path key={i} data={scalePath(def.d ?? '', w, h)} fillRule={def.evenodd ? 'evenodd' : 'nonzero'} {...paint} {...fx} />
        ),
      )}
    </Group>
  );
}

function LightBody({ layer }: { layer: LightLayer }) {
  const r = layer.width / 2;
  return (
    <Circle
      x={r}
      y={layer.height / 2}
      radius={r}
      scaleY={layer.height / layer.width}
      fillRadialGradientStartPoint={{ x: 0, y: 0 }}
      fillRadialGradientEndPoint={{ x: 0, y: 0 }}
      fillRadialGradientStartRadius={0}
      fillRadialGradientEndRadius={r}
      fillRadialGradientColorStops={[0, hexToRgba(layer.color, 1), 0.4, hexToRgba(layer.color, 0.55), 1, hexToRgba(layer.color, 0)]}
      globalCompositeOperation={layer.blend}
      // Only the bright core is clickable, so a large soft light does not steal clicks meant for what sits near it.
      hitFunc={(ctx, shape) => {
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      }}
    />
  );
}

const setCursor = (e: Konva.KonvaEventObject<MouseEvent>, cursor: string) => {
  const stage = e.target.getStage();
  if (stage) stage.container().style.cursor = cursor;
};

export default function LayerNode({ layer, fontsVersion, onSelect, onCommit, onEditText, onMenu }: Props) {
  const onTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    const n = e.target;
    const patch: LayerPatch = { x: Math.round(n.x()), y: Math.round(n.y()), rotation: Math.round(n.rotation() * 10) / 10 };
    if (layer.type === 'image') {
      patch.scaleX = n.scaleX();
      patch.scaleY = n.scaleY();
    } else {
      // Text and lights keep scale at 1 and fold the resize into their own size.
      const kx = n.scaleX();
      const ky = n.scaleY();
      n.scaleX(1);
      n.scaleY(1);
      patch.scaleX = 1;
      patch.scaleY = 1;
      if (layer.type === 'text') {
        patch.fontSize = clamp(Math.round(layer.fontSize * ky), 8, 1200);
        patch.strokeWidth = Math.round(layer.strokeWidth * ky * 10) / 10;
        // Everything measured against the lettering grows with it.
        if (layer.plate) patch.plate = { ...layer.plate, radius: layer.plate.radius * ky, padX: layer.plate.padX * ky, padY: layer.plate.padY * ky, strokeWidth: layer.plate.strokeWidth * ky };
        if (layer.stroke2) patch.stroke2 = { ...layer.stroke2, width: Math.round(layer.stroke2.width * ky * 10) / 10 };
      } else {
        patch.width = Math.max(layer.type === 'shape' ? 4 : 20, Math.round(layer.width * kx));
        patch.height = Math.max(layer.type === 'shape' ? 4 : 20, Math.round(layer.height * ky));
        if (layer.type === 'shape') {
          // A resize from a corner keeps the look in proportion; a stretch from a side leaves line and corners alone.
          const k = Math.abs(Math.abs(kx) - Math.abs(ky)) < 0.02 ? Math.abs(ky) : 1;
          patch.strokeWidth = Math.round(layer.strokeWidth * k * 10) / 10;
          if (layer.radius) patch.radius = Math.round(layer.radius * k);
        }
      }
    }
    onCommit(layer.id, patch);
  };

  return (
    <Group
      id={layer.id}
      x={layer.x}
      y={layer.y}
      rotation={layer.rotation}
      scaleX={layer.scaleX}
      scaleY={layer.scaleY}
      opacity={layer.opacity}
      visible={layer.visible}
      listening={!layer.locked}
      draggable={!layer.locked}
      onMouseDown={(e) => onSelect(layer.id, e.evt.shiftKey)}
      onTouchStart={() => onSelect(layer.id)}
      onMouseEnter={(e) => setCursor(e, 'move')}
      onMouseLeave={(e) => setCursor(e, 'default')}
      onDragEnd={(e) => {
        if (e.target.id() === layer.id) onCommit(layer.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) });
      }}
      onTransformEnd={onTransformEnd}
      onContextMenu={(e) => {
        e.evt.preventDefault();
        onSelect(layer.id);
        onMenu(layer.id, { x: e.evt.clientX, y: e.evt.clientY });
      }}
      onDblClick={() => layer.type === 'text' && onEditText(layer.id)}
      onDblTap={() => layer.type === 'text' && onEditText(layer.id)}
    >
      {layer.type === 'image' && <ImageBody layer={layer} />}
      {layer.type === 'text' && <TextBody layer={layer} fontsVersion={fontsVersion} />}
      {layer.type === 'light' && <LightBody layer={layer} />}
      {layer.type === 'shape' && <ShapeBody layer={layer} />}
    </Group>
  );
}
