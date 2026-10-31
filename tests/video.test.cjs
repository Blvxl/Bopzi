const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
function load(file, dependencies = {}) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { exports, require: name => dependencies[name] || (name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name)), process, Buffer, crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout, Map, Set }); return exports; }
const model = load('src/video/model.ts');
test('short fades reach full volume without an abrupt cut, matching the rendered envelope', () => {
  const sfx = load('src/video/sfx.ts', { './model': { isMusic: () => false, positions: () => [] }, './sounds': { SOUNDS: [] }, './transitions': { TRANSITION_SOUNDS: {} } });
  const [fadeIn, fadeOut] = sfx.fadeDurations(.2, .3, .5);
  assert.ok(Math.abs(fadeIn - .075) < 1e-9); assert.ok(Math.abs(fadeOut - .125) < 1e-9);
  assert.equal(sfx.fadeGain(0, .2, .3, .5), 0);
  assert.equal(sfx.fadeGain(.075, .2, .3, .5), 1);
  assert.equal(sfx.fadeGain(.2, .2, .3, .5), 0);
  assert.equal(sfx.fadeGain(.5, 1, .3, .5), 1);
});
const asset = { id: 'source', name: 'Gameplay.mp4', kind: 'video', duration: 20, width: 640, height: 360 };
const clip = { ...model.newClip(asset), in: 2, out: 10, speed: 2 };
const base = { ...model.EMPTY, name: 'Test cut', clips: [clip] };
test('splitting a sped-up clip preserves source continuity and timeline length', () => { const result = model.splitClip(base, clip.id, 1.5); assert.equal(result.clips.length, 2); assert.equal(result.clips[0].out, 5); assert.equal(result.clips[1].in, 5); assert.equal(model.duration(result), 4); assert.notEqual(result.clips[0].id, result.clips[1].id); assert.equal(model.splitClip(base, clip.id, 0), base); });
test('timeline rejects unknown media, duplicate IDs, invalid trims and resource-heavy edits', () => { assert.equal(model.validateTimeline(base, [asset]).name, 'Test cut'); for (const patch of [{ assetId: 'missing' }, { out: 21 }, { in: 11 }, { speed: 0 }, { volume: NaN }, { zoom: 999 }]) assert.throws(() => model.validateTimeline({ ...base, clips: [{ ...clip, ...patch }] }, [asset])); assert.throws(() => model.validateTimeline({ ...base, clips: [clip, clip] }, [asset]), /unique/); assert.throws(() => model.validateTimeline({ ...base, clips: [{ ...clip, out: 20, in: 0, speed: .25 }, { ...clip, id: 'other', out: 20, in: 0, speed: .25 }, { ...clip, id: 'third', out: 20, in: 0, speed: .25 }] }, [asset]), /3 minutes/); });
test('audio source ranges and title animation boundaries are enforced', () => { const a = { ...asset, id: 'music', kind: 'audio' }; const audio = { id: 'audio', assetId: a.id, start: 0, in: 18, duration: 3, volume: .5, fade: true }; assert.throws(() => model.validateTimeline({ ...base, audio: [audio] }, [asset, a]), /audio duration/); const title = model.newTitle(1); assert.equal(model.titleOpacity(title, .9), 0); assert.equal(model.titleOpacity(title, 1.1).toFixed(1), '0.5'); assert.equal(model.titleOpacity(title, 2), 1); assert.equal(model.titleOpacity(title, 4), 0); });
const canRender = spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status === 0 && spawnSync('ffprobe', ['-version'], { windowsHide: true }).status === 0;
test('FFmpeg exports trimmed video, stills, title overlays and mixed audio in all formats', { skip: !canRender, timeout: 180000 }, async () => {
  const { renderVideo, processMedia } = load('src/video/render.ts', { './model': model });
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bopzi-video-test-'));
  try {
    await processMedia('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, 'source.mp4')]);
    await processMedia('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=2', path.join(dir, 'music.wav')]);
    const sharp = require('sharp'); await sharp({ create: { width: 320, height: 180, channels: 3, background: '#176f55' } }).png().toFile(path.join(dir, 'still.png'));
    const assets = [{ ...asset, duration: 2, width: 320, height: 180 }, { ...asset, id: 'image', name: 'Still.png', kind: 'image', duration: 4 }, { ...asset, id: 'music', name: 'Music.wav', kind: 'audio', duration: 2 }];
    const files = new Map([['source', path.join(dir, 'source.mp4')], ['image', path.join(dir, 'still.png')], ['music', path.join(dir, 'music.wav')]]);
    for (const format of ['landscape', 'vertical', 'square']) {
      const [w, h] = model.dimensions(format);
      await sharp({ create: { width: w, height: h, channels: 4, background: '#ffffff00' } }).composite([{ input: Buffer.from('<svg width="240" height="80"><rect width="240" height="80" fill="red"/></svg>'), left: 40, top: 40 }]).png().toFile(path.join(dir, 'title.png'));
      const timeline = model.validateTimeline({ ...base, format, clips: [{ ...clip, in: .2, out: 1.4, speed: 2, zoom: 1.2, fade: true }, { ...model.newClip(assets[1]), out: .8 }], titles: [{ ...model.newTitle(.1, 'HELLO'), id: 'title', duration: .9 }], audio: [{ id: 'audio', assetId: 'music', start: .1, in: .2, duration: 1, volume: .3, fade: true }] }, assets);
      const result = require('node:fs').readFileSync(await renderVideo(timeline, assets, files, new Map([['title', path.join(dir, 'title.png')]]), dir));
      assert.ok(result.length > 1000); await fsp.writeFile(path.join(dir, 'verify.mp4'), result);
      const info = JSON.parse(await processMedia('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(dir, 'verify.mp4')]));
      const video = info.streams.find(s => s.codec_type === 'video'); assert.equal(video.width, w); assert.equal(video.height, h); assert.equal(video.avg_frame_rate, '30/1'); assert.ok(info.streams.some(s => s.codec_type === 'audio')); assert.ok(Math.abs(Number(info.format.duration) - 1.4) < .15);
    }
  } finally { await fsp.rm(dir, { recursive: true, force: true }); }
});
test('AI context: frames spread through each video, loudness peaks and silences, beats', () => {
  const stub = {}; const ctx = load('src/video/ai-context.ts', { './editing': stub, './footage': stub, './layers': stub, './model': model, './overlays': stub, './track': stub, './transitions': stub, './clip-motion': stub });
  const plan = ctx.samplePlan([{ id: 'long', duration: 60 }, { id: 'short', duration: 1 }], 48);
  assert.ok(plan[0].times.length >= 40 && plan[0].times.every((t, i, a) => t > 0 && t < 60 && (!i || t > a[i - 1])));
  assert.equal(plan[1].times.length, 2); assert.ok(plan.reduce((s, p) => s + p.times.length, 0) <= 50);
  const db = Array.from({ length: 40 }, (_, i) => i >= 20 && i < 30 ? -60 : i === 8 ? -8 : -30);
  const line = ctx.describeLoudness('V1', db);
  assert.match(line, /^V1 loudness per \.5s: \d{20} /); assert.match(line, /peaks: 2\.00s\(\+22dB\)/); assert.match(line, /silent: 5\.0–7\.5s/);
  const beats = ctx.describeBeats([0, .5, 1, 1.5, 2].map((time, i) => ({ time, strong: i % 4 === 0 })));
  assert.match(beats, /about 120 BPM/); assert.match(beats, /Bar starts \(best for cuts and punches\): 0\.00, 2\.00\./); assert.equal(ctx.describeBeats([]), '');
});
test('AI steps: cutRange closes the gap, bad steps are skipped alone, steps switch off, selection is protected', () => {
  const ops = load('src/video/operations.ts');
  const two = { ...model.EMPTY, name: 'Steps', clips: [{ ...model.newClip(asset), id: 'a', in: 0, out: 10 }, { ...model.newClip(asset), id: 'b', in: 10, out: 16 }], titles: [{ ...model.newTitle(1, 'EARLY'), id: 't1', duration: 1 }, { ...model.newTitle(3, 'INSIDE'), id: 't2', duration: 1 }, { ...model.newTitle(12, 'LATE'), id: 't3', duration: 2 }] };
  const cut = ops.cutRange(two, 2.5, 4.5);
  assert.equal(model.duration(cut), 14); assert.deepEqual(cut.titles.map(t => [t.id, t.start]), [['t1', 1], ['t3', 10]]);
  assert.equal(cut.clips[0].out, 2.5); assert.equal(cut.clips[1].in, 4.5); assert.equal(cut.clips[0].id, 'a');
  const steps = [{ op: 'update', id: 't1', patch: { text: 'HELLO' } }, { op: 'update', id: 'missing', patch: { text: 'X' } }, { op: 'cutRange', start: 2.5, end: 4.5 }, { op: 'add', kind: 'effects', item: { id: 'z', kind: 'zoom', start: 1, duration: .6, amount: 1.4, x: .5, y: .5 } }];
  const all = ops.applySteps(two, steps, [asset]);
  assert.equal(all.results.filter(r => r.error).length, 1); assert.match(all.results[1].error, /does not exist/);
  assert.equal(all.timeline.titles.find(t => t.id === 't1').text, 'HELLO'); assert.equal(model.duration(all.timeline), 14); assert.equal(all.timeline.effects[0].id, 'z');
  const someOff = ops.applySteps(two, steps, [asset], { enabled: [true, true, false, true] });
  assert.equal(model.duration(someOff.timeline), 16); assert.equal(someOff.timeline.effects.length, 1);
  const scoped = ops.applySteps(two, steps, [asset], { selected: 't1' });
  assert.equal(scoped.results.filter(r => r.error).length, 3); assert.equal(model.duration(scoped.timeline), 16);
  const locked = ops.applySteps({ ...two, layerSettings: { t3: { locked: true } } }, [{ op: 'remove', id: 't3' }], [asset]);
  assert.match(locked.results[0].error, /locked/); assert.equal(locked.timeline.titles.length, 3);
});
test('colour grade and blur boxes: neutral is untouched, matrices follow the CSS spec, boxes stay in frame', () => {
  const grade = load('src/video/grade.ts'), blur = load('src/video/blur.ts');
  const id = grade.colourMatrix(grade.NEUTRAL); id.forEach((row, i) => row.forEach((v, j) => assert.ok(Math.abs(v - (i === j ? 1 : 0)) < 1e-9)));
  const mono = grade.colourMatrix({ ...grade.NEUTRAL, saturate: 0 }); for (const row of mono) assert.equal(row.map(v => v.toFixed(3)).join(' '), '0.213 0.715 0.072');
  assert.equal(grade.gradeFilters(undefined).length, 0); assert.equal(grade.gradeFilter(grade.NEUTRAL), 'none');
  assert.equal(grade.validateGrade({ brightness: 1, contrast: 1, saturate: 1, hue: 0 }), undefined); assert.throws(() => grade.validateGrade({ saturate: 9 }));
  assert.match(grade.gradeFilters({ ...grade.NEUTRAL, brightness: 1.2 })[0], /^lutrgb=r='clip\(\(clip\(val\*1\.2,0,255\)-127\.5\)\*1\+127\.5,0,255\)'/);
  const box = blur.blurBox({ x: .99, y: .01, w: .3, h: .2 }, 1920, 1080);
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= 1920 && box.y + box.h <= 1080 && box.x % 2 === 0 && box.w % 2 === 0);
  const graph = blur.blurGraph([{ id: 'b', kind: 'blur', start: 1, duration: 2, x: .5, y: .5, w: .2, h: .2, style: 'pixelate', strength: .5 }], 1920, 1080, '0:v');
  assert.equal(graph.output, 'blurred0'); assert.match(graph.lines.join(';'), /flags=neighbor.*enable='between\(t,1\.000,3\.000\)'/);
});
test('FFmpeg exports a reversed, black-and-white clip with a pixelated box', { skip: !canRender, timeout: 180000 }, async () => {
  const { renderVideo, processMedia } = load('src/video/render.ts', { './model': model });
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bopzi-grade-test-'));
  try {
    await processMedia('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, 'source.mp4')]);
    const assets = [{ ...asset, duration: 2, width: 640, height: 360 }];
    const timeline = model.validateTimeline({ ...base, clips: [{ ...clip, in: .2, out: 1.4, speed: 1, reverse: true, grade: { brightness: 1, contrast: 1, saturate: 0, hue: 0 } }], effects: [{ id: 'hide', kind: 'blur', start: 0, duration: 1.2, x: .2, y: .12, w: .3, h: .12, style: 'pixelate', strength: .6 }] }, assets);
    const result = require('node:fs').readFileSync(await renderVideo(timeline, assets, new Map([['source', path.join(dir, 'source.mp4')]]), [], dir));
    await fsp.writeFile(path.join(dir, 'out.mp4'), result);
    const info = JSON.parse(await processMedia('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', path.join(dir, 'out.mp4')]));
    assert.ok(Math.abs(Number(info.format.duration) - 1.2) < .15);
    await processMedia('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.5', '-i', path.join(dir, 'out.mp4'), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', path.join(dir, 'frame.rgb')]);
    const px = await fsp.readFile(path.join(dir, 'frame.rgb')), at = (x, y) => { const i = (y * 1920 + x) * 3; return [px[i], px[i + 1], px[i + 2]]; };
    // Black and white: every sampled pixel grey.
    for (const [x, y] of [[300, 500], [960, 540], [1500, 900], [1800, 200]]) { const [r, g, b] = at(x, y); assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 8, `pixel ${x},${y} is ${r},${g},${b}`); }
    // Pixelated: neighbouring pixels inside one block match.
    const a = at(120, 80), b2 = at(124, 84); assert.ok(a.every((v, i) => Math.abs(v - b2[i]) <= 6), `block ${a} vs ${b2}`);
    // Backwards: the export's first frame is the trim's last moment (1.4s), not its first (0.2s).
    const gray = async (file, ss, name) => { await processMedia('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', ss, '-i', path.join(dir, file), '-frames:v', '1', '-vf', 'scale=320:180,format=gray', '-f', 'rawvideo', path.join(dir, name)]); return fsp.readFile(path.join(dir, name)); };
    const first = await gray('out.mp4', '0', 'o.gray'), end = await gray('source.mp4', '1.37', 'e.gray'), start = await gray('source.mp4', '0.2', 's.gray');
    const diff = (p, q) => { let s = 0; for (let i = 320 * 40; i < p.length; i++) s += Math.abs(p[i] - q[i]); return s / (p.length - 320 * 40); };
    assert.ok(diff(first, end) < diff(first, start), `first frame matches ${diff(first, end).toFixed(1)} vs ${diff(first, start).toFixed(1)}`);
  } finally { await fsp.rm(dir, { recursive: true, force: true }); }
});
test('video overlays: validated, laid out on even pixels, keyed like colorkey, added and cut by AI steps', () => {
  const pip = load('src/video/pip.ts'), ops = load('src/video/operations.ts');
  const cam = { ...asset, id: 'cam', name: 'Facecam.mp4', duration: 30, width: 1280, height: 720 };
  const short = { ...base, format: 'vertical', clips: [{ ...model.newClip(asset), id: 'a', in: 0, out: 10 }] };
  const facecam = { id: 'f', assetId: 'cam', start: 1, in: 4, duration: 6, volume: .8, layout: 'split-bottom', x: .5, y: .5, size: .5, chromaKey: { color: '#00FF00', similarity: .3 } };
  const valid = model.validateTimeline({ ...short, videoOverlays: [facecam] }, [asset, cam]);
  const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
  same(valid.videoOverlays[0].chromaKey, { color: '#00ff00', similarity: .3, blend: .1 });
  same(model.validateTimeline(short, [asset]).videoOverlays, []);
  for (const patch of [{ layout: 'sideways' }, { assetId: 'missing' }, { in: 28, duration: 6 }, { size: .9 }, { crop: { x: .5, y: 0, w: .8, h: 1 } }]) assert.throws(() => model.validateTimeline({ ...short, videoOverlays: [{ ...facecam, ...patch }] }, [asset, cam]), undefined, JSON.stringify(patch));
  // Game on top, facecam below: the two halves meet exactly, and the facecam's 16:9 source is cut to the half's shape.
  const g = pip.pipGeometry(valid.videoOverlays[0], cam, 1080, 1920), area = pip.footageArea(valid.videoOverlays, 2, 1080, 1920);
  same(g.dest, { x: 0, y: 960, w: 1080, h: 960 }); same(area, { x: 0, y: 0, w: 1080, h: 960 });
  assert.ok(Math.abs(g.src.w / g.src.h - 1080 / 960) < .01 && g.src.h === 720 && g.src.x > 0);
  assert.equal(pip.footageArea(valid.videoOverlays, .5, 1080, 1920), undefined);
  const corner = pip.pipGeometry({ ...facecam, layout: 'pip', x: .8, y: .8, size: .33, crop: { x: .25, y: 0, w: .5, h: 1 } }, cam, 1080, 1920);
  assert.ok(corner.dest.w % 2 === 0 && corner.dest.h % 2 === 0 && corner.src.w === 640 && corner.src.x === 320);
  const px = new Uint8ClampedArray([0, 255, 0, 255, 250, 20, 30, 255, 40, 220, 40, 255]); pip.keyPixels(px, { color: '#00ff00', similarity: .3, blend: .1 });
  same([px[3], px[7], px[11]], [0, 255, 0]);
  assert.match(pip.framingFilter(1, .5, 1080, 1920, [{ area, from: 1, to: 2 }]), /pad=1080:1920:0:0.*enable='between\(t,1\.000,2\.000\)'/);
  // Through the AI's steps: added, then a cut across it keeps the facecam in sync with the footage under it.
  const added = ops.applySteps(short, [{ op: 'add', kind: 'videoOverlays', item: { id: 'f', assetId: 'cam', start: 1, in: 4, duration: 6, layout: 'split-bottom', size: .5 } }, { op: 'cutRange', start: 3, end: 4 }], [asset, cam]);
  assert.equal(added.results.filter(r => r.error).length, 0, JSON.stringify(added.results));
  same(added.timeline.videoOverlays.map(o => [o.start, o.in, o.duration]), [[1, 4, 2], [3, 7, 3]]);
  assert.match(added.results[0].label, /split screen/);
  const bad = ops.applySteps(short, [{ op: 'add', kind: 'videoOverlays', item: { assetId: 'cam', start: 0, duration: 2, layout: 'diagonal' } }], [asset, cam]);
  assert.ok(bad.results[0].error); assert.equal(bad.timeline.videoOverlays.length, 0);
});
test('FFmpeg exports a game-top / facecam-bottom Short and a green-screen overlay', { skip: !canRender, timeout: 180000 }, async () => {
  const { renderVideo, processMedia } = load('src/video/render.ts', { './model': model });
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bopzi-pip-test-'));
  try {
    const make = (name, video, audio) => processMedia('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', video, ...(audio ? ['-f', 'lavfi', '-i', audio] : []), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ...(audio ? ['-c:a', 'aac', '-shortest'] : []), path.join(dir, name)]);
    await make('game.mp4', 'color=c=0xff00ff:s=640x360:r=30:d=2', 'sine=frequency=440:duration=2');
    await make('cam.mp4', 'color=c=0x2040ff:s=320x240:r=30:d=2', 'sine=frequency=880:duration=2');
    await make('green.mp4', 'color=c=0x00c000:s=320x240:r=30:d=2,drawbox=x=120:y=80:w=80:h=80:color=red:t=fill');
    const assets = [{ ...asset, id: 'game', duration: 2, width: 640, height: 360 }, { ...asset, id: 'cam', duration: 2, width: 320, height: 240 }, { ...asset, id: 'green', duration: 2, width: 320, height: 240 }];
    const timeline = model.validateTimeline({ ...base, format: 'vertical', clips: [{ ...model.newClip(assets[0]), in: 0, out: 1.4 }], videoOverlays: [
      { id: 'cam', assetId: 'cam', start: 0, in: 0, duration: .7, volume: .5, layout: 'split-bottom', x: .5, y: .5, size: .5 },
      { id: 'gs', assetId: 'green', start: .7, in: 0, duration: .7, volume: 1, layout: 'full', x: .5, y: .5, size: 1, chromaKey: { color: '#00c000', similarity: .3, blend: .1 } }] }, assets);
    const result = require('node:fs').readFileSync(await renderVideo(timeline, assets, new Map(assets.map(a => [a.id, path.join(dir, `${a.id}.mp4`)])), [], dir));
    await fsp.writeFile(path.join(dir, 'out.mp4'), result);
    const info = JSON.parse(await processMedia('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(dir, 'out.mp4')]));
    assert.ok(Math.abs(Number(info.format.duration) - 1.4) < .15); assert.ok(info.streams.some(s => s.codec_type === 'audio'));
    const frame = async ss => { await processMedia('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', ss, '-i', path.join(dir, 'out.mp4'), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', path.join(dir, 'f.rgb')]); const px = await fsp.readFile(path.join(dir, 'f.rgb')); return (x, y) => { const i = (y * 1080 + x) * 3; return [px[i], px[i + 1], px[i + 2]]; }; };
    const magenta = ([r, g, b]) => r > 200 && b > 200 && g < 70, blue = ([r, , b]) => b > 200 && r < 90, red = ([r, g, b]) => r > 200 && g < 70 && b < 70;
    // Split: the game fills the top half, the facecam the bottom half.
    const split = await frame('0.3');
    assert.ok(magenta(split(540, 480)), `top ${split(540, 480)}`); assert.ok(blue(split(540, 1440)), `bottom ${split(540, 1440)}`);
    // Green screen: its red box covers the middle, its keyed green shows the game through; the split is over.
    const keyed = await frame('1.0');
    assert.ok(red(keyed(540, 960)), `middle ${keyed(540, 960)}`); for (const [x, y] of [[100, 100], [540, 1600], [980, 400]]) assert.ok(magenta(keyed(x, y)), `keyed ${x},${y} is ${keyed(x, y)}`);
  } finally { await fsp.rm(dir, { recursive: true, force: true }); }
});
test('tracking: follow and behind are validated, dangling links dropped, followers ride the traced object', () => {
  const follow = load('src/video/follow.ts'), mask = load('src/video/mask.ts'), ops = load('src/video/operations.ts');
  // A 40×20 trace of a 4×4 square moving right 10 pixels a frame, at 10 fps from 1s.
  const square = x0 => { const m = new Uint8Array(40 * 20); for (let y = 8; y < 12; y++) for (let x = x0; x < x0 + 4; x++) m[y * 40 + x] = 1; return mask.encodeMask(m); };
  const traced = { id: 'h', kind: 'highlight', start: 1, duration: 3, x: .15, y: .5, w: .3, h: .5, color: '#3ddc84', shape: 'ellipse', style: 'none', mask: { start: 1, fps: 10, w: 40, h: 20, frames: [square(2), square(12), '', square(32)] } };
  const p0 = follow.trackedPoint(traced, 1), p1 = follow.trackedPoint(traced, 1.05);
  assert.ok(Math.abs(p0.x - 4 / 40) < 1e-9 && Math.abs(p0.y - .5) < 1e-9); assert.ok(Math.abs(p1.x - 9 / 40) < 1e-9, `halfway ${p1.x}`);
  // A frame where it was lost holds the nearest place found; past the trace it stays at the last frame.
  assert.ok(Math.abs(follow.trackedPoint(traced, 1.2).x - 14 / 40) < 1e-9); assert.ok(Math.abs(follow.trackedPoint(traced, 9).x - 34 / 40) < 1e-9);
  const arrow = { ...model.newTitle(1, '⬇'), id: 'arrow', x: .1, y: .3, follow: 'h' };
  const moved = follow.followed(arrow, [traced], 1.1); assert.ok(Math.abs(moved.x - .35) < 1e-9 && moved.y === .3, `moved to ${moved.x}`);
  const still = { ...arrow, follow: undefined }; assert.equal(follow.followed(still, [traced], 1.1), still);
  const t = model.validateTimeline({ ...base, effects: [traced, { id: 'xp', kind: 'bar', start: 0, duration: 2, x: .5, y: .86, w: .6, h: .05, from: 10, to: 90, color: '#4ce07a', back: '#1b1f2a', label: 'XP', showValue: true, follow: 'h' }], titles: [{ ...arrow }, { ...model.newTitle(1, 'BIG'), id: 'big', behind: 'h' }, { ...model.newTitle(1, 'GONE'), id: 'gone', follow: 'nope', behind: 'xp' }], overlays: [{ id: 'logo', source: 'icon', icon: 'roblox', style: 'color', start: 0, duration: 2, x: .5, y: .2, size: .1, animation: 'fade', follow: 'h' }] }, [asset]);
  assert.equal(t.titles[0].follow, 'h'); assert.equal(t.titles[1].behind, 'h'); assert.ok(!('follow' in t.titles[2]) && !('behind' in t.titles[2]));
  assert.equal(t.overlays[0].follow, 'h'); assert.equal(t.effects[1].follow, 'h'); assert.equal(t.effects[0].style, 'none'); assert.equal(t.effects[1].label, 'XP');
  for (const patch of [{ from: 120 }, { h: .5 }, { easing: 'wobbly' }]) assert.throws(() => model.validateTimeline({ ...base, effects: [{ ...t.effects[1], ...patch }] }, [asset]), undefined, JSON.stringify(patch));
  // Removing the highlight drops the links instead of failing the edit.
  const removed = ops.applySteps(t, [{ op: 'remove', id: 'h' }], [asset]);
  assert.equal(removed.results[0].error, undefined); assert.ok(!removed.timeline.titles.some(x => x.follow || x.behind) && !removed.timeline.effects.some(e => e.follow));
  // Through the AI's steps: an invisible tracker, a title behind it, an arrow and an XP bar that follow it.
  const ai = ops.applySteps(base, [{ op: 'add', kind: 'effects', item: { id: 'me', kind: 'highlight', start: 0, duration: 3, x: .5, y: .5, w: .2, h: .5, color: '#ffffff', shape: 'box', style: 'none' } }, { op: 'add', kind: 'titles', item: { id: 'tb', text: 'OBBY', start: 0, duration: 3, x: .5, y: .4, size: .16, color: '#ffffff', font: 'luckiest', animation: 'pop', behind: 'me' } }, { op: 'add', kind: 'titles', item: { id: 'ta', text: '👇', start: 0, duration: 3, x: .5, y: .2, size: .08, follow: 'me' } }, { op: 'add', kind: 'effects', item: { id: 'bar', kind: 'bar', start: 0, duration: 3, x: .5, y: .1, w: .2, h: .03, from: 100, to: 20, color: '#ff3b3b', follow: 'me' } }], [asset]);
  assert.equal(ai.results.filter(r => r.error).length, 0, JSON.stringify(ai.results));
  assert.equal(ai.timeline.titles.find(x => x.id === 'tb').behind, 'me'); assert.equal(ai.timeline.titles.find(x => x.id === 'ta').follow, 'me'); assert.equal(ai.timeline.effects.find(e => e.id === 'bar').back, '#1b1f2a');
});
test('progress bar fills with its easing, fades in and out, and holds full', () => {
  const motion = load('src/video/motion.ts');
  const bar = { ...motion.newEffect('bar', 2, 'b'), from: 20, to: 80, fill: 1, easing: 'linear' };
  assert.equal(motion.barAt(bar, 1.9), null); assert.equal(motion.barAt(bar, 2).value, 20); assert.equal(motion.barAt(bar, 2).alpha, 0);
  assert.ok(Math.abs(motion.barAt(bar, 2.5).value - 50) < 1e-9); assert.equal(motion.barAt(bar, 2.5).alpha, 1);
  assert.equal(motion.barAt(bar, 3.5).value, 80); assert.ok(motion.barAt(bar, bar.start + bar.duration - .05).alpha < .5);
  assert.equal(motion.barFill({ duration: 2.5 }), 2); assert.equal(motion.barFill({ duration: 1, fill: 5 }), 1);
});
test('FFmpeg puts the traced object back over a title behind it', { skip: !canRender, timeout: 180000 }, async () => {
  const { renderVideo, processMedia } = load('src/video/render.ts', { './model': model });
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bopzi-behind-test-'));
  try {
    await processMedia('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x2040ff:s=640x360:r=30:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(dir, 'source.mp4')]);
    const assets = [{ ...asset, duration: 2, width: 640, height: 360 }], sharp = require('sharp');
    // The title under the object: red over the whole frame. The matte: the object is a white square in the middle.
    await sharp({ create: { width: 1920, height: 1080, channels: 4, background: '#ff0000ff' } }).png().toFile(path.join(dir, 'below-0.png'));
    await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#000000' } }).composite([{ input: { create: { width: 400, height: 400, channels: 3, background: '#ffffff' } }, left: 760, top: 340 }]).png().toFile(path.join(dir, 'matte-0.png'));
    await sharp({ create: { width: 1920, height: 1080, channels: 4, background: '#00000000' } }).composite([{ input: { create: { width: 100, height: 100, channels: 4, background: '#00ff00ff' } }, left: 0, top: 0 }]).png().toFile(path.join(dir, 'motion-0.png'));
    const timeline = model.validateTimeline({ ...base, clips: [{ ...model.newClip(assets[0]), in: 0, out: 1 }] }, assets);
    const result = require('node:fs').readFileSync(await renderVideo(timeline, assets, new Map([['source', path.join(dir, 'source.mp4')]]), [{ file: 'motion-0.png', duration: 1 }], dir, undefined, { below: [{ file: 'below-0.png', duration: 1 }], matte: [{ file: 'matte-0.png', duration: 1 }] }));
    await fsp.writeFile(path.join(dir, 'out.mp4'), result);
    await processMedia('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '0.5', '-i', path.join(dir, 'out.mp4'), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', path.join(dir, 'f.rgb')]);
    const px = await fsp.readFile(path.join(dir, 'f.rgb')), at = (x, y) => { const i = (y * 1920 + x) * 3; return [px[i], px[i + 1], px[i + 2]]; };
    const blue = ([r, , b]) => b > 200 && r < 90, red = ([r, g, b]) => r > 200 && g < 70 && b < 70, green = ([r, g, b]) => g > 200 && r < 70 && b < 70;
    assert.ok(blue(at(960, 540)), `object ${at(960, 540)}`); assert.ok(red(at(300, 800)), `title ${at(300, 800)}`); assert.ok(green(at(40, 40)), `top layer ${at(40, 40)}`);
    // A held picture is listed in half-second pieces; held as one entry for minutes, the overlay ran out of memory.
    const listed = await fsp.readFile(path.join(dir, 'motion.txt'), 'utf8');
    assert.equal(listed.match(/^duration /gm).length, 2); assert.ok(!/duration (?!0\.5000)/.test(listed), listed);
  } finally { await fsp.rm(dir, { recursive: true, force: true }); }
});
