// Schema checks run without a browser, network calls, or generated artwork.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/studio/arrangePlan.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const moduleUnderTest = { exports: {} };
vm.runInNewContext(output, { module: moduleUnderTest, exports: moduleUnderTest.exports });
const { parsePlan, parseReview, applyExistingLayout } = moduleUnderTest.exports;
const input = {
  wordings: [{ kind: 'value', text: '1/67' }], prize: [.6, .2, .4, .8], faces: [[.7,.3,.2,.2]],
  subjectOutline: [[.1,.2],[.4,.2],[.3,.8]], protected: [[.2,.4,.1,.2]],
  plus: { text: '+1', at: [[.1,.5],[.2,.7],[.3,.8]] },
  layouts: [
    { name: 'Counter', heading: true, labelBox: [.65,.04,.3,.14], placements: [{ id: 'text-1', center: [.8,.1], scale: 999, rotation: 300 }, { id: 'text-1', center: [.1,.1] }] },
    { name: 'Action', heading: false, plusAt: [[.2,.5]] },
    { name: 'Artwork', heading: false },
  ],
};
const plan = parsePlan(JSON.stringify(input));
assert.equal(plan.wordings[0].text, '1/67');
assert.equal(plan.plusAt.length, 2);
assert.equal(plan.layouts.length, 3);
assert.equal(plan.layouts[2].heading, false);
assert.equal(plan.layouts[0].placements.length, 1);
assert.equal(plan.layouts[0].placements[0].scale, 1.5);
assert.equal(plan.layouts[0].placements[0].rotation, 18);
assert.equal(plan.subjectOutline.length, 3);
assert.equal(plan.arrow, false);
assert.equal(parsePlan(JSON.stringify({ ...input, prize: [1,0,.2,.3] })), null);
assert.equal(parsePlan('not JSON'), null);
assert.equal(parsePlan(JSON.stringify({ ...input, wordings: [] })).wordings.length, 0);
assert.equal(parsePlan(JSON.stringify({ ...input, subjectOutline: [[.1,.2],[99,.2]] })).subjectOutline.length, 0);
assert.equal(parseReview('{"best":99}', 3), null);
assert.equal(parseReview('{"best":-1}', 3), null);
assert.equal(parseReview('{"best":0,"accepted":[true]}', 3), null);
const review = parseReview(JSON.stringify({ best: 2, accepted: [true,false,true], feedback: 'Clear face and counter', layouts: input.layouts }), 3);
assert.equal(review.best, 2);
assert.equal(review.accepted[1], false);
assert.equal(review.layouts.length, 3);
const text = { id: 'text', type: 'text', text: '1/67', font: 'lilita', fill: '#fff', x: 5, y: 5, rotation: 0, scaleX: 1, scaleY: 1, locked: false, visible: true };
const pinned = { ...text, id: 'pinned', text: '+1', locked: true };
const hidden = { ...text, id: 'hidden', visible: false };
const doc = { background: '#000', layers: [text, pinned, hidden] };
const edited = applyExistingLayout(doc, [text, pinned, hidden].map(l => ({ ...l, text: 'MUST NOT REPLACE WORDS', fill: '#f00', x: 500, y: 200, scaleX: .8, scaleY: .8 })));
assert.equal(edited.layers[0].text, '1/67');
assert.equal(edited.layers[0].fill, '#fff');
assert.equal(edited.layers[0].font, 'lilita');
assert.equal(edited.layers[0].x, 500);
assert.equal(edited.layers[0].scaleX, .8);
assert.equal(edited.layers[1], pinned);
assert.equal(edited.layers[2], hidden);
assert.equal(doc.layers[0].x, 5);
console.log('Arrangement checks passed: fractions, artwork-only options, outlines, bounded placements, review validation, exact wording/style preservation, pins, hidden layers and immutable input.');

const styled = { role: 'counter', anchor: 'prize', text: '1/67', box: [.65,.04,.3,.2], font: 'titan', fontSize: 240, fill: '#FFE34A', fillStops: ['#FF6545','#58DC65','#7677FF'], stroke: '#080808', strokeRatio: .095, shadowRatio: .02, rotation: -8, letterSpacing: 2 };
const measured = parsePlan(JSON.stringify({ ...input, layouts: [{ name: 'Rarity', referenceIndex: 2, rationale: 'Counter follows prize', callouts: [styled] }, { callouts: [] }, { callouts: [{ ...styled, font: 'invalid', fontSize: 99999, strokeRatio: 4, fill: 'url(bad)', box: [0,0,0,0] }] }] }));
assert.equal(measured.layouts[0].referenceIndex, 2);
assert.equal(measured.layouts[0].callouts[0].text, '1/67');
assert.equal(measured.layouts[0].callouts[0].font, 'titan');
assert.equal(measured.layouts[0].callouts[0].fontSize, 240);
assert.equal(measured.layouts[0].callouts[0].strokeRatio, .095);
assert.deepEqual(Array.from(measured.layouts[0].callouts[0].fillStops), styled.fillStops);
assert.equal(measured.layouts[1].callouts.length, 0);
assert.equal(measured.layouts[2].callouts.length, 0);
const repaired = parseReview(JSON.stringify({ best: 0, accepted: [true,true,false], layouts: [{ callouts: [{ ...styled, font: 'anton', strokeRatio: .11 }] }, { callouts: [] }, { callouts: [] }] }), 3);
assert.equal(repaired.layouts[0].callouts[0].font, 'anton');
assert.equal(repaired.layouts[0].callouts[0].strokeRatio, .11);
console.log('Reference typography and review styling checks passed.');

// Exercise the renderer's measurement contract with deterministic font metrics.
// Browser verification below covers the real fonts and canvas raster.
function loadTs(relative, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: name => {
    if (!(name in dependencies)) throw new Error('Unexpected dependency ' + name);
    return dependencies[name];
  } });
  return mod.exports;
}
class MeasuredText {
  constructor(props) { this.props = props; }
  width() { return this.props.text.length * this.props.fontSize * .6; }
  height() { return this.props.fontSize; }
  destroy() {}
}
const konva = { Text: MeasuredText };
const types = { CANVAS_W: 1920, CANVAS_H: 1080 };
const geometry = loadTs('../src/studio/geometry.ts', { konva: { default: konva }, '@/lib/fonts': { fontOf: key => ({ family: key, weight: '400' }) }, '@/lib/types': types });
const renderer = loadTs('../src/studio/arrange.ts', {
  konva: { default: konva }, '@/lib/types': types, '@/lib/assets': {}, './callouts': {}, './geometry': geometry, './imageRoute': {}, './arrangePlan': moduleUnderTest.exports,
  './factory': { makeTextLayer: (preset, overrides) => ({ id: 'test', type: 'text', name: preset.label, text: preset.sample, x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, align: 'center', locked: false, visible: true, letterSpacing: 0, ...preset.props, ...overrides }) },
});
const exactCounter = { ...styled, rotation: 0, box: [.6,.04,.36,.3] };
const gain = { ...styled, role: 'gain', anchor: 'action', text: '+1', font: 'lilita', fontSize: 100, rotation: 0, box: [.05,.65,.15,.13], fill: '#FFFFFF', fillStops: [], strokeRatio: .07 };
const renderPlan = parsePlan(JSON.stringify({ ...input, faces: [], protected: [], layouts: [{ name: 'Measured', callouts: [exactCounter, gain] }, { callouts: [] }, { callouts: [] }] }));
const built = renderer.buildTakes(renderPlan, '1/67', {});
assert.equal(built[0].label.text, '1/67');
assert.equal(built[0].label.font, 'titan');
assert.equal(built[0].label.fontSize, 240);
assert.equal(built[0].label.strokeWidth, 240 * .095);
assert.equal(built[0].marks[0].fontSize, 100);
assert.equal(built[0].marks[0].text, '+1');
assert.equal(built[0].arrow, null);
assert.equal(built[0].issues.length, 0);
assert.equal(built[1].label, null);
const placedCenter = geometry.getCenter(built[0].label);
assert.ok(Math.abs(placedCenter.x - 1920 * .78) < 1);
assert.ok(Math.abs(placedCenter.y - 1080 * .19) < 1);
console.log('Renderer checks passed: measured fonts/sizes/strokes, exact counter, smaller gains, semantic center, artwork-only and no forced arrows.');

const blockedPlan = { ...renderPlan, faces: [[.55,0,.45,.5]] };
const blockedTakes = renderer.buildTakes(blockedPlan, '1/67', {});
assert.ok(blockedTakes[0].issues.some(s => s.includes('protected detail overlap')));
const blockedCenter = geometry.getCenter(blockedTakes[0].label);
assert.ok(Math.abs(blockedCenter.x - placedCenter.x) <= 100);
assert.ok(Math.abs(blockedCenter.y - placedCenter.y) <= 100);
assert.equal(blockedTakes[0].label.text, '1/67');
console.log('Protected-face checks passed: flag unsafe placement without moving its label across the scene or rewriting it.');

const diagonal = [[.05,.95],[.12,.95],[.35,.43],[.3,.4]];
const sideGain = { ...gain, box: [.055,.42,.1,.12] };
const diagonalPlan = parsePlan(JSON.stringify({ ...input, faces: [], protected: [[.05,.4,.3,.55]], protectedOutlines: [diagonal], layouts: [{ callouts: [sideGain] }, { callouts: [] }, { callouts: [] }] }));
const besideTool = renderer.buildTakes(diagonalPlan, '', {});
assert.equal(diagonalPlan.protectedOutlines.length, 1);
assert.equal(besideTool[0].issues.length, 0);
assert.equal(besideTool[0].marks[0].text, '+1');
const gainCenter = geometry.getCenter(besideTool[0].marks[0]);
assert.ok(Math.abs(gainCenter.x - .105*1920) < 1);
assert.ok(Math.abs(gainCenter.y - .48*1080) < 1);
MeasuredText.prototype.measureSize = function(text) { return { width: this.width(), actualBoundingBoxLeft: 0, actualBoundingBoxRight: this.width(), actualBoundingBoxAscent: this.props.fontSize*.7, actualBoundingBoxDescent: this.props.fontSize*.02, fontBoundingBoxAscent: this.props.fontSize*1.2, fontBoundingBoxDescent: this.props.fontSize*.2 }; };
const inkTake = renderer.buildTakes(renderPlan, '1/67', {})[0];
const ink = renderer.layerRect(inkTake.label);
assert.ok(Math.abs(ink.x+ink.w/2 - .78*1920) < 1);
assert.ok(Math.abs(ink.y+ink.h/2 - .19*1080) < 1);
assert.equal(inkTake.label.fontSize, 240);
console.log('Diagonal-tool and glyph-ink checks passed: empty corners stay usable and the visible lettering, not its line box, matches the planned center.');
