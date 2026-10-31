import { visibleTimeline } from './editing';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { clipLength, dimensions, duration, type MediaInfo, type Timeline } from './model';
import { blurredZooms, cameraExpressions } from './motion';
import { duckExpression, fadeDurations, soundCues } from './sfx';
import { transitionExpressions } from './transitions';
import { speedTimestamp, rampAudioFilter, transformExpressions } from './clip-motion';
import { gradeFilters } from './grade';
import { blurGraph } from './blur';
import { footageAreaFor, framingFilter, isSplit, pipGraph } from './pip';
/** The creator's own sound pack (sound-pack.ts): sfx/ and music/ folders. */
export const soundPackRoot = () => process.env.BOPZI_SOUNDS_DIR || path.join(homedir(), '.bopzi', 'sounds');
export async function processMedia(program: string, args: string[], signal?: AbortSignal, cwd?: string, timeoutMs = 240000, onOutput?: (chunk: string) => void): Promise<string> {
  if (signal?.aborted) throw new Error('Export cancelled.');
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '', error = ''; let finished = false;
    const done = (fault?: Error) => { if (finished) return; finished = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); if (fault) reject(fault); else resolve(output); };
    const cancel = () => { child.kill(); done(new Error('Export cancelled.')); };
    const timer = setTimeout(() => { child.kill(); done(new Error('Rendering took too long. Try a shorter video.')); }, timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
    child.stdout.on('data', d => { output = (output + d).slice(-20000); onOutput?.(String(d)); }); child.stderr.on('data', d => { error = (error + d).slice(-4000); });
    child.on('error', () => done(new Error(`${program.includes('probe') ? 'FFprobe' : 'FFmpeg'} was not found. Install FFmpeg on this computer and restart Bopzi.`)));
    child.on('close', code => done(code === 0 ? undefined : new Error(`The media could not be rendered. ${error.split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 500)}`)));
  });
}
/**
 * Renders the cut to `bopzi.mp4` in `directory` and answers with its path. `onProgress` hears 0–1: the clips are
 * the first 60%, the final pass (overlays, sound, encode) the rest.
 */
export async function renderVideo(timeline: Timeline, assets: MediaInfo[], files: Map<string, string>, motion: { file: string; duration: number }[], directory: string, signal?: AbortSignal, subject?: { below: { file: string; duration: number }[]; matte: { file: string; duration: number }[] }, onProgress: (share: number) => void = () => {}) {
  timeline = visibleTimeline(timeline);
  const ffmpeg = process.env.BOPZI_FFMPEG || 'ffmpeg', ffprobe = process.env.BOPZI_FFPROBE || 'ffprobe';
  const [w, h] = dimensions(timeline.format); const seconds = duration(timeline); const common = ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '2', '-filter_threads', '2', '-filter_complex_threads', '2'];
  // Long-form cuts get time in proportion to their length: four seconds of rendering per second of video.
  const run = (args: string[]) => processMedia(ffmpeg, [...common, ...args], signal, directory, Math.max(240000, seconds * 4000));
  const sources = new Map<string, { audio: boolean; duration: number; video: boolean }>();
  for (const a of assets) {
    const file = files.get(a.id); if (!file) throw new Error(`Missing media: ${a.name}`);
    const info = JSON.parse(await processMedia(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], signal, directory));
    const audio = info.streams.some((s: { codec_type: string }) => s.codec_type === 'audio'), video = info.streams.some((s: { codec_type: string }) => s.codec_type === 'video');
    if ((a.kind === 'audio' && !audio) || (a.kind !== 'audio' && !video)) throw new Error(`“${a.name}” does not contain the expected media.`);
    sources.set(a.id, { audio, video, duration: Number(info.format?.duration) || a.duration });
  }
  const segments: string[] = []; let offset = 0;
  for (const [i, c] of timeline.clips.entries()) {
    const a = assets.find(a => a.id === c.assetId)!; const source = sources.get(a.id)!;
    if (a.kind === 'video' && c.out > source.duration + .1) throw new Error(`The trim range for “${a.name}” exceeds its duration.`);
    const length = clipLength(c), file = files.get(c.assetId)!; const segment = `clip-${i}.mp4`;
    const input = a.kind === 'image' ? ['-loop', '1', '-framerate', '30', '-i', file] : ['-ss', String(c.freeze ?? c.in), '-t', String(c.freeze !== undefined ? .1 : c.out - c.in), '-i', file];
    // While a split-screen video is on, the footage is framed into the rest of the frame (pip.ts), as in the preview;
    // the first one on wins there, so it goes on top here. Reversed clips keep the whole frame in both.
    const splits = c.reverse ? [] : timeline.videoOverlays.filter(o => isSplit(o) && o.start < offset + length && o.start + o.duration > offset).reverse().map(o => ({ area: footageAreaFor(o, w, h), from: Math.max(0, o.start - offset), to: Math.min(length, o.start + o.duration - offset) }));
    const frame = [framingFilter(c.zoom, c.focusX, w, h, splits)];
    // Reversed: framed and at 30 fps first, so the reverse buffer holds only output-sized frames, then flipped, then
    // the speed curve shapes the backwards playback, as in the preview.
    const vf = c.freeze !== undefined ? [`select=eq(n\\,0),setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${length}`, ...frame, 'fps=30']
      : c.reverse ? [...frame, 'fps=30', 'reverse', 'setpts=PTS-STARTPTS', `setpts='(${speedTimestamp(c)})/TB'`, 'fps=30']
      : [`setpts='(${speedTimestamp(c)})/TB'`, ...frame, 'fps=30'];
    vf.push(...gradeFilters(c.grade));
    // Zoom punches and shakes: the same camera as the preview, as the source rectangle that fills each frame.
    // perspective re-evaluates its four corners every frame (the first input frame is numbered 1, so its time is (in-1)/30) and resamples
    // smoothly; a per-pixel expression filter gave the same picture about 25 times slower.
    // The transition into this clip and the one out of it (into the next), as moves of the framed picture.
    const move = transitionExpressions(c, timeline.clips[i + 1], length, '((in-1)/30)');
    const cam = cameraExpressions(timeline.effects, offset, length, '((in-1)/30)', move);
    if (cam) {
      const { x, y } = cam;
      vf.push(`perspective=x0='${x('0', '0')}':y0='${y('0', '0')}':x1='${x('W', '0')}':y1='${y('W', '0')}':x2='${x('0', 'H')}':y2='${y('0', 'H')}':x3='${x('W', 'H')}':y3='${y('W', 'H')}':interpolation=linear:eval=frame`);
    }
    if (c.keyframes?.length) {
      const tr = transformExpressions(c.keyframes, '((in-1)/30)'), angle = `((${tr.rotation})*PI/180)`, x = (sx: string, sy: string) => `(W/2+(((${sx})-W/2-(${tr.x})*W)*cos(${angle})+((${sy})-H/2-(${tr.y})*H)*sin(${angle}))/(${tr.scale}))`, y = (sx: string, sy: string) => `(H/2+(-(((${sx})-W/2-(${tr.x})*W))*sin(${angle})+((${sy})-H/2-(${tr.y})*H)*cos(${angle}))/(${tr.scale}))`;
      vf.push(`perspective=x0='${x('0','0')}':y0='${y('0','0')}':x1='${x('W','0')}':y1='${y('W','0')}':x2='${x('0','H')}':y2='${y('0','H')}':x3='${x('W','H')}':y3='${y('W','H')}':interpolation=linear:eval=frame`);
      if (c.keyframes.some(k => k.opacity !== 1)) { const opacity = transformExpressions(c.keyframes, 'T').opacity; vf.push(`format=gbrp,geq=r='r(X,Y)*min(1,max(0,${opacity}))':g='g(X,Y)*min(1,max(0,${opacity}))':b='b(X,Y)*min(1,max(0,${opacity}))'`); }
    }
    // Motion blur on punch zooms, matching the preview: while a punch moves, each frame is blended with the one before.
    const blurs = blurredZooms(timeline.effects).filter(e => e.start < offset + length && e.start + e.duration > offset).map(e => `between(t,${Math.max(0, e.start - offset).toFixed(3)},${Math.min(length, e.start + e.duration - offset).toFixed(3)})`);
    if (blurs.length) vf.push(`tmix=frames=2:weights='1 1':enable='${blurs.join('+')}'`);
    // Through a transition's fast part the smear is stronger, three frames, like the preview's longer shutter.
    if (move?.blur.length) vf.push(`tmix=frames=3:weights='1 1 1':enable='${move.blur.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+')}'`);
    // A glitch: the colour channels split apart for a frame or two.
    if (move?.glitch.length) vf.push(`rgbashift=rh=-14:bh=14:gv=4:edge=smear:enable='${move.glitch.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+')}'`);
    if (timeline.layerSettings?.[c.id]?.hidden) vf.push('drawbox=color=black:t=fill');
    offset += length;
    if (c.fade) vf.push(`fade=t=in:d=${Math.min(.25, length / 2)}`, `fade=t=out:st=${Math.max(0, length - .25)}:d=${Math.min(.25, length / 2)}`);
    // Read the graph from a file so custom curves and stacked effects cannot exceed Windows argv limits.
    const filterFile = `clip-${i}.filter`; await writeFile(path.join(directory, filterFile), vf.join(','));
    const clipAudioFade = c.fade ? (() => { const [fadeIn, fadeOut] = fadeDurations(length, .25); return `,afade=t=in:d=${fadeIn},afade=t=out:st=${Math.max(0, length - fadeOut)}:d=${fadeOut}`; })() : '';
    const af = [`asetpts=PTS-STARTPTS`, ...(c.reverse ? ['areverse', 'asetpts=PTS-STARTPTS'] : []), ...(c.speed < .5 ? ['atempo=0.5', `atempo=${c.speed / .5}`] : c.speed > 2 ? ['atempo=2', `atempo=${c.speed / 2}`] : [`atempo=${c.speed}`]), `volume=${timeline.layerSettings?.[c.id]?.hidden ? 0 : c.volume}${clipAudioFade}`, 'aresample=48000', `apad=whole_dur=${length}`, `atrim=duration=${length}`];
    const rampedAudio = c.speedPoints ? `${c.reverse ? 'areverse,asetpts=PTS-STARTPTS,' : ''}${rampAudioFilter(c)},volume=${timeline.layerSettings?.[c.id]?.hidden ? 0 : c.volume}${clipAudioFade},aresample=48000` : null;
    if (source.audio && a.kind === 'video' && c.freeze === undefined) await run([...input, '-/filter:v', filterFile, '-af', rampedAudio ?? af.join(','), '-t', String(length), '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', segment]);
    else await run([...input, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-/filter:v', filterFile, '-t', String(length), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', segment]);
    segments.push(segment); onProgress(.6 * offset / seconds);
  }
  await writeFile(path.join(directory, 'clips.txt'), segments.map(s => `file '${s}'`).join('\n'));
  await run(['-f', 'concat', '-safe', '1', '-i', 'clips.txt', '-c', 'copy', '-t', String(seconds), 'joined.mp4']);
  const args = ['-i', 'joined.mp4']; let index = 1; const filters: string[] = []; let video = '0:v';
  // Blurred and pixelated boxes act on the footage, under everything drawn on top.
  const blurs = blurGraph(timeline.effects, w, h, video); if (blurs.lines.length) { filters.push(...blurs.lines); video = blurs.output; }
  // Videos on top (facecam, split screen, green screen), over the blurs and under the titles; their sound is mixed in below.
  const pips = timeline.videoOverlays.filter(o => o.start < seconds).map(o => {
    const a = assets.find(a => a.id === o.assetId)!, source = sources.get(a.id)!, length = Math.min(o.duration, seconds - o.start);
    if (a.kind === 'video' && o.in + o.duration > source.duration + .1) throw new Error(`The video on top from “${a.name}” is longer than its file.`);
    args.push(...(a.kind === 'image' ? ['-loop', '1', '-framerate', '30', '-t', String(length)] : ['-ss', String(o.in), '-t', String(length)]), '-i', files.get(a.id)!);
    return { item: o, input: index++, source: a, sound: a.kind === 'video' && source.audio && o.volume > 0 };
  });
  const pipped = pipGraph(pips, w, h, video); if (pipped.lines.length) { filters.push(...pipped.lines); video = pipped.output; }
  // Each layer the browser drew arrives as an image sequence: each distinct picture with how long it holds.
  const sequence = async (frames: { file: string; duration: number }[], name: string) => {
    const lines = ['ffconcat version 1.0'];
    // A long hold is listed as half-second pieces of the same picture. As one entry, `fps` could not hand out its
    // frames until the next picture arrived, and `overlay` would queue every footage frame until then: a still title
    // over a few minutes of 1080p ran out of memory.
    for (const m of frames) for (let left = m.duration; left > 1e-6; left -= .5) lines.push(`file '${m.file}'`, `duration ${Math.min(.5, left).toFixed(4)}`);
    lines.push(`file '${frames.at(-1)!.file}'`);
    await writeFile(path.join(directory, `${name}.txt`), lines.join('\n'));
    args.push('-f', 'concat', '-safe', '1', '-i', `${name}.txt`);
  };
  // Text behind the player, as in drawScene: the behind titles go onto the footage, then the object, cut out of that
  // same footage by its matte, goes back over them. Everything else is stacked on top below.
  if (subject?.below.length && subject.matte.length) {
    await sequence(subject.below, 'below'); await sequence(subject.matte, 'matte');
    filters.push(`[${video}]split[base][cut]`, `[${index}:v]fps=30,format=rgba,setpts=PTS-STARTPTS[below]`, `[base][below]overlay=0:0:eof_action=pass[withbelow]`,
      `[${index + 1}:v]fps=30,format=gray,setpts=PTS-STARTPTS[matte]`, `[cut]format=rgba[cutrgba]`, `[cutrgba][matte]alphamerge[subject]`, `[withbelow][subject]overlay=0:0:eof_action=pass[withsubject]`);
    video = 'withsubject'; index += 2;
  }
  // Everything above (titles, logos, counters, captions, flashes): one overlay input, however much is animated.
  if (motion.length) {
    await sequence(motion, 'motion');
    filters.push(`[${index}:v]fps=30,format=rgba,setpts=PTS-STARTPTS[motion]`, `[${video}][motion]overlay=0:0:eof_action=pass[withmotion]`); video = 'withmotion'; index++;
  }
  const audioLabels = ['0:a'];
  for (const [i, p] of pips.entries()) if (p.sound) { filters.push(`[${p.input}:a]asetpts=PTS-STARTPTS,volume=${p.item.volume},aresample=48000,adelay=${Math.round(p.item.start * 1000)}:all=1[pa${i}]`); audioLabels.push(`pa${i}`); }
  for (const [i, a] of timeline.audio.entries()) {
    if (a.start >= seconds) continue;
    const source = sources.get(a.assetId)!; if (a.in + a.duration > source.duration + .1) throw new Error('An audio trim exceeds the source duration.');
    args.push('-ss', String(a.in), '-t', String(a.duration), '-i', files.get(a.assetId)!);
    const fade = a.fade ? (() => { const [fadeIn, fadeOut] = fadeDurations(a.duration, .3, .5); return `,afade=t=in:d=${fadeIn},afade=t=out:st=${Math.max(0, a.duration - fadeOut)}:d=${fadeOut}`; })() : '';
    // Music drops under speech, like the preview; after the delay, t is timeline time.
    const duck = duckExpression(timeline, a);
    filters.push(`[${index}:a]asetpts=PTS-STARTPTS,volume=${a.volume}${fade},adelay=${Math.round(a.start * 1000)}:all=1${duck ? `,volume='${duck}':eval=frame` : ''}[a${i}]`); audioLabels.push(`a${i}`); index++;
  }
  // Sounds riding on effects, titles and cuts, from the built-in library on this computer.
  for (const [i, cue] of soundCues(timeline).filter(c => c.time < seconds).slice(0, 60).entries()) {
    args.push('-i', cue.own ? path.join(soundPackRoot(), cue.file) : path.join(process.cwd(), 'public', 'sounds', cue.file));
    filters.push(`[${index}:a]asetpts=PTS-STARTPTS,aresample=48000,volume=${cue.volume},adelay=${Math.round(cue.time * 1000)}:all=1[s${i}]`); audioLabels.push(`s${i}`); index++;
  }
  if (audioLabels.length > 1) filters.push(`${audioLabels.map(l => `[${l}]`).join('')}amix=inputs=${audioLabels.length}:duration=first:normalize=0,alimiter=limit=0.95[mix]`);
  if (filters.length) args.push('-filter_complex', filters.join(';'));
  args.push('-map', video === '0:v' ? '0:v:0' : `[${video}]`, '-map', audioLabels.length > 1 ? '[mix]' : '0:a:0', '-t', String(seconds), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', 'bopzi.mp4');
  await processMedia(ffmpeg, [...common, ...args], signal, directory, Math.max(240000, seconds * 4000), chunk => {
    const done = /out_time_us=(\d+)/.exec(chunk); if (done) onProgress(.6 + .4 * Math.min(1, Number(done[1]) / 1e6 / seconds));
  });
  return path.join(directory, 'bopzi.mp4');
}
