const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file); if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name), crypto: require('node:crypto').webcrypto, Map, Set, console, process, Buffer, setTimeout, clearTimeout });
  return exports;
}
const model = load('src/video/model.ts'), workflow = load('src/video/workflow.ts'), motion = load('src/video/clip-motion.ts');
const asset = { id: 'footage', kind: 'video', name: 'Gameplay.mp4', width: 1920, height: 1080, duration: 30 };
const clip = (id, start = 0, out = 4) => ({ ...model.newClip(asset), id, in: start, out });
const base = () => ({ ...model.EMPTY, clips: [clip('a'), clip('b')], effects: [{ id: 'z', kind: 'zoom', start: 1, duration: .5, amount: 1.5, x: .5, y: .5, mode: 'hold' }], titles: [{ ...model.newTitle(4.5, 'WIN'), id: 'text' }] });

test('attached effects follow reorder, edits to their own timing update the offset, and deletion removes their children', () => {
  const t = workflow.attachLayer(base(), 'z', 'a');
  const moved = workflow.reconcileAttachments(t, { ...t, clips: [...t.clips].reverse() });
  assert.equal(moved.effects[0].start, 5);
  const manual = workflow.reconcileAttachments(moved, { ...moved, effects: [{ ...moved.effects[0], start: 6 }] });
  assert.equal(manual.layerSettings.z.attachment.offset, 2);
  const deleted = workflow.reconcileAttachments(manual, { ...manual, clips: manual.clips.filter(c => c.id !== 'a') });
  assert.equal(deleted.effects.length, 0);
  assert.equal(deleted.titles[0].start, 4.5, 'unattached layers keep their timeline time');
});
test('traced masks shift with their attached highlight', () => {
  const t = base(); t.effects = [{ id: 'h', kind: 'highlight', start: 1, duration: 1, mask: { start: 1, frames: ['a'], fps: 1, w: 8, h: 8 } }];
  const attached = workflow.attachLayer(t, 'h', 'a'), moved = workflow.reconcileAttachments(attached, { ...attached, clips: [...attached.clips].reverse() });
  assert.equal(moved.effects[0].mask.start, 5);
});
test('compound duplication makes independent native layers, unique IDs and valid attachments', () => {
  const t = workflow.makeCompound(base(), ['a', 'z'], 'Kill reveal'), next = workflow.duplicateCompound(t, t.compounds[0].id);
  const valid = model.validateTimeline(next, [asset]);
  assert.equal(valid.compounds.length, 2); assert.equal(valid.clips.length, 3); assert.equal(valid.effects.length, 2);
  const copy = valid.effects.find(e => e.id !== 'z'); assert.equal(copy.start, 5);
  assert.equal(valid.layerSettings[copy.id].attachment.clipId, valid.clips[1].id);
  assert.equal(t.clips.length, 2, 'original is immutable');
});
test('a compound moves as a unit and cannot include non-adjacent footage', () => {
  const t = { ...base(), clips: [clip('a'), clip('b'), clip('c')] };
  assert.throws(() => workflow.makeCompound(t, ['a', 'c'], 'No'), /neighbouring/);
  const grouped = workflow.makeCompound(t, ['a', 'b', 'z'], 'Intro'), moved = workflow.reconcileAttachments(grouped, workflow.reorderCompound(grouped, 'a', 'missing'));
  assert.equal(moved.clips.map(c => c.id).join(','), 'c,a,b'); assert.equal(moved.effects[0].start, 5);
});
test('replacement and slip preserve duration; rolling preserves combined duration and source boundaries', () => {
  const t = base(), replacement = { ...asset, id: 'new' }, next = workflow.replaceFootage(t, 'a', replacement);
  assert.equal(next.clips[0].assetId, 'new'); assert.equal(model.duration(next), model.duration(t));
  assert.throws(() => workflow.replaceFootage(t, 'a', { ...replacement, duration: 1 }), /at least/);
  const slipped = workflow.slipClip(t, 'b', 2, asset); assert.equal(slipped.clips[1].in, 2); assert.equal(model.duration(slipped), model.duration(t));
  const rolled = workflow.rollCut(slipped, 'a', 1, [asset]); assert.equal(model.duration(rolled), model.duration(slipped)); assert.equal(rolled.clips[0].out, 5); assert.equal(rolled.clips[1].in, 3);
});
test('freeze insertion preserves both halves; replay inserts half-speed footage and attached replay label', () => {
  const t = base(), frozen = model.validateTimeline(workflow.freezeAt(t, 'a', 2), [asset]);
  assert.equal(frozen.clips.length, 4); assert.equal(model.duration(frozen), 9); assert.equal(frozen.clips[1].freeze, 2); assert.equal(frozen.clips[1].volume, 0);
  const replay = model.validateTimeline(workflow.replayClip(t, 'a'), [asset]); assert.equal(model.duration(replay), 16); assert.equal(replay.titles.at(-1).text, 'REPLAY'); assert.equal(replay.layerSettings[replay.titles.at(-1).id].attachment.clipId, replay.clips[1].id);
});
test('speed curves map monotonically, invert exactly and finish on the original out point', () => {
  for (const points of Object.values(motion.SPEED_PRESETS)) {
    const c = { ...clip('a'), speedPoints: points }, duration = model.clipLength(c); let previous = 0;
    for (let i = 0; i <= 100; i++) { const time = duration * i / 100, source = motion.sourceAt(c, time); assert.ok(source >= previous); assert.ok(Math.abs(motion.outputAt(c, source) - time) < 1e-8); previous = source; }
    assert.ok(Math.abs(previous - c.out) < 1e-8); assert.ok(duration > 0); model.validateTimeline({ ...model.EMPTY, clips: [c] }, [asset]);
  }
});
test('splitting a speed curve preserves source timing and transfers later attachments', () => {
  const t = base(); t.clips[0].speedPoints = motion.SPEED_PRESETS.montage; t.layerSettings = { z: { attachment: { clipId: 'a', offset: 1 } } };
  const at = model.clipLength(t.clips[0]) / 2, next = model.splitClip(t, 'a', at);
  assert.ok(Math.abs(model.duration(next) - model.duration(t)) < 1e-8);
  for (let i = 0; i < 20; i++) { const time = i / 20 * model.clipLength(t.clips[0]); const half = time < at ? next.clips[0] : next.clips[1], local = time < at ? time : time - at; assert.ok(Math.abs(motion.sourceAt(t.clips[0], time) - motion.sourceAt(half, local)) < 1e-8); }
  assert.equal(next.clips[0].out, next.clips[1].in);
});
test('moving and deleting a collapsed compound acts on the whole block', () => {
  const t = { ...base(), clips: [clip('a'), clip('b'), clip('c'), clip('d')] };
  let grouped = workflow.makeCompound(t, ['a', 'b', 'z'], 'One'); grouped = workflow.makeCompound(grouped, ['c', 'd'], 'Two');
  const moved = workflow.reconcileAttachments(grouped, workflow.moveFootage(grouped, 'a', 1));
  assert.equal(moved.clips.map(c => c.id).join(','), 'c,d,a,b'); assert.equal(moved.effects[0].start, 9);
  const deleted = workflow.reconcileAttachments(moved, workflow.deleteSelection(moved, 'a')); assert.equal(deleted.clips.map(c => c.id).join(','), 'c,d'); assert.equal(deleted.effects.length, 0); model.validateTimeline(deleted, [asset]);
});
test('keyframes hold, interpolate and survive validation in footage and graphic layers', () => {
  const keys = [{ ...motion.IDENTITY, time: 0, easing: 'linear' }, { ...motion.IDENTITY, scale: 2, rotation: 30, time: 2, easing: 'easeInOut' }];
  assert.equal(motion.transformAt(keys, 1).scale, 1.5); assert.equal(motion.transformAt(keys, 3).scale, 2);
  const t = base(); t.clips[0].keyframes = keys; t.layerSettings = { text: { keyframes: keys } };
  const valid = model.validateTimeline(t, [asset]); assert.equal(valid.clips[0].keyframes.length, 2); assert.equal(valid.layerSettings.text.keyframes.length, 2);
  assert.throws(() => motion.validateKeyframes([keys[0], keys[0]]), /distinct/); assert.throws(() => motion.validateSpeedPoints([{ at: .2, speed: 1 }, { at: 1, speed: 1 }]), /0%/);
});
test('export renders a real ramp with audio, motion keyframes and freeze frame', { timeout: 120000 }, async () => {
  const os = require('node:os'), { execFileSync } = require('node:child_process'), { renderVideo } = load('src/video/render.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bopzi-workflow-test-'));
  const dimensions = model.dimensions; model.dimensions = () => [320, 180];
  try {
    execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=30:duration=3','-f','lavfi','-i','sine=frequency=440:duration=3','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(dir,'source.mp4')], { windowsHide: true });
    const a = { ...asset, duration: 3 }, c = { ...clip('ramp', 0, 2), speedPoints: motion.SPEED_PRESETS.montage, keyframes: [{ ...motion.IDENTITY, time: 0, easing: 'linear' }, { ...motion.IDENTITY, scale: 1.2, rotation: 5, x: .03, opacity: .75, time: 1, easing: 'linear' }] };
    const t = model.validateTimeline({ ...model.EMPTY, clips: [c, { ...clip('freeze', 0, 2), freeze: 1, hold: .5, volume: 0 }] }, [a]);
    const result = require('node:fs').readFileSync(await renderVideo(t, [a], new Map([[a.id, path.join(dir,'source.mp4')]]), [], dir));
    assert.ok(result.length > 2000);
    const info = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_format','-show_streams','-of','json',path.join(dir,'bopzi.mp4')], { encoding: 'utf8', windowsHide: true }));
    assert.ok(Math.abs(Number(info.format.duration) - model.duration(t)) < .12); assert.ok(info.streams.some(s => s.codec_type === 'audio'));
    execFileSync('ffmpeg', ['-v','error','-i',path.join(dir,'bopzi.mp4'),'-f','null','-'], { windowsHide: true });
  } finally { model.dimensions = dimensions; fs.rmSync(dir, { recursive: true, force: true }); }
});
