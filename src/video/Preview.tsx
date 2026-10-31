'use client';
import { forwardRef, useEffect, useMemo, useImperativeHandle, useRef } from 'react';
import { visibleTimeline } from './editing';
import { drawScene } from './layers';
import { clipLength, dimensions, duration, positions, type Media, type Timeline } from './model';
import { drawFootage } from './footage';
import { drawBlurs } from './blur';
import { duckGain, fadeGain, soundCues } from './sfx';
import { soundUrl } from './sounds';
import { transitionAt } from './transitions';
import { pictureAt, speedAt } from './clip-motion';
import { drawVideoOverlay, footageArea, videoOverlaysAt, type VideoOverlay } from './pip';
export type PreviewHandle = { canvas: () => HTMLCanvasElement | null };
export default forwardRef<PreviewHandle, { timeline: Timeline; assets: Media[]; time: number; playing: boolean; onTime: (time: number) => void; onEnd: () => void; muted: boolean; quality?: number; proxies?: boolean; loop?: [number, number]; /** Draw the footage without zooms and shakes, for aiming a zoom on the full frame. */ steady?: boolean }>(function Preview({ timeline, assets, time, playing, onTime, onEnd, muted, steady = false, quality = 1, proxies = false, loop }, ref) {
  timeline = useMemo(() => visibleTimeline(timeline), [timeline]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const media = useRef(new Map<string, HTMLVideoElement | HTMLAudioElement | HTMLImageElement>()), cueFrom = useRef(0);
  const audioGraph = useRef<{ context: AudioContext; compressor: DynamicsCompressorNode; connected: WeakSet<HTMLMediaElement> } | null>(null);
  const latest = useRef({ timeline, time, playing, onTime, onEnd, muted, steady, quality, loop }); latest.current = { timeline, time, playing, onTime, onEnd, muted, steady, quality, loop };
  useImperativeHandle(ref, () => ({ canvas: () => canvas.current }));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.AudioContext) return;
    const context = new AudioContext(), compressor = context.createDynamicsCompressor();
    // A fast, gentle ceiling keeps stacked gameplay, music and effect sounds from clipping,
    // matching the export's final limiter while leaving normal levels alone.
    compressor.threshold.value = -1; compressor.knee.value = 0; compressor.ratio.value = 20;
    compressor.attack.value = .003; compressor.release.value = .1; compressor.connect(context.destination);
    audioGraph.current = { context, compressor, connected: new WeakSet() };
    return () => { audioGraph.current = null; void context.close().catch(() => {}); };
  }, []);
  useEffect(() => { const context = audioGraph.current?.context; if (playing) void context?.resume().catch(() => {}); else if (context?.state === 'running') void context.suspend().catch(() => {}); }, [playing]);
  const routeAudio = (el: HTMLMediaElement) => {
    const graph = audioGraph.current;
    if (!graph || graph.connected.has(el)) return;
    try { graph.context.createMediaElementSource(el).connect(graph.compressor); graph.connected.add(el); } catch { /* Keep native playback if a browser cannot route this element. */ }
  };
  useEffect(() => {
    // src reads back absolute; library URLs are written relative, and must not count as changed every render.
    const sameSrc = (el: { src: string }, url: string) => el.src === new URL(url, window.location.href).href;
    const nodes = media.current;
    // Reopening a project makes new object URLs for the same media and revokes the old ones, so a kept element follows.
    for (const a of assets.filter(a => a.kind !== 'audio')) { const kept = nodes.get(a.id), url = proxies && a.proxyUrl ? a.proxyUrl : a.url; if (kept && !sameSrc(kept, url)) kept.src = url; }
    for (const a of assets.filter(a => a.kind !== 'audio')) if (!nodes.has(a.id)) {
      const el = a.kind === 'image' ? new Image() : document.createElement(a.kind === 'video' ? 'video' : 'audio');
      if (el instanceof HTMLMediaElement) { el.preload = 'auto'; if (el instanceof HTMLVideoElement) el.playsInline = true; }
      el.src = proxies && a.proxyUrl ? a.proxyUrl : a.url; nodes.set(a.id, el); if (el instanceof HTMLMediaElement) routeAudio(el);
    }
    for (const audio of timeline.audio) { const kept = nodes.get(audio.id), asset = assets.find(a => a.id === audio.assetId); if (kept && asset && !sameSrc(kept, asset.url)) kept.src = asset.url; }
    for (const audio of timeline.audio) if (!nodes.has(audio.id)) { const asset = assets.find(a => a.id === audio.assetId); if (asset) { const el = document.createElement('audio'); el.preload = 'auto'; el.src = asset.url; nodes.set(audio.id, el); routeAudio(el); } }
    // A video on top gets its own element, so it can play another moment of the same file as the footage under it.
    const moving = timeline.videoOverlays.flatMap(o => { const asset = assets.find(a => a.id === o.assetId && a.kind === 'video'); return asset ? [{ id: o.id, url: proxies && asset.proxyUrl ? asset.proxyUrl : asset.url }] : []; });
    for (const o of moving) { const kept = nodes.get(o.id); if (kept) { if (!sameSrc(kept, o.url)) kept.src = o.url; continue; } const el = document.createElement('video'); el.preload = 'auto'; el.playsInline = true; el.src = o.url; nodes.set(o.id, el); routeAudio(el); }
    for (const [id, el] of nodes) if (!assets.some(a => a.kind !== 'audio' && a.id === id) && !timeline.audio.some(a => a.id === id) && !moving.some(o => o.id === id)) { if (el instanceof HTMLMediaElement) { el.pause(); el.removeAttribute('src'); el.load(); } nodes.delete(id); }
  }, [assets, timeline.audio, timeline.videoOverlays, proxies]);
  useEffect(() => () => { for (const el of media.current.values()) if (el instanceof HTMLMediaElement) { el.pause(); el.removeAttribute('src'); el.load(); } media.current.clear(); }, []);
  useEffect(() => {
    let raf = 0, last = performance.now(), frame = 0;
    const tick = (now: number) => {
      const s = latest.current; const length = duration(s.timeline);
      let t = s.time;
      if (s.playing) { t = Math.min(length, t + Math.min(.1, (now - last) / 1000)); latest.current.time = t; if (s.loop && s.loop[1] > s.loop[0] && t >= Math.min(length, s.loop[1])) t = Math.max(0, s.loop[0]); else if (t >= length) s.onEnd(); latest.current.time = t; }
      last = now;
      if (now - frame >= 30) {
        frame = now;
        if (s.playing) s.onTime(t);
        const c = canvas.current, ctx = c?.getContext('2d');
        if (c && ctx) {
          const dims = dimensions(s.timeline.format), w = Math.round(dims[0] * s.quality), h = Math.round(dims[1] * s.quality); if (c.width !== w) c.width = w; if (c.height !== h) c.height = h;
          const active = positions(s.timeline).find(p => t >= p.start && t < p.end) ?? (t >= length && length > 0 ? positions(s.timeline).at(-1) : undefined);
          // A pause can require a small corrective seek. Keep the last complete
          // picture until that frame has decoded instead of clearing to black.
          let painted = false;
          const clear = () => { ctx.fillStyle = '#0b0a09'; ctx.fillRect(0, 0, w, h); painted = true; };
          if (!active || s.timeline.layerSettings?.[active.clip.id]?.hidden) clear();
          const playingIds = new Set<string>();
          if (active) {
            const { clip, start } = active; const el = media.current.get(clip.assetId); const asset = assets.find(a => a.id === clip.assetId);
            if (el && asset && !s.timeline.layerSettings?.[clip.id]?.hidden) {
              if (el instanceof HTMLVideoElement) {
                const wanted = Math.min(clip.out - .001, pictureAt(clip, t - start));
                // A video cannot play backwards: a reversed clip stays paused and steps to each frame, without sound
                // (the export reverses the sound too).
                const still = clip.freeze !== undefined || !!clip.reverse;
                el.playbackRate = speedAt(clip, t - start); el.volume = Math.min(1, clip.volume * (clip.fade ? fadeGain(t - start, clipLength(clip), .25) : 1)); el.muted = s.muted || clip.volume === 0 || still;
                if (!el.seeking && Number.isFinite(wanted) && Math.abs(el.currentTime - wanted) > (s.playing && !clip.reverse ? .18 : .025)) el.currentTime = Math.max(0, wanted);
                if (s.playing && el.paused && !still) void el.play().catch(() => {}); if (!s.playing || still) el.pause(); playingIds.add(clip.assetId);
              }
              const ready = el instanceof HTMLImageElement ? el.complete && el.naturalWidth > 0 : el instanceof HTMLVideoElement && !el.seeking && el.readyState >= 2;
              if (ready) {
                clear();
                const elapsed = t - start, faded = clip.fade ? Math.max(0, Math.min(1, elapsed / .25, (clipLength(clip) - elapsed) / .25)) : 1;
                // Paused on the black edge of a fade (the very start of the video, say), show the picture rather than a
                // blank frame that looks broken; playback still fades through black.
                const opacity = !s.playing && faded < .05 ? 1 : faded;
                // Zoom punches and shakes move the footage only; everything drawn above it stays steady.
                ctx.save(); ctx.globalAlpha = opacity;
                const spots = positions(s.timeline), next = spots[spots.findIndex(p => p.clip.id === clip.id) + 1]?.clip;
                const area = clip.reverse ? undefined : footageArea(s.timeline.videoOverlays, t, dims[0], dims[1]), k = w / dims[0];
                drawFootage(ctx, el as CanvasImageSource, asset, clip, [start, active.end], s.timeline.effects, t, w, h, s.steady, true, time => transitionAt(clip, next, active.end - start, time - start), area && { x: area.x * k, y: area.y * k, w: area.w * k, h: area.h * k }); ctx.restore();
                drawBlurs(ctx, s.timeline.effects, t, w, h);
              }
            }
          }
          for (const audio of s.timeline.audio) {
            const el = media.current.get(audio.id);
            if (!(el instanceof HTMLAudioElement)) continue;
            if (t >= audio.start && t < audio.start + audio.duration) {
              const wanted = audio.in + t - audio.start;
              if (Math.abs(el.currentTime - wanted) > (s.playing ? .18 : .025)) el.currentTime = wanted;
              const fade = audio.fade ? fadeGain(t - audio.start, audio.duration, .3, .5) : 1;
              el.volume = Math.min(1, audio.volume * fade * duckGain(s.timeline, audio, t)); el.muted = s.muted; if (s.playing && el.paused) void el.play().catch(() => {}); if (!s.playing) el.pause(); playingIds.add(audio.id);
            }
          }
          // Videos on top: kept at their own moment like audio, then drawn over the footage and its blurs, under the layers.
          const onTop = videoOverlaysAt(s.timeline.videoOverlays, t).flatMap<{ o: VideoOverlay; el: HTMLVideoElement | HTMLImageElement; asset: Media }>(o => {
            const asset = assets.find(a => a.id === o.assetId), el = media.current.get(asset?.kind === 'video' ? o.id : o.assetId);
            if (!asset || !el) return [];
            if (el instanceof HTMLVideoElement) {
              const wanted = Math.min(asset.duration - .001, o.in + t - o.start);
              el.volume = Math.min(1, o.volume); el.muted = s.muted || o.volume === 0;
              if (!el.seeking && Math.abs(el.currentTime - wanted) > (s.playing ? .18 : .025)) el.currentTime = Math.max(0, wanted);
              if (s.playing && el.paused) void el.play().catch(() => {}); if (!s.playing) el.pause(); playingIds.add(o.id);
              return !el.seeking && el.readyState >= 2 ? [{ o, el, asset }] : [];
            }
            return el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0 ? [{ o, el, asset }] : [];
          });
          if (painted) for (const { o, el, asset } of onTop) drawVideoOverlay(ctx, o, el, asset, w, h, dims[0], dims[1]);
          for (const [id, el] of media.current) if (el instanceof HTMLMediaElement && !playingIds.has(id)) el.pause();
          // Sounds riding on effects, titles and cuts: each fires once as playback passes it. A jump (seeking, or
          // starting play) only fires what is just behind the playhead, never a pile of skipped sounds.
          const from = cueFrom.current; cueFrom.current = t;
          if (s.playing && !s.muted && t > from && t - from < .25) for (const cue of soundCues(s.timeline)) if (cue.time > from && cue.time <= t) {
            const sound = new Audio(soundUrl({ file: cue.file, own: !!cue.own })); routeAudio(sound); sound.volume = cue.volume; void audioGraph.current?.context.resume().catch(() => {}); void sound.play().catch(() => {});
          }
          // Overlays are part of the retained picture too; repainting them over
          // the old frame while waiting would accumulate tint and glow.
          if (painted) drawScene(ctx, s.timeline, t, w, h, id => { const el = media.current.get(id); return el instanceof HTMLImageElement ? el : undefined; });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [assets]);
  return <canvas ref={canvas} className="ve-preview-canvas" aria-label="Video preview" />;
});
