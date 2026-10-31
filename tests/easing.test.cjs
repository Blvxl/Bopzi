const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
function load(file, dependencies = {}) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { exports, require: name => dependencies[name] || (name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name)), process, Buffer, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto, Map, Set }); return exports; }
const easing = load('src/video/easing.ts');
const motion = load('src/video/motion.ts', { './easing': easing });
const model = load('src/video/model.ts', { './easing': easing, './motion': motion });
const asset = { id: 'source', name: 'Gameplay.mp4', kind: 'video', duration: 12, width: 64, height: 48 };
const zoom = { id: 'zoom', kind: 'zoom', mode: 'hold', start: 0, duration: 1.5, rampDuration: 1, amount: 1.8, x: .8, y: .5 };
test('all curves have exact endpoints, finite samples and predictable seek behavior', () => {
  for (const preset of easing.EASINGS) {
    assert.equal(easing.easeAt(preset.id, -1), 0); assert.equal(easing.easeAt(preset.id, 2), 1);
    const values = Array.from({ length: 1001 }, (_, i) => easing.easeAt(preset.id, i / 1000));
    assert.ok(values.every(Number.isFinite), preset.id);
    if (!preset.overshoot) for (let i = 1; i < values.length; i++) assert.ok(values[i] >= values[i - 1] - 1e-10, preset.id);
    const e = { ...zoom, easing: preset.id };
    assert.equal(motion.cameraAt([e], 1.4).zoom, 1.8);
    assert.equal(motion.cameraAt([e], .2).zoom, motion.cameraAt([e], .2).zoom);
  }
  assert.ok(easing.easeAt('backOut', .7) > 1);
  assert.ok(easing.easeAt('easeIn', .25) < easing.easeAt('linear', .25));
  assert.ok(easing.easeAt('expoOut', .25) > easing.easeAt('easeOut', .25));
});
test('legacy zoom and counter easing retain their exact values', () => {
  assert.equal(easing.easeAt('easeInOut', .5), .5);
  assert.equal(easing.easeAt('easeOut', .5), .875);
  assert.equal(easing.easeAt('easeOut', .5, undefined, true), .9375);
  const counter = { ...motion.newEffect('counter', 0, 'counter'), from: 0, to: 10000, countDuration: 1 };
  assert.equal(motion.counterAt(counter, .5).value, 9375);
});
test('custom Bézier solves time coordinates and survives save/reload, including punch zooms', () => {
  const curve = [.42, 0, .58, 1];
  assert.ok(Math.abs(easing.easeAt('custom', .5, curve) - .5) < 1e-8);
  assert.ok(Math.abs(easing.easeAt('custom', .25, [0, 0, 1, 1]) - .25) < 1e-8);
  assert.ok(easing.easeAt('custom', .25, [.8, 0, .9, 1]) < .1, 'x coordinates affect timing');
  for (const mode of ['hold', 'punch']) { const saved = model.validateTimeline({ ...model.EMPTY, clips: [model.newClip(asset)], effects: [{ ...zoom, mode, easing: 'custom', curve }] }, [asset]).effects[0]; assert.equal(saved.easing, 'custom'); assert.equal(JSON.stringify(saved.curve), JSON.stringify(curve)); }
  assert.throws(() => easing.validateBezier([2, 0, 1, 1]), /Bézier/);
  assert.throws(() => easing.validateBezier([0, NaN, 1, 1]), /Bézier/);
  assert.throws(() => easing.validateBezier([0, 1, 1]), /Bézier/);
  const counter = { ...motion.newEffect('counter', 0, 'counter'), easing: 'custom', curve: [.3, 1.4, .6, 1] };
  assert.throws(() => model.validateTimeline({ ...model.EMPTY, effects: [counter] }, []), /without overshoot/);
  assert.throws(() => model.validateTimeline({ ...model.EMPTY, effects: [{ ...counter, curve: undefined, easing: 'elasticOut' }] }, []), /smooth counting/);
});
const ffmpeg = spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status === 0;
test('every easing renders through the actual FFmpeg perspective filter and matches preview pixels', { skip: !ffmpeg, timeout: 60000 }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bopzi-easing-'));
  try {
    for (const preset of easing.EASINGS) for (const mode of ['hold', 'punch']) {
      const e = { ...zoom, mode, ...(mode === 'punch' ? { duration: .6 } : {}), easing: preset.id, ...(preset.id === 'custom' ? { curve: [.2, .05, .4, 1.3] } : {}) };
      const effects = preset.id === 'custom' ? [e, { ...zoom, id: 'stacked', start: .2, duration: 1.3, rampDuration: .6, amount: 1.2, x: .2, y: .3, easing: 'smoother' }] : [e];
      const { x, y } = motion.cameraExpressions(effects, 0, 2, '((in-1)/30)');
      const filter = `perspective=x0='${x('0', '0')}':y0='${y('0', '0')}':x1='${x('W', '0')}':y1='${y('0', '0')}':x2='${x('0', 'H')}':y2='${y('0', 'H')}':x3='${x('W', '0')}':y3='${y('0', 'H')}':interpolation=linear:eval=frame`;
      const filterFile = path.join(directory, `${preset.id}-${mode}.filter`); fs.writeFileSync(filterFile, filter);
      const output = path.join(directory, `${preset.id}-${mode}.yuv`);
      const rendered = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', "nullsrc=s=64x48:r=30:d=2,geq=lum='X*3':cb=128:cr=128", '-/filter:v', filterFile, '-pix_fmt', 'yuv420p', '-f', 'rawvideo', output], { windowsHide: true, timeout: 10000 });
      assert.equal(rendered.status, 0, `${preset.id}: ${String(rendered.stderr)}`);
      const data = fs.readFileSync(output), bytes = 64 * 48 * 1.5;
      for (const frame of [0, 1, 2, 3, 4, 8, 15, 18, 22, 29, 30, 42, 45, 51]) {
        const camera = motion.cameraAt(effects, frame / 30), expected = 3 * ((8 - camera.fx * 64) / camera.zoom + camera.fx * 64);
        assert.ok(Math.abs(data[frame * bytes + 24 * 64 + 8] - expected) < 4, `${preset.id} frame ${frame}: got ${data[frame * bytes + 24 * 64 + 8]}, expected ${expected}`);
      }
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('full-resolution custom zoom exports through the complete renderer, including its first frame', { skip: !ffmpeg, timeout: 60000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bopzi-easing-hd-'));
  try {
    const source = path.join(directory, 'source.png');
    await require('sharp')({ create: { width: 128, height: 72, channels: 3, background: '#68a9df' } }).png().toFile(source);
    const asset = { id: 'source', name: 'Still.png', kind: 'image', duration: 4, width: 128, height: 72 };
    const timeline = { ...model.EMPTY, clips: [{ ...model.newClip(asset), out: .5 }], effects: [{ ...zoom, duration: .5, rampDuration: .25, easing: 'custom', curve: [.2, .05, .4, 1.3] }] };
    const editing = load('src/video/editing.ts', { './model': model });
    const { renderVideo } = load('src/video/render.ts', { './model': model, './motion': motion, './editing': editing });
    const buffer = require('node:fs').readFileSync(await renderVideo(timeline, [asset], new Map([['source', source]]), [], directory));
    assert.ok(buffer.length > 1000);
    const output = path.join(directory, 'checked.mp4'); fs.writeFileSync(output, buffer);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,codec_name:format=duration', '-of', 'json', output], { windowsHide: true });
    assert.equal(probe.status, 0, String(probe.stderr)); const info = JSON.parse(String(probe.stdout));
    assert.equal(info.streams[0].width, 1920); assert.equal(info.streams[0].height, 1080); assert.equal(info.streams[0].codec_name, 'h264');
    assert.ok(Math.abs(Number(info.format.duration) - .5) < .1);
  } finally { assert.equal(path.dirname(directory), os.tmpdir()); fs.rmSync(directory, { recursive: true, force: true }); }
});
