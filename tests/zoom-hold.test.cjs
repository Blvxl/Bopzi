const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
function load(file, dependencies = {}) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => dependencies[name] || (name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name)), crypto: require('node:crypto').webcrypto, Map, Set }); return exports; }
const easing = load('src/video/easing.ts');
const motion = load('src/video/motion.ts', { './easing': easing });
const model = load('src/video/model.ts', { './motion': motion, './easing': easing });
const zoom = { id: 'zoom', kind: 'zoom', mode: 'hold', start: 2, duration: 8, rampDuration: .825, amount: 1.8, x: .75, y: .5, easing: 'easeInOut' };

test('adding a second zoom defaults to a higher absolute target and stays there', () => {
  const first = { ...zoom, start: 0, duration: 1, rampDuration: 1 };
  const second = motion.newEffect('zoom', 1, 'second', [first]);
  assert.equal(second.mode, 'hold');
  assert.equal(second.amount, 2.15);
  assert.ok(Math.abs(second.x - first.x) < 1e-10);
  for (const time of [1, 1.1, 1.3, 1.59, 1.6, 3]) {
    assert.ok(motion.cameraAt([first, second], time).zoom >= 1.8);
  }
  assert.equal(motion.cameraAt([first, second], 3).zoom, 2.15);
  const reset = { ...second, id: 'reset', start: 4, amount: 1 };
  assert.equal(motion.cameraAt([first, second, reset], 5).zoom, 1);
});
test('held zoom reaches the playhead smoothly and keeps framing until the next held move', () => {
  assert.equal(motion.cameraAt([zoom], 1.99).zoom, 1);
  assert.equal(motion.cameraAt([zoom], 2).zoom, 1);
  assert.ok(Math.abs(motion.cameraAt([zoom], 2 + .825 / 2).zoom - 1.4) < 1e-10);
  for (const time of [2.825, 3, 6, 9.99]) assert.equal(motion.cameraAt([zoom], time).zoom, 1.8);
  assert.equal(motion.cameraAt([zoom], 10).zoom, 1.8);
  const reset = { ...zoom, id: 'reset', start: 10, amount: 1 };
  assert.equal(motion.cameraAt([zoom, reset], 10).zoom, 1.8);
  assert.equal(motion.cameraAt([zoom, reset], 10.825).zoom, 1);
  // Seeking backwards evaluates the same curve, without mutable animation state.
  assert.equal(motion.cameraAt([zoom], 2.1).zoom, motion.cameraAt([zoom], 2.1).zoom);
  assert.ok(motion.cameraAt([zoom], 2.01).zoom - 1 < .001);
});
test('existing punch zooms still return to normal, and held zooms survive project validation', () => {
  const punch = { ...zoom, mode: undefined, duration: .6 };
  assert.ok(motion.cameraAt([punch], 2.12).zoom > 1.7);
  assert.equal(motion.cameraAt([punch], 2.6).zoom, 1);
  const a = { id: 'source', name: 'Clip.mp4', kind: 'video', duration: 40, width: 640, height: 360 };
  const base = { ...model.EMPTY, clips: [model.newClip(a)], effects: [zoom] };
  const saved = model.validateTimeline(base, [a]).effects[0];
  assert.equal(saved.mode, 'hold'); assert.equal(saved.rampDuration, .825); assert.equal(saved.easing, 'easeInOut');
  assert.throws(() => model.validateTimeline({ ...base, effects: [{ ...zoom, rampDuration: 9 }] }, [a]), /easing duration/);
  assert.throws(() => model.validateTimeline({ ...base, effects: [{ ...zoom, easing: 'fake' }] }, [a]), /easing/);
  assert.ok(model.validateTimeline({ ...base, effects: [{ ...zoom, duration: 40 }] }, [a]));
});

test('a short second stay zoom continues from the first and holds its absolute target', () => {
  const first = { ...zoom, start: 0, duration: 1.6, rampDuration: 1.6, amount: 1.3 };
  const second = { ...zoom, id: 'second', start: 1.6, duration: .2, rampDuration: .2, amount: 1.6, x: .25 };
  const effects = [second, first]; // Saved array order must not change the camera.
  assert.equal(motion.cameraAt(effects, 1.6).zoom, 1.3);
  let previous = 1.3;
  for (let frame = 1; frame <= 60; frame++) {
    const t = 1.6 + frame / 60;
    const camera = motion.cameraAt(effects, t);
    assert.ok(camera.zoom >= previous - 1e-10, `zoom must not reverse at ${t}`);
    previous = camera.zoom;
  }
  for (const t of [1.8, 2, 4, 10]) assert.equal(motion.cameraAt(effects, t).zoom, 1.6);
  const sameStrength = [first, { ...second, amount: 1.3 }];
  for (const t of [1.6, 1.7, 1.8, 4]) assert.equal(motion.cameraAt(sameStrength, t).zoom, 1.3);
});
const ffmpeg = spawnSync('ffmpeg', ['-version'], { windowsHide: true }).status === 0;
test('exported camera pixels match preview easing and hold across the rest of the clip', { skip: !ffmpeg, timeout: 30000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bopzi-zoom-hold-'));
  try {
    const e = { ...zoom, start: 0, duration: 1, amount: 1.3 };
    const second = { ...zoom, id: 'second', start: 1, duration: .2, rampDuration: .2 };
    const effects = [e, second];
    const cam = motion.cameraExpressions(effects, 0, 2);
    const sample = plane => `${plane}(${cam.x('X', 'Y')},${cam.y('X', 'Y')})`;
    const output = path.join(dir, 'frames.yuv');
    const filter = `geq=lum='${sample('lum')}':cb='${sample('cb')}':cr='${sample('cr')}':interpolation=bilinear`;
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', "nullsrc=s=64x48:r=40:d=2,geq=lum='X*3':cb=128:cr=128", '-vf', filter, '-pix_fmt', 'yuv420p', '-f', 'rawvideo', output], { windowsHide: true, timeout: 20000 });
    assert.equal(result.status, 0, String(result.stderr));
    const data = fs.readFileSync(output), frameBytes = 64 * 48 * 1.5;
    for (const frame of [0, 8, 16, 33, 39, 40, 41, 44, 48, 60, 79]) {
      const camera = motion.cameraAt(effects, frame / 40);
      const expected = 3 * ((8 - camera.fx * 64) / camera.zoom + camera.fx * 64);
      const actual = data[frame * frameBytes + 24 * 64 + 8];
      assert.ok(Math.abs(actual - expected) < 3, `frame ${frame}: expected ${expected}, got ${actual}`);
    }
    assert.equal(data[48 * frameBytes + 24 * 64 + 8], data[79 * frameBytes + 24 * 64 + 8]);
    assert.equal(motion.cameraExpressions(effects, 2, 1), null, 'held framing is scoped to its footage clip and does not carry into an unrelated clip');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
