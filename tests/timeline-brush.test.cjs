const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => dependencies[name] || require(name) });
  return exports;
}
const mask = load('src/video/mask.ts');
const { brushMask } = load('src/video/mask-brush.ts', { './mask': mask });
const { packTimelineRows } = load('src/video/timeline-layout.ts');

test('concurrent effects get separate rows, adjacent effects reuse rows', () => {
  const entries = [{ id: 'counter', start: 0, duration: 4 }, { id: 'zoom', start: 0, duration: 4 }, { id: 'flash', start: 4, duration: 1 }];
  const packed = packTimelineRows(entries, 50);
  assert.equal(packed.count, 2);
  assert.notEqual(packed.rows.get('counter'), packed.rows.get('zoom'));
  assert.equal(packed.rows.get('flash'), 0);
  assert.equal(entries[0].duration, 4, 'layout must preserve effect timing');
});
test('minimum-width short effects cannot cover each other even when zoomed out', () => {
  const entries = Array.from({ length: 25 }, (_, i) => ({ id: String(i), start: i / 100, duration: .001 }));
  for (const px of [10, 28, 80, 200]) {
    const { rows } = packTimelineRows(entries, px);
    for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
      if (rows.get(entries[i].id) !== rows.get(entries[j].id)) continue;
      assert.ok(entries[i].start * px + Math.max(6, entries[i].duration * px) <= entries[j].start * px + 1e-7);
    }
  }
});

test('dragging and trimming keep an effect in its original row, including after release', () => {
  const original = [{ id: 'highlight', start: 0, duration: 2 }, { id: 'counter', start: 0, duration: 4 }, { id: 'zoom', start: 0, duration: 4 }];
  const initial = packTimelineRows(original, 50), pinnedRow = initial.rows.get('highlight');
  let previous = initial.rows;
  for (const start of [.02, 1, 3, 5, 1, 0]) {
    const moved = original.map(item => item.id === 'highlight' ? { ...item, start } : item);
    const dragging = packTimelineRows(moved, 50, previous, 'highlight');
    assert.equal(dragging.rows.get('highlight'), pinnedRow, `row changed at ${start}s`);
    const dropped = packTimelineRows(moved, 50, dragging.rows);
    assert.equal(dropped.rows.get('highlight'), pinnedRow, 'row must not jump on release');
    previous = dropped.rows;
  }
  const trimmed = packTimelineRows(original.map(item => item.id === 'highlight' ? { ...item, duration: 8 } : item), 50, previous, 'highlight');
  assert.equal(trimmed.rows.get('highlight'), pinnedRow);
});

test('moving into an occupied row preserves the dragged row and prevents visual overlap', () => {
  const original = [{ id: 'a', start: 0, duration: 1 }, { id: 'b', start: 2, duration: 1 }];
  const initial = packTimelineRows(original, 50);
  const moved = [{ ...original[0], start: 2 }, original[1]];
  const dragging = packTimelineRows(moved, 50, initial.rows, 'a');
  assert.equal(dragging.rows.get('a'), initial.rows.get('a'));
  assert.notEqual(dragging.rows.get('a'), dragging.rows.get('b'));
  const released = packTimelineRows(moved, 50, dragging.rows);
  assert.equal(released.rows.get('a'), dragging.rows.get('a'));
  assert.equal(released.rows.get('b'), dragging.rows.get('b'));
});
const empty = { start: 0, fps: 12, w: 100, h: 60, frames: ['', '', ''] };
test('a fast brush stroke paints continuously and only changes the chosen frame', () => {
  const result = brushMask(empty, [{ x: .1, y: .5 }, { x: .9, y: .5 }], .02, true, 1);
  assert.equal(result.frames[0], ''); assert.equal(result.frames[2], '');
  const pixels = mask.decodeMask(result.frames[1], 6000);
  for (let x = 10; x < 90; x++) assert.equal(pixels[30 * 100 + x], 1);
  assert.equal(pixels[0], 0);
  assert.equal(empty.frames[1], '', 'original remains intact for Undo');
});
test('erase removes mask pixels directly while preserving nearby detail', () => {
  const painted = brushMask(empty, [{ x: .1, y: .5 }, { x: .9, y: .5 }], .02, true, 1);
  const erased = brushMask(painted, [{ x: .5, y: .5 }], .04, false, 1);
  const pixels = mask.decodeMask(erased.frames[1], 6000);
  assert.equal(pixels[30 * 100 + 50], 0);
  assert.equal(pixels[30 * 100 + 20], 1);
  assert.equal(mask.decodeMask(painted.frames[1], 6000)[30 * 100 + 50], 1);
});
test('entire-highlight scope explicitly applies a stroke across all mask frames', () => {
  const result = brushMask(empty, [{ x: .5, y: .5 }], .05, true);
  for (const frame of result.frames) assert.equal(mask.decodeMask(frame, 6000)[30 * 100 + 50], 1);
});
