const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file, exports);
  const requireLocal = name => {
    if (name === './faces') return { face: () => ({ family: 'Arial', weight: '700' }) };
    if (name === './overlays') return { drawOverlay() {} };
    return name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name);
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: requireLocal, crypto: require('node:crypto').webcrypto, Map, Set });
  return exports;
}
const model = load('src/video/model.ts'), motion = load('src/video/motion.ts'), editing = load('src/video/editing.ts'), layers = load('src/video/layers.ts'), recipes = load('src/video/recipes.ts');
const asset = { id: 'source', name: 'Gameplay.mp4', kind: 'video', duration: 12, width: 1920, height: 1080 };
const counter = { ...motion.newEffect('counter', 1, 'counter'), from: 0, to: 10000, duration: 5, countDelay: .5, countDuration: 2, entrance: 'none', bounce: false, easing: 'linear' };
const base = { ...model.EMPTY, clips: [model.newClip(asset)], titles: [model.newTitle(1, 'DO NOT CHANGE')], effects: [counter] };

test('highlight refinement points survive save validation and reject invalid labels', () => {
  const highlight = { ...motion.newEffect('highlight', 0, 'piano'), points: [{ x: .5, y: .35, label: 1 }, { x: .6, y: .6, label: 0 }] };
  const saved = model.validateTimeline({ ...base, effects: [highlight] }, [asset]).effects[0];
  assert.equal(JSON.stringify(saved.points), JSON.stringify(highlight.points));
  assert.throws(() => model.validateTimeline({ ...base, effects: [{ ...highlight, points: [{ x: .5, y: .5, label: 2 }] }] }, [asset]), /include or exclude/);
});

test('counter delay, count duration and final hold are independent of layer visibility', () => {
  assert.equal(motion.counterAt(counter, .9), null);
  assert.equal(motion.counterAt(counter, 1.2).value, 0);
  assert.equal(motion.counterAt(counter, 2.5).value, 5000);
  assert.equal(motion.counterAt(counter, 3.5).value, 10000);
  assert.equal(motion.counterAt(counter, 5.9).value, 10000);
  assert.equal(motion.counterAt(counter, 6), null);
  assert.equal(motion.counterAt({ ...counter, duration: 8 }, 2.5).value, 5000);
  for (const t of [5, 2, 4, 1.6, 2.5]) assert.equal(motion.counterAt(counter, t).value, motion.counterAt(counter, t).value);
});
test('counter formatting handles decimals, negatives, padding, steps and exact endpoints', () => {
  assert.equal(motion.formatCount(-1234.5, 'full', { decimals: 2 }), '-1,234.50');
  assert.equal(motion.formatCount(7, 'full', { padding: 4, separators: false }), '0007');
  assert.equal(motion.formatCount(10000, 'short'), '10K');
  const stepped = { ...counter, from: 10, to: -7, step: 5 };
  assert.equal(motion.counterAt(stepped, 2.5).value, 5);
  assert.equal(motion.counterAt(stepped, 3.5).value, -7);
  assert.equal(motion.counterAt({ ...counter, easing: 'easeInOut' }, 2.5).value, 5000);
});
test('counter selection bounds exist in drawn order and disappear when hidden or out of time', () => {
  const ctx = { save() {}, restore() {}, measureText: text => ({ width: [...text].reduce((sum, c) => sum + (c === '1' ? 5 : 10), 0) }) };
  const boxes = layers.layerBoxes(ctx, base, [], 2, 1920, 1080);
  const box = boxes.find(i => i.id === counter.id);
  assert.ok(box && box.w > 0 && box.h > 0);
  assert.equal(boxes.at(-1).id, counter.id);
  assert.equal(layers.layerBoxes(ctx, base, [], 0, 1920, 1080).some(i => i.id === counter.id), false);
  assert.equal(layers.layerBoxes(ctx, { ...base, layerSettings: { counter: { hidden: true } } }, [], 2, 1920, 1080).some(i => i.id === counter.id), false);
  assert.equal(layers.layerBoxes(ctx, base, [], 5, 1920, 1080).find(i => i.id === counter.id).w, box.w);
});
test('selected AI edits preserve unrelated work even when the model rewrites the project', () => {
  const proposed = { ...base, name: 'WRONG', titles: [], effects: [{ ...counter, to: 25000 }, { ...counter, id: 'extra' }] };
  const merged = editing.mergeAiEdit(base, proposed, counter.id);
  assert.equal(merged.name, base.name); assert.equal(merged.titles[0].text, 'DO NOT CHANGE');
  assert.equal(merged.effects.length, 1); assert.equal(merged.effects[0].to, 25000);
  assert.equal(editing.mergeAiEdit(base, { ...base, effects: [] }, counter.id).effects[0].id, counter.id);
});
test('locks protect updates/deletion and visibility/metadata survive save validation', () => {
  const locked = { ...base, layerSettings: { counter: { name: 'My Robux', locked: true, hidden: true } } };
  assert.equal(editing.patchItem(locked, counter.id, { to: 99 }), locked);
  const merged = editing.mergeAiEdit(locked, { ...base, effects: [] }, null);
  assert.equal(merged.effects[0].to, counter.to);
  const saved = model.validateTimeline(JSON.parse(JSON.stringify(locked)), [asset]);
  assert.equal(saved.layerSettings.counter.name, 'My Robux');
  assert.equal(saved.layerSettings.counter.locked, true);
  assert.equal(editing.visibleTimeline(saved).effects.length, 0);
  assert.equal(editing.visibleTimeline(saved).clips.length, 1);
  const copy = editing.duplicateItem(saved, counter.id);
  assert.equal(copy.timeline.effects.length, 2); assert.equal(copy.timeline.layerSettings[copy.id].locked, false);
  assert.equal(model.validateTimeline(copy.timeline, [asset]).effects.length, 2);
});
test('counter controls round-trip and invalid settings are rejected', () => {
  const saved = model.validateTimeline({ ...base, effects: [{ ...counter, decimals: 2, padding: 4, step: .5, separators: false }] }, [asset]).effects[0];
  for (const key of ['countDelay', 'countDuration', 'entrance', 'bounce', 'easing']) assert.equal(saved[key], counter[key]);
  assert.equal(saved.decimals, 2); assert.equal(saved.step, .5); assert.equal(saved.separators, false);
  assert.throws(() => model.validateTimeline({ ...base, effects: [{ ...counter, countDuration: 0 }] }, [asset]), /count duration/);
  const old = { ...counter }; for (const key of ['countDelay', 'countDuration', 'entrance', 'bounce', 'easing']) delete old[key];
  const restored = model.validateTimeline({ ...base, effects: [old] }, [asset]).effects[0];
  assert.equal(restored.entrance, 'pop'); assert.equal(restored.bounce, true);
});
test('Roblox recipes add editable native elements with valid timing and IDs', () => {
  for (const recipe of recipes.RECIPES) {
    const result = recipes.applyRecipe(base, recipe.id, 11.5);
    model.validateTimeline(result, [asset]);
    assert.ok(result.titles.length > base.titles.length || result.effects.length > base.effects.length);
    for (const item of editing.items(result)) assert.ok(item.start + item.duration <= 12.001);
    assert.ok(Object.keys(result.layerSettings).length);
  }
});
test('timing snaps to playhead/clip edges and otherwise to frames', () => {
  assert.equal(editing.snapTime(2.03, [0, 2, 4], 100), 2);
  assert.equal(editing.snapTime(2.51, [0, 2, 4], 100), 2.5);
  assert.equal(editing.snapTime(-1, [0, 2], 100), 0);
  const zoom = { id: 'zoom', kind: 'zoom', mode: 'hold', start: 0, duration: 4, rampDuration: 3, amount: 1.5, x: .5, y: .5 };
  assert.equal(editing.patchItem({ ...base, effects: [zoom] }, 'zoom', { duration: 1 }).effects[0].rampDuration, 1);
});

test('removing imported media removes its uses, persists the library removal and remains undoable', () => {
  const image = { ...asset, id: 'image', name: 'Logo.png', kind: 'image', duration: 4 };
  const picture = { id: 'overlay', source: 'image', assetId: image.id, style: 'color', start: 0, duration: 2, x: .5, y: .5, size: .2, animation: 'none' };
  const before = { ...base, clips: [...base.clips, model.newClip(image)], overlays: [picture] };
  const after = editing.removeMediaFromProject(before, image.id);
  assert.equal(after.clips.length, 1); assert.equal(after.overlays.length, 0);
  assert.equal(after.removedMediaIds[0], image.id);
  assert.equal(before.clips.length, 2); assert.equal(before.overlays.length, 1, 'undo revision keeps original references');
  const saved = model.validateTimeline(JSON.parse(JSON.stringify(after)), [asset, image]);
  assert.equal(saved.removedMediaIds[0], image.id);
  const restored = model.validateTimeline(JSON.parse(JSON.stringify(before)), [asset, image]);
  assert.equal(restored.clips.length, 2); assert.equal(restored.overlays[0].assetId, image.id);
  assert.throws(() => editing.removeMediaFromProject({ ...before, layerSettings: { overlay: { locked: true } } }, image.id), /Unlock/);
});
