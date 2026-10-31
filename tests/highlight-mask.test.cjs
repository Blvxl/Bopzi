const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsMask = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/video/mask.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsMask });
const { chooseObjectMask, objectPrompts, maskArea, encodeMask, decodeMask, invertMaskInBox, highlightObjectPixels, seededComponents } = exportsMask;
const w = 40, h = 30, box = [10, 7, 30, 25], seed = [20, 12];
function piano() {
  const mask = new Uint8Array(w * h);
  for (let y = 9; y < 17; y++) for (let x = 12; x < 28; x++) mask[y * w + x] = 1;
  for (let y = 17; y < 24; y++) for (const x of [13, 14, 25, 26]) mask[y * w + x] = 1;
  return mask;
}
test('an inverted piano mask selects the piano, leaving the surrounding scene clear', () => {
  const object = piano(), background = object.map(v => v ? 0 : 1);
  const chosen = chooseObjectMask([background], [.99], box, null, w, h, seed);
  assert.ok(chosen);
  assert.deepEqual(Array.from(chosen), Array.from(object));
  assert.equal(chosen[0], 0);
  assert.equal(chosen[12 * w + 20], 1);
});
test('scene confidence cannot override object containment and the foreground seed', () => {
  const object = piano(), scene = new Uint8Array(w * h).fill(1);
  const part = new Uint8Array(w * h); part.fill(1, 9 * w + 12, 9 * w + 16);
  const chosen = chooseObjectMask([scene, part, object], [1, .99, .4], box, null, w, h, seed);
  assert.deepEqual(Array.from(chosen), Array.from(object));
  assert.equal(chooseObjectMask([scene], [1], box, null, w, h, seed), null);
});
test('foreground prompts name the object while negative prompts exclude the surroundings', () => {
  const prompts = objectPrompts(box, w, h);
  assert.deepEqual(Array.from(prompts.points[0]), [20, 16]);
  assert.equal(prompts.labels[0], 1);
  assert.equal(prompts.labels.length, 5);
  for (let i = 1; i < prompts.points.length; i++) {
    const [x, y] = prompts.points[i];
    assert.equal(prompts.labels[i], 0);
    assert.ok(x < box[0] || x >= box[2] || y < box[1] || y >= box[3]);
  }
  assert.deepEqual(Array.from(objectPrompts(box, w, h, [seed]).points[0]), seed);
});
test('repairing a saved inverted selection preserves piano holes and empty frames', () => {
  const object = piano(), background = object.map(v => v ? 0 : 1);
  const repaired = decodeMask(invertMaskInBox(encodeMask(background), w, h, box), w * h);
  assert.deepEqual(Array.from(repaired), Array.from(object));
  assert.equal(maskArea(repaired), maskArea(object));
  assert.equal(repaired[20 * w + 20], 0, 'space between legs stays clear');
  assert.equal(invertMaskInBox('', w, h, box), '');
});
test('tracking stays with the selected object when a larger competing object appears', () => {
  const object = piano(), large = new Uint8Array(w * h);
  for (let y = 7; y < 25; y++) for (let x = 10; x < 30; x++) large[y * w + x] = 1;
  const chosen = chooseObjectMask([large, object], [.99, .5], box, object, w, h, seed);
  assert.deepEqual(Array.from(chosen), Array.from(object));
});

test('explicit clicks preserve include/exclude labels sent to the model', () => {
  const prompts = objectPrompts(box, w, h, [[20, 12], [20, 20]], [1, 0]);
  assert.equal(prompts.labels[0], 1);
  assert.equal(prompts.labels[1], 0);
});

test('component cleanup removes detached plant and stool fragments without filling piano gaps', () => {
  const object = piano(), noisy = object.slice();
  for (let y = 7; y < 9; y++) for (let x = 10; x < 12; x++) noisy[y * w + x] = 1;
  for (let y = 20; y < 23; y++) for (let x = 28; x < 30; x++) noisy[y * w + x] = 1;
  // Ensure the plant is detached even with diagonal (8-way) connectivity.
  noisy[8 * w + 11] = 0;
  assert.deepEqual(Array.from(seededComponents(noisy, w, h, [seed])), Array.from(object));
});

test('negative clicks reject connected spill between piano legs, even with a high model score', () => {
  const correct = piano(), spill = correct.slice();
  for (let y = 17; y < 24; y++) for (let x = 15; x < 25; x++) spill[y * w + x] = 1;
  const chosen = chooseObjectMask([spill, correct], [.99, .3], box, null, w, h, seed, [{ point: seed, label: 1 }, { point: [20, 20], label: 0 }]);
  assert.deepEqual(Array.from(chosen), Array.from(correct));
});

test('rendering old saved background masks repairs them without requiring a new trace', () => {
  const object = piano(), background = object.map(v => v ? 0 : 1);
  // Other people/objects are also holes in the scene mask, outside the piano box.
  for (let y = 12; y < 25; y++) for (let x = 1; x < 7; x++) background[y * w + x] = 0;
  const rendered = highlightObjectPixels(encodeMask(background), w, h, box);
  assert.deepEqual(Array.from(rendered), Array.from(object));
  assert.equal(rendered[13 * w + 3], 0, 'other objects must not become highlighted');
  assert.equal(rendered[0], 0, 'the image border must not glow');
});

test('render safety preserves a correct moving object after it leaves its initial box', () => {
  const moved = new Uint8Array(w * h);
  for (let y = 9; y < 17; y++) for (let x = 2; x < 9; x++) moved[y * w + x] = 1;
  assert.deepEqual(Array.from(highlightObjectPixels(encodeMask(moved), w, h, box)), Array.from(moved));
  const object = piano();
  assert.deepEqual(Array.from(highlightObjectPixels(encodeMask(object), w, h, box)), Array.from(object));
  assert.equal(maskArea(highlightObjectPixels(encodeMask(new Uint8Array(w * h).fill(1)), w, h, box)), 0, 'an all-scene mask cannot become a glowing rectangle');
});

test('the shared preview/export renderer paints the repaired silhouette without an outer glow', () => {
  const layers = {}, painted = new Uint8Array(w * h);
  const maskLook = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/video/maskLook.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: maskLook });
  let drawCalls = 0;
  const document = { createElement() {
    const canvas = {};
    canvas.getContext = () => ({
      createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: image => { canvas.image = image; },
    });
    return canvas;
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/video/layers.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: layers, require: name => name === './mask' ? exportsMask : name === './maskLook' ? maskLook : {}, document,
  });
  const object = piano(), background = object.map(v => v ? 0 : 1);
  const item = { id: 'piano', kind: 'highlight', x: .5, y: 16 / h, w: .5, h: 18 / h, color: '#3ddc84', style: 'tint', mask: { start: 0, fps: 12, w, h, frames: [encodeMask(background)] } };
  const ctx = { save() {}, restore() {}, shadowBlur: 0, drawImage(canvas) {
    drawCalls++;
    assert.equal(this.shadowBlur, 0, 'object highlight must not blur onto the background');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = Math.floor((x + .5) * canvas.width / w), sy = Math.floor((y + .5) * canvas.height / h); if (canvas.image.data[(sy * canvas.width + sx) * 4 + 3] > 127) painted[y * w + x] = 1; }
  } };
  layers.drawLayers(ctx, [{ kind: 'highlight', item, alpha: 1, scale: 1, frame: 0 }], w, h, () => undefined);
  const expected = maskLook.smoothMask(object, w, h, Math.max(1, Math.round(1280 / w)));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) assert.equal(painted[y * w + x], expected.mask[Math.floor((y + .5) * expected.h / h) * expected.w + Math.floor((x + .5) * expected.w / w)]);
  assert.equal(drawCalls, 1, 'coloured-in highlights paint the silhouette without a bright rim pass');
});
