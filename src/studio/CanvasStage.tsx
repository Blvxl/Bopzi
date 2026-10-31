'use client';

import Konva from 'konva';
import { ImagePlus, Sparkles, History } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Group, Layer as KLayer, Rect, Stage, Transformer } from 'react-konva';
import { ACCEPT_ATTR, useAsset } from '@/lib/assets';
import { fontOf } from '@/lib/fonts';
import { canvasOf, type ImageLayer, type TextLayer } from '@/lib/types';
import { layerSize } from './geometry';
import { useStudio, type Region } from './context';
import GenerationStatus from './GenerationStatus';
import LayerNode from './LayerNode';

export type Zoom = 'fit' | number;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export type CanvasHandle = {
  /** Renders the artboard (no handles or guides) at `outWidth` pixels wide. */
  toCanvas: (outWidth: number, omitIds?: string[]) => HTMLCanvasElement | null;
  /** Lets the given layers land one after another: a short drop and settle each. Does nothing under reduced motion. */
  animateIn: (ids: string[]) => void;
};

type Props = { zoom: Zoom; guides: boolean; onScale: (scale: number) => void; onOpenPrompt: () => void };

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

const CanvasStage = forwardRef<CanvasHandle, Props>(function CanvasStage({ zoom, guides, onScale, onOpenPrompt }, ref) {
  const s = useStudio();
  const { w: CW, h: CH } = canvasOf(s.doc);
  const current = s.doc.layers.find((l): l is ImageLayer => l.type === 'image' && l.name === 'AI thumbnail' && l.visible);
  const conceptId = current && (current.conceptId ?? current.id);
  const original = s.doc.layers.find((l): l is ImageLayer => l.type === 'image' && l.name === 'AI thumbnail' && (l.conceptId ?? l.id) === conceptId);
  const changed = !!current && (current.id !== original?.id || s.doc.layers.some(l => l.type !== 'image' || l.name !== 'AI thumbnail'));
  const beforeAsset = useAsset(original?.assetId);
  const currentAsset = useAsset(current?.assetId);
  const previousFrame = useRef<{ id: string; image: HTMLCanvasElement } | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fadingFrame, setFadingFrame] = useState<string | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const generating = s.generation && s.generation.phase !== 'ready' && s.generation.phase !== 'failed';
  const canPreview = !!beforeAsset && beforeAsset !== 'missing' && !generating && !s.arranging && !s.marking && !s.editingText;
  useEffect(() => setShowBefore(false), [current?.id, original?.assetId, canPreview]);
  useEffect(() => {
    if (!showBefore) return;
    const stop = () => setShowBefore(false);
    window.addEventListener('blur', stop);
    window.addEventListener('pointerup', stop);
    document.addEventListener('visibilitychange', stop);
    return () => { window.removeEventListener('blur', stop); window.removeEventListener('pointerup', stop); document.removeEventListener('visibilitychange', stop); };
  }, [showBefore]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Konva.Layer>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const overRef = useRef<Konva.Layer>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [dragOver, setDragOver] = useState(false);
  // The box while it is being dragged, and where the drag began.
  const [draft, setDraft] = useState<Region | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const measure = () => setView({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Room around the artboard for the transform handles.
  const margin = view.w < 640 ? 18 : 24;
  const footerSpace = s.generation && view.w >= 640 ? 52 : 0;
  const rawFit = Math.min((view.w - margin * 2) / CW, (view.h - margin * 2 - footerSpace) / CH);
  // Whole 16 × 9 blocks keep both canvas edges on pixels, at the original aspect ratio.
  const fit = Math.max(0.05, Math.floor(rawFit * 120) / 120);
  const scale = zoom === 'fit' ? fit : zoom;
  const artW = CW * scale;
  const artH = CH * scale;

  useLayoutEffect(() => {
    if (!current || !currentAsset || currentAsset === 'missing' || !artRef.current || artW <= 0 || artH <= 0) {
      if (!current) { previousFrame.current = null; setFadingFrame(null); }
      return;
    }
    // The transition is a display overlay; exports always use the live Konva artboard.
    try {
      const previous = previousFrame.current;
      if (previous && previous.id !== current.id) {
        if (fadeTimer.current) clearTimeout(fadeTimer.current);
        if (!generating && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          setFadingFrame(previous.image.toDataURL());
          fadeTimer.current = setTimeout(() => setFadingFrame(null), 180);
        } else setFadingFrame(null);
      }
      artRef.current.draw();
      previousFrame.current = { id: current.id, image: artRef.current.toCanvas({ x: margin, y: margin, width: artW, height: artH, pixelRatio: 1 }) };
    } catch { previousFrame.current = null; setFadingFrame(null); }
  }, [current?.id, currentAsset, s.doc, margin, artW, artH, generating]);
  useEffect(() => () => { if (fadeTimer.current) clearTimeout(fadeTimer.current); }, []);

  useEffect(() => onScale(scale), [scale, onScale]);

  useImperativeHandle(
    ref,
    () => ({
      toCanvas(outWidth, omitIds = []) {
        const art = artRef.current;
        if (!art) return null;
        const outHeight = Math.round((outWidth * CH) / CW);
        const hidden = omitIds.flatMap(id => { const node = art.findOne(`#${id}`); return node ? [{ node, visible: node.visible() }] : []; });
        let raw: HTMLCanvasElement;
        try {
          hidden.forEach(({ node }) => node.visible(false));
          art.draw();
          raw = art.toCanvas({ x: margin, y: margin, width: artW, height: artH, pixelRatio: outWidth / artW });
        } finally { hidden.forEach(({ node, visible }) => node.visible(visible)); art.draw(); }
        // Redraw into an exactly sized canvas so rounding never costs a pixel.
        const out = document.createElement('canvas');
        out.width = outWidth;
        out.height = outHeight;
        out.getContext('2d')!.drawImage(raw, 0, 0, outWidth, outHeight);
        return out;
      },
      animateIn(ids) {
        const art = artRef.current;
        if (!art || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        ids.forEach((id, i) => {
          const node = art.findOne(`#${id}`);
          if (!node) return;
          const to = { opacity: node.opacity(), y: node.y() };
          node.opacity(0);
          node.y(to.y - 54);
          setTimeout(() => node.to({ ...to, duration: 0.42, easing: Konva.Easings.BackEaseOut }), 60 + i * 150);
        });
        art.batchDraw();
      },
    }),
    [margin, artW, artH, CW, CH],
  );

  const selected = s.selected;
  const transformable = selected && selected.visible && !selected.locked ? selected : null;
  const many = s.selectionIds.length > 1;

  // Keep the handles on the selected node after every render (moves, font loads, zoom).
  useEffect(() => {
    const tr = trRef.current;
    const art = artRef.current;
    if (!tr || !art) return;
    // Every selected layer that can move takes the handles, so a group resizes and turns as one.
    const ids = transformable ? s.selectionIds.filter((id) => { const l = s.doc.layers.find((x) => x.id === id); return !!l && l.visible && !l.locked; }) : [];
    tr.nodes(ids.flatMap((id) => { const node = art.findOne(`#${id}`); return node ? [node] : []; }));
    tr.forceUpdate();
    tr.getLayer()?.batchDraw();
  });

  // ---- snapping: while a layer is dragged its edges and centre catch on the canvas and on the other layers
  const clearGuides = () => {
    const over = overRef.current;
    if (!over) return;
    over.find('.snap').forEach((n) => n.destroy());
    over.batchDraw();
  };
  const snap = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target, art = artRef.current, over = overRef.current;
    if (!art || !over || !node.id()) return;
    over.find('.snap').forEach((n) => n.destroy());
    // Alt lets a layer move freely.
    if (e.evt?.altKey) { over.batchDraw(); return; }
    const measure = (n: Konva.Node) => n.getClientRect({ relativeTo: art, skipShadow: true });
    // Snap the selection's combined bounds, then translate every member by the same amount.
    // Kit pieces remain grouped and keep their internal spacing while catching alignment lines.
    const moving = many && s.selectionIds.includes(node.id())
      ? s.selectionIds.flatMap(id => {
          const layer = s.doc.layers.find(l => l.id === id);
          const member = art.findOne(`#${id}`);
          return member && layer?.visible && !layer.locked ? [member] : [];
        })
      : [node];
    if (!moving.length) return;
    const movingIds = new Set(moving.map(member => member.id()));
    const bounds = moving.map(measure);
    const left = Math.min(...bounds.map(r => r.x)), top = Math.min(...bounds.map(r => r.y));
    const right = Math.max(...bounds.map(r => r.x + r.width)), bottom = Math.max(...bounds.map(r => r.y + r.height));
    const box = { x: left, y: top, width: right - left, height: bottom - top };
    const xs = [0, CW / 2, CW], ys = [0, CH / 2, CH];
    node.getParent()?.getChildren().forEach((other) => {
      if (movingIds.has(other.id()) || !other.id() || !other.visible()) return;
      const r = measure(other);
      // Something that fills the canvas adds nothing the canvas lines do not already give.
      if (r.width >= CW * 0.97 && r.height >= CH * 0.97) return;
      xs.push(r.x, r.x + r.width / 2, r.x + r.width);
      ys.push(r.y, r.y + r.height / 2, r.y + r.height);
    });
    const reach = 7 / scale;
    const nearest = (points: number[], lines: number[]) => {
      let best: { shift: number; line: number } | null = null;
      for (const p of points) for (const line of lines) if (Math.abs(line - p) < reach && (!best || Math.abs(line - p) < Math.abs(best.shift))) best = { shift: line - p, line };
      return best;
    };
    const sx = nearest([box.x, box.x + box.width / 2, box.x + box.width], xs);
    const sy = nearest([box.y, box.y + box.height / 2, box.y + box.height], ys);
    moving.forEach(member => {
      if (sx) member.x(member.x() + sx.shift);
      if (sy) member.y(member.y() + sy.shift);
    });
    const line = (points: number[], centre: boolean) => over.add(new Konva.Line({ name: 'snap', points, stroke: centre ? '#3ECF8E' : '#FF4FA3', strokeWidth: 1, listening: false }));
    if (sx) line([margin + sx.line * scale, margin, margin + sx.line * scale, margin + artH], sx.line === CW / 2);
    if (sy) line([margin, margin + sy.line * scale, margin + artW, margin + sy.line * scale], sy.line === CH / 2);
    over.batchDraw();
  };

  // ---- right-click on a layer: the things done to one layer, where the pointer already is
  const [layerMenu, setLayerMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const menuLayer = layerMenu ? s.doc.layers.find((l) => l.id === layerMenu.id) : undefined;
  useEffect(() => {
    if (!layerMenu) return;
    const close = () => setLayerMenu(null);
    const away = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest?.('.layer-menu')) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); window.removeEventListener('resize', close); window.removeEventListener('blur', close); };
  }, [layerMenu]);
  const menuItems = (l: NonNullable<typeof menuLayer>) => {
    const at = s.doc.layers.findIndex((x) => x.id === l.id);
    const prot = s.isProtected(l);
    const picture = l.type === 'image' && !l.arrow ? l : null;
    return [
      { label: 'Copy', keys: 'Ctrl C', run: () => s.copyLayer(l.id) },
      { label: 'Duplicate', keys: 'Ctrl D', run: () => s.duplicate(l.id) },
      { label: 'Bring forward', keys: 'Ctrl ]', disabled: at === s.doc.layers.length - 1, run: () => s.reorder(l.id, at + 1) },
      { label: 'Send backward', keys: 'Ctrl [', disabled: at === 0, run: () => s.reorder(l.id, at - 1) },
      { label: 'Pin in place', run: () => s.update(l.id, { locked: true }) },
      ...(s.selectionIds.length > 1 && !l.groupId ? [{ label: 'Group', keys: 'Ctrl G', run: () => s.group() }] : []),
      ...(l.groupId ? [{ label: 'Ungroup', keys: 'Ctrl Shift G', run: () => s.ungroup() }] : []),
      ...(l.type !== 'image' ? [{ label: 'Save to My kit', run: () => s.savePiece() }] : []),
      ...(picture ? [
        { label: picture.outline?.enabled ? 'Remove outline' : 'Add outline', run: () => s.update(l.id, { outline: { color: '#FFFFFF', width: 14, ...picture.outline, enabled: !picture.outline?.enabled } }) },
        { label: 'Remove background', disabled: !!s.cutting, run: () => void s.cutout(l.id) },
      ] : []),
      ...(l.type === 'text' ? [{ label: 'Edit text', run: () => s.editText(l.id) }] : []),
      { label: 'Delete', keys: 'Del', disabled: prot, danger: true, run: () => s.remove(l.id) },
    ];
  };

  const typing = s.editingText ? (s.doc.layers.find((l) => l.id === s.editingText && l.type === 'text') as TextLayer | undefined) : undefined;
  // A group keeps its proportions; one light, shape or unprotected picture can be stretched from its sides.
  const stretchable = !many && (transformable?.type === 'light' || transformable?.type === 'shape' || (transformable?.type === 'image' && !s.isProtected(transformable)));
  const empty = s.doc.layers.length === 0;

  return (
    <div
      ref={wrapRef}
      className="canvas-wrap relative flex h-[62vw] max-h-[70dvh] min-h-[230px] min-w-0 overflow-auto lg:h-auto lg:max-h-none lg:min-h-0"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        s.addFiles(Array.from(e.dataTransfer.files), 'auto');
      }}
    >
      {view.w > 0 && (
        <div className="relative m-auto shrink-0" style={{ width: artW + margin * 2, height: artH + margin * 2 + footerSpace }}>
          <div className="artboard-shadow pointer-events-none absolute" style={{ left: margin, top: margin, width: artW, height: artH }} />
          <Stage
            width={artW + margin * 2}
            height={artH + margin * 2}
            onMouseDown={(e) => {
              if (e.target === e.target.getStage() || e.target.name() === 'artboard') s.select(null);
            }}
            onTouchStart={(e) => {
              if (e.target === e.target.getStage() || e.target.name() === 'artboard') s.select(null);
            }}
            onDragMove={snap}
            onDragEnd={clearGuides}
          >
            <KLayer ref={artRef} x={margin} y={margin} scaleX={scale} scaleY={scale}>
              <Rect name="artboard" width={CW} height={CH} fill={s.doc.background} />
              <Group clipX={0} clipY={0} clipWidth={CW} clipHeight={CH}>
                {s.doc.layers.map((layer) => (
                  <LayerNode
                    key={layer.id}
                    layer={layer}
                    fontsVersion={s.fontsVersion}
                    onSelect={s.select}
                    // Moving several at once reports each one; a shared key makes that a single step to undo.
                    onCommit={(id, patch) => s.update(id, patch, many ? 'move-together' : undefined)}
                    onEditText={s.editText}
                    onMenu={(id, at) => setLayerMenu({ id, ...at })}
                  />
                ))}
              </Group>
            </KLayer>
            <KLayer ref={overRef}>
              <Transformer
                ref={trRef}
                flipEnabled={false}
                keepRatio={!stretchable}
                enabledAnchors={stretchable ? undefined : CORNERS}
                rotationSnaps={[0, 90, 180, 270]}
                rotationSnapTolerance={4}
                rotateAnchorOffset={28}
                anchorSize={11}
                anchorCornerRadius={2}
                anchorFill="#FFFFFF"
                anchorStroke="#5AA9FF"
                anchorStrokeWidth={1.5}
                borderStroke="#5AA9FF"
                borderStrokeWidth={1.5}
                ignoreStroke
                boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 12 || Math.abs(newBox.height) < 12 ? oldBox : newBox)}
              />
            </KLayer>
          </Stage>
          {(s.marking || s.region) && !empty && (
            // The area the next change is limited to. It only takes the pointer while a box is being drawn.
            <div
              className={`region-layer${s.marking ? ' is-marking' : ''}`}
              style={{ left: margin, top: margin, width: artW, height: artH }}
              onPointerDown={(e) => {
                if (!s.marking) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const b = e.currentTarget.getBoundingClientRect();
                origin.current = { x: clamp01((e.clientX - b.left) / b.width), y: clamp01((e.clientY - b.top) / b.height) };
                setDraft({ ...origin.current, w: 0, h: 0 });
              }}
              onPointerMove={(e) => {
                const o = origin.current;
                if (!o) return;
                const b = e.currentTarget.getBoundingClientRect();
                const x = clamp01((e.clientX - b.left) / b.width);
                const y = clamp01((e.clientY - b.top) / b.height);
                setDraft({ x: Math.min(o.x, x), y: Math.min(o.y, y), w: Math.abs(x - o.x), h: Math.abs(y - o.y) });
              }}
              onPointerUp={() => {
                if (!origin.current) return;
                origin.current = null;
                // A stray click is not a box.
                if (draft && draft.w >= 0.04 && draft.h >= 0.04) {
                  s.setRegion(draft);
                  s.setMarking(false);
                }
                setDraft(null);
              }}
              onPointerCancel={() => {
                origin.current = null;
                setDraft(null);
              }}
            >
              {(draft ?? s.region) && (
                <i style={{ left: `${(draft ?? s.region)!.x * 100}%`, top: `${(draft ?? s.region)!.y * 100}%`, width: `${(draft ?? s.region)!.w * 100}%`, height: `${(draft ?? s.region)!.h * 100}%` }} />
              )}
              {s.marking && !draft && <span>Drag a box over the part to change</span>}
            </div>
          )}
          {typing && (
            // Typing straight onto the canvas: the letters seen are the canvas's own, this only holds the caret.
            <textarea
              className="canvas-type"
              autoFocus
              spellCheck={false}
              aria-label="Text"
              value={typing.text}
              style={{
                left: margin + typing.x * scale,
                top: margin + typing.y * scale,
                width: Math.max(60, layerSize(typing).w * scale + 6),
                height: Math.max(typing.fontSize * scale, layerSize(typing).h * scale) + 4,
                fontSize: typing.fontSize * scale,
                lineHeight: typing.lineHeight,
                fontFamily: fontOf(typing.font).family,
                fontWeight: fontOf(typing.font).weight,
                letterSpacing: typing.letterSpacing * scale,
                textAlign: typing.align,
                textTransform: typing.uppercase ? 'uppercase' : 'none',
                transform: `rotate(${typing.rotation}deg)`,
              }}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => s.update(typing.id, { text: e.target.value }, `${typing.id}:text`)}
              onBlur={s.stopEditingText}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); e.currentTarget.blur(); }
              }}
            />
          )}
          {s.arranging && !empty && (
            <div className="arrange-scan" aria-hidden style={{ left: margin, top: margin, width: artW, height: artH }}><i /></div>
          )}
          {s.found && (
            <div className="arrange-found" aria-hidden style={{ left: margin, top: margin, width: artW, height: artH }}>
              {s.found.map((b, i) => <i key={i} style={{ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${b[2] * 100}%`, height: `${b[3] * 100}%`, animationDelay: `${i * 90}ms` }} />)}
            </div>
          )}
          {guides && !empty && !s.isIcon && (
            // Same margins the generator is asked to respect: the central 90%, and clear of the bottom 12%.
            <div className="safe-guides" aria-hidden style={{ left: margin, top: margin, width: artW, height: artH }}>
              <i />
              <b><span>Roblox may cover below this line</span></b>
            </div>
          )}
          <GenerationStatus frame={{ left: margin, top: margin, width: artW, height: artH }} inset={view.w < 640} hasArt={!empty} />
          {/* Sits on the artwork, and only when there is an earlier version to see. */}
          {changed && !generating && s.view !== 'edit' && <button type="button" className="before-control" style={{ left: margin + 12, top: margin + artH - 12 }} disabled={!canPreview} aria-label="Hold to see the first version" aria-pressed={showBefore} title="Hold to see the first version without added layers. Release to return to your edit." onPointerDown={e => { if (e.button !== 0 || !canPreview) return; e.currentTarget.setPointerCapture(e.pointerId); setShowBefore(true); }} onPointerUp={() => setShowBefore(false)} onPointerCancel={() => setShowBefore(false)} onLostPointerCapture={() => setShowBefore(false)} onBlur={() => setShowBefore(false)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setShowBefore(true); } if (e.key === 'Escape') setShowBefore(false); }} onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setShowBefore(false); } }}><History size={13}/>{showBefore ? 'First version' : 'Hold to compare'}</button>}
          {fadingFrame && !showBefore && <img key={current?.id} className="concept-crossfade" src={fadingFrame} alt="" aria-hidden draggable={false} style={{ left: margin, top: margin, width: artW, height: artH }} />}
          {showBefore && beforeAsset && beforeAsset !== 'missing' && <div className="before-preview" style={{ left: margin, top: margin, width: artW, height: artH, background: s.doc.background }}>
            <img src={beforeAsset.url} alt="The first version, before edits and added layers" draggable={false} />
            <span>First version</span>
          </div>}

          {empty && !s.generation && (
            // A quiet placeholder where the thumbnail will be, whatever colour the canvas itself is.
            <div className="canvas-empty" style={{ left: margin, top: margin, width: artW, height: artH }}>
              <p>Your {s.isIcon ? 'icon' : 'thumbnail'} appears here.</p>
              <span>
                {s.isIcon ? 'Start with a close-up: ' : s.view === 'edit' ? 'Start with the tools above, or ' : 'Describe it below, or '}
                <button type="button" onClick={() => fileRef.current?.click()}>
                  drop in your own images
                </button>
                .
              </span>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT_ATTR}
                multiple
                hidden
                onChange={(e) => {
                  s.addFiles(Array.from(e.target.files ?? []), 'auto');
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </div>
      )}

      {layerMenu && menuLayer && (
        <div className="layer-menu" role="menu" aria-label="Layer" style={{ left: Math.min(layerMenu.x, window.innerWidth - 216), top: Math.min(layerMenu.y, window.innerHeight - 330) }} onContextMenu={(e) => e.preventDefault()}>
          {menuItems(menuLayer).map((item) => (
            <button key={item.label} type="button" role="menuitem" className={'danger' in item && item.danger ? 'is-danger' : undefined} disabled={'disabled' in item && item.disabled} onClick={() => { setLayerMenu(null); item.run(); }}>
              {item.label}
              {'keys' in item && item.keys && <kbd>{item.keys}</kbd>}
            </button>
          ))}
        </div>
      )}
      {dragOver && (
        <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-xl border-2 border-dashed border-ui-focus bg-ui-focus/10">
          <span className="rounded-lg bg-ui-focus px-3 py-1.5 text-[13px] font-semibold text-ink">Drop to add as a layer</span>
        </div>
      )}
    </div>
  );
});

export default CanvasStage;
