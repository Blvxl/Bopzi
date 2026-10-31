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
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name), crypto: require('node:crypto').webcrypto, Map, Set });
  return exports;
}
const model = load('src/video/model.ts'), { applyRecipe, RECIPES } = load('src/video/recipes.ts'), { timelineDifferences } = load('src/video/ai-review.ts');
const asset = { id: 'video', name: 'Roblox.mp4', kind: 'video', duration: 12, width: 1920, height: 1080 };
const base = model.validateTimeline({ ...model.EMPTY, clips: [model.newClip(asset)], titles: [model.newTitle(0, 'KEEP THIS')] }, [asset]);

test('review reports additions, edits and deletions from the actual timelines without mutating the original', () => {
  const original = JSON.stringify(base);
  const added = { ...model.newTitle(2, 'NEW TITLE'), id: 'new' };
  const after = { ...base, clips: [{ ...base.clips[0], speed: 2 }], titles: [added] };
  const diff = timelineDifferences(base, after, [asset]);
  assert.equal(diff.differences.filter(d => d.action === 'added').length, 1);
  assert.equal(diff.differences.filter(d => d.action === 'removed').length, 1);
  assert.equal(diff.differences.filter(d => d.action === 'updated').length, 1);
  assert.ok(diff.ids.has(base.titles[0].id), 'deleted layers must be included');
  assert.ok(diff.differences.find(d => d.id === base.clips[0].id).details.includes('Speed: 1 → 2'));
  assert.equal(JSON.stringify(base), original);
});
test('review catches clip reordering and global settings even when layer fields do not change', () => {
  const second = { ...model.newClip(asset), id: 'second', out: 2 };
  const before = { ...base, clips: [{ ...base.clips[0], out: 2 }, second] };
  const after = { ...before, clips: [second, before.clips[0]], format: 'vertical', name: 'UPDATED', captionStyle: { ...base.captionStyle, color: '#ff0000' } };
  const diff = timelineDifferences(before, after, [asset]);
  assert.equal(diff.differences.filter(d => d.kind === 'clips').length, 2);
  assert.equal(diff.settings.length, 3);
  assert.equal(timelineDifferences(base, base).differences.length, 0);
});
test('all Roblox packs fit the playhead range, preserve existing edits, and produce selectable native layers', () => {
  for (const recipe of RECIPES) for (const at of [0, 4, 11.75]) {
    const original = JSON.stringify(base), next = applyRecipe(base, recipe.id, at, { duration: 5, amount: 12345, title: 'MY GAME UPDATE', subtitle: 'NEW MAP', rarity: 'MYTHIC', color: '#b49aff' });
    model.validateTimeline(next, [asset]);
    assert.equal(JSON.stringify(base), original);
    assert.equal(JSON.stringify(next.clips), JSON.stringify(base.clips));
    assert.equal(JSON.stringify(next.titles[0]), JSON.stringify(base.titles[0]));
    const additions = timelineDifferences(base, next).differences;
    assert.ok(additions.length > 0, recipe.id);
    assert.ok(additions.every(d => d.action === 'added'));
    for (const item of [...next.effects, ...next.titles.slice(base.titles.length)]) {
      assert.ok(item.start >= at - 1e-8, recipe.id);
      assert.ok(item.start + item.duration <= 12 + 1e-8, recipe.id);
      assert.ok(next.layerSettings[item.id].name.includes(recipe.name));
    }
  }
});
test('pack customisation controls values and impact without flattening the result', () => {
  const robux = applyRecipe(base, 'robux', 1, { amount: 123456, title: 'BOSS REWARD', impact: false });
  assert.equal(robux.effects.find(e => e.kind === 'counter').to, 123456);
  assert.equal(robux.effects.length, 1);
  assert.ok(robux.titles.some(t => t.text === 'BOSS REWARD'));
  const drop = applyRecipe(base, 'drop', 2, { title: 'ICE SWORD', rarity: 'MYTHIC', color: '#b49aff' });
  assert.ok(drop.titles.some(t => t.text === 'MYTHIC DROP'));
  assert.ok(drop.titles.some(t => t.text === 'ICE SWORD'));
  const update = applyRecipe(base, 'update', 2, { title: 'WINTER UPDATE', subtitle: 'NEW MAPS' });
  assert.ok(update.titles.some(t => t.text === 'WINTER UPDATE'));
  assert.ok(update.titles.some(t => t.text === 'NEW MAPS'));
  assert.ok(update.titles.some(t => t.text === 'PLAY NOW'));
});
