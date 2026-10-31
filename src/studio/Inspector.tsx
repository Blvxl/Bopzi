'use client';

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Download,
  Eraser,
  Expand,
  FlipHorizontal2,
  Replace,
  ShieldCheck,
  Shrink,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
} from 'lucide-react';
import { useRef } from 'react';
import { ACCEPT_ATTR, useAsset } from '@/lib/assets';
import { EDITOR_FONTS } from '@/lib/fonts';
import { canvasOf, type Blend, type ImageLayer, type ImageRole, type Layer, type LayerPatch, type Outline, type ShapeLayer, type TextAlign } from '@/lib/types';
import { SHAPES, shapeOf } from './shapes';
import { EFFECTS, SOFT, TWO_TONE } from './widgets';
import { downloadBlob } from '@/lib/util';
import { useStudio, type AlignMode } from './context';
import { Color, Field, IconBtn, Num, Section, Seg, Toggle } from './controls';
import { canvasScale, getCenter, layerSize, originForCenter } from './geometry';

type Up = (patch: LayerPatch, key?: string) => void;

const BLENDS: { value: Blend; label: string }[] = [
  { value: 'screen', label: 'Screen (soft light)' },
  { value: 'lighter', label: 'Add (intense light)' },
  { value: 'overlay', label: 'Overlay (contrast)' },
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply (darken)' },
];

const ALIGNS: { mode: AlignMode; tip: string; icon: typeof AlignStartVertical }[] = [
  { mode: 'left', tip: 'Align left edges', icon: AlignStartVertical },
  { mode: 'center', tip: 'Align centres, left to right', icon: AlignCenterVertical },
  { mode: 'right', tip: 'Align right edges', icon: AlignEndVertical },
  { mode: 'top', tip: 'Align top edges', icon: AlignStartHorizontal },
  { mode: 'middle', tip: 'Align centres, top to bottom', icon: AlignCenterHorizontal },
  { mode: 'bottom', tip: 'Align bottom edges', icon: AlignEndHorizontal },
  { mode: 'spread-x', tip: 'Space evenly, left to right', icon: AlignHorizontalSpaceAround },
  { mode: 'spread-y', tip: 'Space evenly, top to bottom', icon: AlignVerticalSpaceAround },
];

/** What an image starts from when its outline is first switched on: the white sticker edge. */
export const NO_OUTLINE: Outline = { enabled: false, color: '#FFFFFF', width: 14 };

function CanvasSettings() {
  const s = useStudio();
  return (
    <>
      <Section title="Background">
        <Color label="Colour" value={s.doc.background} onChange={s.setBackground} />
      </Section>
      <Section title="Editing">
        <ul className="grid gap-2 text-xs leading-relaxed text-ui-dim">
          <li>Select a layer to edit it. Drag to move, drag a corner to resize.</li>
          <li>Double-click text to change it.</li>
        </ul>
      </Section>
    </>
  );
}

function Arrange({ layer, up, prot }: { layer: Layer; up: Up; prot: boolean }) {
  const s = useStudio();
  const canvas = canvasOf(s.doc);
  const size = layerSize(layer);
  const center = getCenter(layer);
  const moveCenter = (c: { x: number; y: number }) => up(originForCenter(layer, c));

  const setRotation = (rotation: number) => up({ rotation, ...originForCenter({ ...layer, rotation }, center) }, 'rotation');

  const setScale = (pct: number) => {
    if (layer.type !== 'image') return;
    const k = pct / 100 / layer.scaleX;
    const next = { ...layer, scaleX: layer.scaleX * k, scaleY: layer.scaleY * k };
    up({ scaleX: next.scaleX, scaleY: next.scaleY, ...originForCenter(next, center) }, 'scale');
  };

  const fitCanvas = (mode: 'cover' | 'contain') => {
    if (layer.type === 'text') return;
    const k = canvasScale(layer.width, layer.height, mode, canvas);
    const next = { ...layer, rotation: 0, scaleX: k, scaleY: k };
    up({ rotation: 0, scaleX: k, scaleY: k, ...originForCenter(next, { x: canvas.w / 2, y: canvas.h / 2 }) });
  };

  return (
    <Section
      title="Arrange"
      action={
        <div className="flex">
          <IconBtn tip="Centre horizontally" disabled={layer.locked} onClick={() => moveCenter({ x: canvas.w / 2, y: center.y })}>
            <AlignHorizontalJustifyCenter size={15} />
          </IconBtn>
          <IconBtn tip="Centre vertically" disabled={layer.locked} onClick={() => moveCenter({ x: center.x, y: canvas.h / 2 })}>
            <AlignVerticalJustifyCenter size={15} />
          </IconBtn>
          {layer.type !== 'text' && (
            <>
              <IconBtn tip="Fit inside canvas" disabled={layer.locked} onClick={() => fitCanvas('contain')}>
                <Shrink size={15} />
              </IconBtn>
              <IconBtn tip="Fill canvas" side="left" disabled={layer.locked} onClick={() => fitCanvas('cover')}>
                <Expand size={15} />
              </IconBtn>
            </>
          )}
          {layer.type === 'image' && (
            <IconBtn
              side="left"
              tip={prot ? 'Originals cannot be mirrored while locked' : 'Flip horizontally'}
              disabled={prot || layer.locked}
              aria-pressed={layer.flipX}
              onClick={() => up({ flipX: !layer.flipX })}
            >
              <FlipHorizontal2 size={15} />
            </IconBtn>
          )}
        </div>
      }
    >
      {layer.locked && <p className="note is-warn">Pinned in place. Unpin the layer in the list to move it.</p>}
      <div className="grid grid-cols-2 gap-2">
        <Field label="X">
          <input type="number" className="finput tabular-nums text-xs" value={Math.round(layer.x)} disabled={layer.locked} onChange={(e) => up({ x: Number(e.target.value) || 0 }, 'x')} />
        </Field>
        <Field label="Y">
          <input type="number" className="finput tabular-nums text-xs" value={Math.round(layer.y)} disabled={layer.locked} onChange={(e) => up({ y: Number(e.target.value) || 0 }, 'y')} />
        </Field>
      </div>
      <p className="tabular-nums text-xs text-ui-dim">
        W {Math.round(size.w)} · H {Math.round(size.h)} px
      </p>
      {layer.type === 'image' && (
        <Num label="Scale" unit="%" min={2} max={400} value={Math.abs(layer.scaleX) * 100} disabled={layer.locked} onChange={setScale} />
      )}
      <Num label="Rotation" unit="°" min={-180} max={180} value={layer.rotation > 180 ? layer.rotation - 360 : layer.rotation} disabled={layer.locked} onChange={setRotation} />
      <Num
        label="Opacity"
        unit="%"
        min={0}
        max={100}
        value={layer.opacity * 100}
        disabled={prot}
        onChange={(v) => up({ opacity: v / 100 }, 'opacity')}
      />
      {prot && s.lockOriginals && <p className="text-xs text-ui-dim">Opacity and mirroring stay fixed on protected originals.</p>}
    </Section>
  );
}

function TextSection({ layer, up }: { layer: Extract<Layer, { type: 'text' }>; up: Up }) {
  const s = useStudio();
  return (
    <Section title="Text">
      <textarea
        ref={s.textInputRef}
        aria-label="Text content"
        rows={3}
        className="finput resize-y text-sm leading-snug"
        value={layer.text}
        placeholder="Type your title"
        onChange={(e) => up({ text: e.target.value }, 'text')}
      />
      <Field label="Font">
        <select className="finput" value={layer.font} onChange={(e) => up({ font: e.target.value })}>
          {EDITOR_FONTS.map((f) => (
            <option key={f.key} value={f.key} style={{ fontFamily: f.family }}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
      <Num label="Size" unit="px" min={12} max={600} value={layer.fontSize} onChange={(v) => up({ fontSize: v }, 'fontSize')} />
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Seg<TextAlign>
          label="Alignment"
          value={layer.align}
          onChange={(align) => up({ align })}
          options={[
            { value: 'left', label: <TextAlignStart size={14} />, tip: 'Align left' },
            { value: 'center', label: <TextAlignCenter size={14} />, tip: 'Align centre' },
            { value: 'right', label: <TextAlignEnd size={14} />, tip: 'Align right' },
          ]}
        />
        <button type="button" className="ebtn tabular-nums text-xs" aria-pressed={layer.uppercase} title="All caps" onClick={() => up({ uppercase: !layer.uppercase })}>
          AA
        </button>
      </div>
      <Color label="Fill colour" value={layer.fill} onChange={(fill) => up({ fill }, 'fill')} />
      <Num label="Outline width" unit="px" min={0} max={40} value={layer.strokeWidth} onChange={(v) => up({ strokeWidth: v }, 'strokeWidth')} />
      <Color label="Outline colour" value={layer.stroke} disabled={layer.strokeWidth === 0} onChange={(stroke) => up({ stroke }, 'stroke')} />
      <details className="more">
        <summary>Spacing</summary>
        <div className="grid gap-3 pt-3">
          <Num label="Letter spacing" unit="px" min={-20} max={60} value={layer.letterSpacing} onChange={(v) => up({ letterSpacing: v }, 'letterSpacing')} />
          <Num label="Line height" min={0.7} max={2} step={0.05} value={layer.lineHeight} onChange={(v) => up({ lineHeight: v }, 'lineHeight')} />
        </div>
      </details>
      <Num label="Curve" min={-100} max={100} value={layer.curve ?? 0} onChange={(curve) => up({ curve: Math.abs(curve) < 2 ? undefined : curve }, 'curve')} />
      {!!layer.curve && <p className="text-xs leading-relaxed text-ui-dim">Curved text stays on one line.</p>}
    </Section>
  );
}

/** A box behind the words, and a second outline around them: what turns lettering into a button or a tag. */
function TextExtras({ layer, up }: { layer: Extract<Layer, { type: 'text' }>; up: Up }) {
  const plate = layer.plate ?? { enabled: false, color: '#1F2633', radius: Math.round(layer.fontSize * 0.28), padX: Math.round(layer.fontSize * 0.36), padY: Math.round(layer.fontSize * 0.16), stroke: '#0B0D12', strokeWidth: Math.round(layer.fontSize * 0.06) };
  const second = layer.stroke2 ?? { enabled: false, color: '#FFFFFF', width: Math.max(4, Math.round(layer.fontSize * 0.05)) };
  return (
    <>
      <Section title="Plate" action={<Toggle label="Plate" checked={plate.enabled} onChange={(enabled) => up({ plate: { ...plate, enabled } })} />}>
        {plate.enabled && (
          <>
            <Color label="Colour" value={plate.color} onChange={(color) => up({ plate: { ...plate, color } }, 'plateColor')} />
            <Num label="Roundness" unit="px" min={0} max={200} value={plate.radius} onChange={(radius) => up({ plate: { ...plate, radius } }, 'plateRadius')} />
            <Num label="Space at the sides" unit="px" min={0} max={240} value={plate.padX} onChange={(padX) => up({ plate: { ...plate, padX } }, 'platePadX')} />
            <Num label="Space above and below" unit="px" min={0} max={160} value={plate.padY} onChange={(padY) => up({ plate: { ...plate, padY } }, 'platePadY')} />
            <Num label="Border" unit="px" min={0} max={40} value={plate.strokeWidth} onChange={(strokeWidth) => up({ plate: { ...plate, strokeWidth } }, 'plateStroke')} />
            <Color label="Border colour" value={plate.stroke} disabled={plate.strokeWidth === 0} onChange={(stroke) => up({ plate: { ...plate, stroke } }, 'plateStrokeColor')} />
          </>
        )}
      </Section>
      <Section title="Second outline" action={<Toggle label="Second outline" checked={second.enabled} onChange={(enabled) => up({ stroke2: { ...second, enabled } })} />}>
        {second.enabled && (
          <>
            <Color label="Colour" value={second.color} onChange={(color) => up({ stroke2: { ...second, color } }, 'stroke2Color')} />
            <Num label="Width" unit="px" min={1} max={40} value={second.width} onChange={(width) => up({ stroke2: { ...second, width } }, 'stroke2Width')} />
          </>
        )}
      </Section>
    </>
  );
}

function ShapeSection({ layer, up }: { layer: ShapeLayer; up: Up }) {
  const def = shapeOf(layer.shape);
  return (
    <Section title="Shape">
      <Field label="Shape">
        <select className="finput" value={layer.shape} onChange={(e) => up({ shape: e.target.value })}>
          {SHAPES.map((sh) => (
            <option key={sh.id} value={sh.id}>
              {sh.group} · {sh.label}
            </option>
          ))}
        </select>
      </Field>
      {def.kind === 'widget' && (
        <>
          {layer.shape === 'bar' && (
            <>
              <Num label="How full" unit="%" min={0} max={100} value={layer.value ?? 70} onChange={(value) => up({ value }, 'value')} />
              <Color label="Filled colour" value={layer.fill || '#3DDC4B'} onChange={(fill) => up({ fill }, 'fill')} />
              <Color label="Left over colour" value={layer.fill2 ?? '#E5352B'} onChange={(fill2) => up({ fill2 }, 'fill2')} />
            </>
          )}
          {(layer.shape === 'sunrays' || layer.shape === 'speedlines') && (
            <Num label={layer.shape === 'sunrays' ? 'Rays' : 'Lines'} min={layer.shape === 'sunrays' ? 4 : 8} max={layer.shape === 'sunrays' ? 40 : 200} value={layer.value ?? (layer.shape === 'sunrays' ? 12 : 70)} onChange={(value) => up({ value }, 'value')} />
          )}
          {TWO_TONE[layer.shape] && (
            <>
              <Color label={TWO_TONE[layer.shape][0]} value={layer.fill || '#000000'} onChange={(fill) => up({ fill }, 'fill')} />
              <Color label={TWO_TONE[layer.shape][1]} value={layer.fill2 ?? TWO_TONE[layer.shape][2]} onChange={(fill2) => up({ fill2 }, 'fill2')} />
            </>
          )}
          {layer.shape !== 'bar' && !TWO_TONE[layer.shape] && (
            <>
              <Color label={layer.shape === 'key-ring' ? 'Ring colour' : 'Colour'} value={layer.fill || '#FFFFFF'} onChange={(fill) => up({ fill }, 'fill')} />
              {(layer.shape === 'button' || layer.shape === 'keycap') && <Color label="Lower colour" value={layer.fill2 ?? layer.fill} onChange={(fill2) => up({ fill2 }, 'fill2')} />}
            </>
          )}
          {(layer.shape === 'bar' || layer.shape === 'button') && (
            <label className="protect-toggle">
              <input type="checkbox" checked={layer.shape === 'bar' ? layer.studs !== false : !!layer.studs} onChange={(e) => up({ studs: e.target.checked })} /> Roblox studs
            </label>
          )}
          {!SOFT.has(layer.shape) && (
            <label className="protect-toggle">
              <input type="checkbox" checked={!!layer.gloss} onChange={(e) => up({ gloss: e.target.checked })} /> Shine
            </label>
          )}
        </>
      )}
      {def.kind !== 'widget' && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-ui-fg">Fill</span>
          <Toggle label="Fill" checked={!!layer.fill} onChange={(on) => up({ fill: on ? '#FFFFFF' : '', fill2: undefined, ...(on || layer.strokeWidth > 0 ? {} : { strokeWidth: 12 }) })} />
        </div>
      )}
      {def.kind !== 'widget' && layer.fill && (
        <>
          <Color label="Fill colour" value={layer.fill} onChange={(fill) => up({ fill }, 'fill')} />
          <label className="protect-toggle">
            <input type="checkbox" checked={!!layer.fill2} onChange={(e) => up({ fill2: e.target.checked ? '#FF9D1C' : undefined })} /> Fade to a second colour
          </label>
          {layer.fill2 && <Color label="Bottom colour" value={layer.fill2} onChange={(fill2) => up({ fill2 }, 'fill2')} />}
        </>
      )}
      {/* An effect is only light or shade: it has no edge to outline and no corners to round. */}
      {!EFFECTS.has(layer.shape) && (
        <>
          <Num label="Outline width" unit="px" min={0} max={80} value={layer.strokeWidth} onChange={(v) => up({ strokeWidth: v }, 'strokeWidth')} />
          <Color label="Outline colour" value={layer.stroke} disabled={layer.strokeWidth === 0} onChange={(stroke) => up({ stroke }, 'stroke')} />
        </>
      )}
      {def.kind !== 'widget' && (
        <label className="protect-toggle">
          <input type="checkbox" checked={!!layer.flipX} onChange={(e) => up({ flipX: e.target.checked })} /> Flip left to right
        </label>
      )}
      {(def.kind === 'rect' || (def.kind === 'widget' && layer.shape !== 'key-ring' && !EFFECTS.has(layer.shape))) && <Num label="Roundness" unit="px" min={0} max={Math.round(Math.min(layer.width, layer.height) / 2)} value={Math.min(layer.radius ?? 0, Math.min(layer.width, layer.height) / 2)} onChange={(radius) => up({ radius }, 'radius')} />}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Width">
          <input type="number" className="finput tabular-nums text-xs" min={4} value={Math.round(layer.width)} onChange={(e) => up({ width: Math.max(4, Number(e.target.value) || 4) }, 'width')} />
        </Field>
        <Field label="Height">
          <input type="number" className="finput tabular-nums text-xs" min={4} value={Math.round(layer.height)} onChange={(e) => up({ height: Math.max(4, Number(e.target.value) || 4) }, 'height')} />
        </Field>
      </div>
    </Section>
  );
}

const NO_CROP = { left: 0, top: 0, right: 0, bottom: 0 };
const NO_ADJUST = { blur: 0, brightness: 100, saturation: 100 };

/** Trimming, rounded corners and the blur that pushes a background back. None of it changes the stored file. */
function ImageLook({ layer, up }: { layer: ImageLayer; up: Up }) {
  const crop = layer.crop ?? NO_CROP;
  const adjust = layer.adjust ?? NO_ADJUST;
  // An untouched setting is stored as nothing at all, so the picture is drawn straight from its file.
  const setCrop = (side: keyof typeof NO_CROP, percent: number) => {
    const next = { ...crop, [side]: percent / 100 };
    up({ crop: Object.values(next).some((v) => v > 0) ? next : undefined }, `crop-${side}`);
  };
  const setAdjust = (patch: Partial<typeof NO_ADJUST>, key: string) => {
    const next = { ...adjust, ...patch };
    up({ adjust: next.blur === 0 && next.brightness === 100 && next.saturation === 100 ? undefined : next }, key);
  };
  const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' } as const;
  return (
    <>
      <Section title="Crop and corners">
        {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
          <Num key={side} label={`Trim ${side}`} unit="%" min={0} max={Math.floor(90 - crop[opposite[side]] * 100)} value={crop[side] * 100} onChange={(v) => setCrop(side, v)} />
        ))}
        <Num label="Round corners" unit="%" min={0} max={50} value={layer.corner ?? 0} onChange={(corner) => up({ corner: corner || undefined }, 'corner')} />
        <p className="text-xs leading-relaxed text-ui-dim">At 50% a square picture becomes a circle.</p>
      </Section>
      <Section title="Adjust">
        <Num label="Blur" unit="px" min={0} max={60} value={adjust.blur} onChange={(blur) => setAdjust({ blur }, 'blur')} />
        <Num label="Brightness" unit="%" min={20} max={180} value={adjust.brightness} onChange={(brightness) => setAdjust({ brightness }, 'brightness')} />
        <Num label="Colour strength" unit="%" min={0} max={200} value={adjust.saturation} onChange={(saturation) => setAdjust({ saturation }, 'saturation')} />
      </Section>
    </>
  );
}

function ImageSection({ layer, up, prot }: { layer: ImageLayer; up: Up; prot: boolean }) {
  const s = useStudio();
  const asset = useAsset(layer.assetId);
  const fileRef = useRef<HTMLInputElement>(null);
  const record = asset && asset !== 'missing' ? asset.record : null;

  return (
    <Section title="Image">
      {asset === 'missing' && <p className="note is-error">The source file for this layer is no longer in this browser&apos;s storage. Replace the image to fix it.</p>}
      {record && (
        <p className="break-all text-xs leading-relaxed text-ui-dim">
          {record.name}
          <br />
          {record.width} × {record.height} px · {record.hasAlpha ? 'transparent background' : 'no transparency'}
        </p>
      )}
      {record && layer.role === 'character' && !record.hasAlpha && (
        <p className="note is-warn">This file has a solid background, so it shows as a rectangle. Remove the background to keep only the subject.</p>
      )}
      {!layer.arrow && (
        <button type="button" className="ebtn w-full" disabled={!record || !!s.cutting} aria-busy={s.cutting === layer.id} title="Keeps the subject and makes the rest see-through. Runs in this browser; the image is not uploaded." onClick={() => void s.cutout(layer.id)}>
          {s.cutting === layer.id ? <><i className="spinner" /> {s.cutStatus}</> : <><Eraser size={14} /> Remove background</>}
        </button>
      )}

      <Field label="Used as">
        <select className="finput" value={layer.role} disabled={prot} onChange={(e) => up({ role: e.target.value as ImageRole })}>
          <option value="character">Character or game asset</option>
          <option value="background">Background</option>
          <option value="image">Other image</option>
        </select>
      </Field>

      <div className="flex items-start gap-2.5 rounded-lg border border-ui-line bg-char p-2.5">
        <ShieldCheck size={16} className={`mt-0.5 flex-none ${prot ? 'text-warn' : 'text-ui-dim'}`} />
        <div className="grid flex-1 gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] text-ui-fg">Protect source</span>
            <Toggle label="Mark as original asset" checked={layer.original} disabled={prot} onChange={(original) => up({ original })} />
          </div>
          <p className="text-xs leading-relaxed text-ui-dim">
            {prot
              ? 'The uploaded pixels are protected: no delete, replace, mirror, stretch or fade. Moving, resizing and rotating still work.'
              : layer.original
                ? 'Marked as an original, but Protect originals is off in the top bar, so every edit is allowed.'
                : 'Not protected. Turn this on to guard the image whenever Protect originals is on.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="ebtn"
          disabled={prot}
          title={prot ? 'Turn off Protect originals to replace this image' : 'Swap the picture and keep position, size and effects'}
          onClick={() => fileRef.current?.click()}
        >
          <Replace size={14} /> Replace
        </button>
        <button type="button" className="ebtn" disabled={!record} title="Download the exact file you uploaded" onClick={() => record && downloadBlob(record.blob, record.name)}>
          <Download size={14} /> Original file
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) s.replaceImage(layer.id, file);
          e.target.value = '';
        }}
      />
    </Section>
  );
}

function Effects({ layer, up }: { layer: Layer; up: Up }) {
  const { shadow, glow } = layer;
  const outline: Outline | null = layer.type === 'image' ? (layer.outline ?? NO_OUTLINE) : null;
  return (
    <>
      {outline && (
        <Section title="Outline" action={<Toggle label="Outline" checked={outline.enabled} onChange={(enabled) => up({ outline: { ...outline, enabled } })} />}>
          {outline.enabled && (
            <>
              <Color label="Colour" value={outline.color} onChange={(color) => up({ outline: { ...outline, color } }, 'outlineColor')} />
              <Num label="Width" unit="px" min={2} max={60} value={outline.width} onChange={(width) => up({ outline: { ...outline, width } }, 'outlineWidth')} />
              <p className="text-xs leading-relaxed text-ui-dim">Follows the picture&apos;s own shape, so it needs a see-through background.</p>
            </>
          )}
        </Section>
      )}
      <Section title="Shadow" action={<Toggle label="Shadow" checked={shadow.enabled} onChange={(enabled) => up({ shadow: { ...shadow, enabled } })} />}>
        {shadow.enabled && (
          <>
            <Color label="Colour" value={shadow.color} onChange={(color) => up({ shadow: { ...shadow, color } }, 'shadowColor')} />
            <Num label="Blur" unit="px" min={0} max={120} value={shadow.blur} onChange={(blur) => up({ shadow: { ...shadow, blur } }, 'shadowBlur')} />
            <Num label="Offset X" unit="px" min={-100} max={100} value={shadow.offsetX} onChange={(offsetX) => up({ shadow: { ...shadow, offsetX } }, 'shadowX')} />
            <Num label="Offset Y" unit="px" min={-100} max={100} value={shadow.offsetY} onChange={(offsetY) => up({ shadow: { ...shadow, offsetY } }, 'shadowY')} />
            <Num label="Strength" unit="%" min={0} max={100} value={shadow.opacity * 100} onChange={(v) => up({ shadow: { ...shadow, opacity: v / 100 } }, 'shadowOpacity')} />
          </>
        )}
      </Section>
      <Section title="Glow" action={<Toggle label="Glow" checked={glow.enabled} onChange={(enabled) => up({ glow: { ...glow, enabled } })} />}>
        {glow.enabled && (
          <>
            <Color label="Colour" value={glow.color} onChange={(color) => up({ glow: { ...glow, color } }, 'glowColor')} />
            <Num label="Size" unit="px" min={0} max={160} value={glow.blur} onChange={(blur) => up({ glow: { ...glow, blur } }, 'glowBlur')} />
            <Num label="Intensity" min={1} max={3} value={glow.strength} onChange={(strength) => up({ glow: { ...glow, strength } }, 'glowStrength')} />
          </>
        )}
      </Section>
    </>
  );
}

export default function Inspector() {
  const s = useStudio();
  const layer = s.selected;
  if (!layer) return <CanvasSettings />;

  const prot = s.isProtected(layer);
  const up: Up = (patch, key) => s.update(layer.id, patch, key ? `${layer.id}:${key}` : undefined);

  return (
    <>
      {s.selectionIds.length > 1 && (
        <Section title={layer.groupId ? 'Group' : `${s.selectionIds.length} layers selected`}>
          <p className="text-xs leading-relaxed text-ui-dim">They move, resize, copy and delete together. The settings below are for the one you clicked.</p>
          <div className="align-row" role="group" aria-label="Align">
            {ALIGNS.map((a) => (
              <IconBtn key={a.mode} tip={a.tip} side="top" onClick={() => s.align(a.mode)}>
                <a.icon size={15} />
              </IconBtn>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {layer.groupId ? <button type="button" className="ebtn" onClick={s.ungroup}>Ungroup</button> : <button type="button" className="ebtn" onClick={s.group}>Group</button>}
            <button type="button" className="ebtn" onClick={s.savePiece}>Save to My kit</button>
          </div>
        </Section>
      )}
      {layer.type === 'text' && <TextSection layer={layer} up={up} />}
      {layer.type === 'text' && <TextExtras layer={layer} up={up} />}
      {layer.type === 'shape' && <ShapeSection layer={layer} up={up} />}
      {layer.type === 'image' && <ImageSection layer={layer} up={up} prot={prot} />}
      {layer.type === 'image' && !layer.arrow && <ImageLook layer={layer} up={up} />}
      {layer.type === 'light' && (
        <Section title="Light">
          <Color label="Colour" value={layer.color} onChange={(color) => up({ color }, 'color')} />
          <Field label="Blend">
            <select className="finput" value={layer.blend} onChange={(e) => up({ blend: e.target.value as Blend })}>
              {BLENDS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs leading-relaxed text-ui-dim">Pull any handle to stretch the light. Place it behind a character for rim light, or in front for a haze.</p>
        </Section>
      )}
      <Arrange layer={layer} up={up} prot={prot} />
      {layer.type !== 'light' && <Effects layer={layer} up={up} />}
    </>
  );
}
