const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

test('pausing retains the complete canvas while its corrective video seek decodes', () => {
  let raf, hook = 0, mounted = false, black = 0, footage = 0, overlays = 0;
  const refs = [], effects = [];
  class Media { pause() { this.paused = true; } removeAttribute() {} load() {} }
  class Video extends Media {
    constructor() { super(); this.actual = .5; this.readyState = 2; this.seeking = false; this.paused = true; this.seeks = 0; }
    get currentTime() { return this.actual; }
    set currentTime(value) { this.pending = value; this.seeking = true; this.readyState = 1; this.seeks++; }
    play() { this.paused = false; return Promise.resolve(); }
    decoded() { this.actual = this.pending; this.readyState = 2; this.seeking = false; }
  }
  class Image {}
  const video = new Video();
  const ctx = { save() {}, restore() {}, fillRect() { black++; } };
  const canvas = { width: 1920, height: 1080, getContext: () => ctx };
  const react = {
    forwardRef: fn => fn, useMemo: fn => fn(), useImperativeHandle() {},
    useRef: initial => refs[hook++] ?? (refs[hook - 1] = { current: initial }),
    useEffect: fn => { if (!mounted) effects.push(fn); },
  };
  const exports = {};
  const clip = { id: 'clip', assetId: 'video', in: 0, out: 3, speed: 1, volume: 1, fade: false };
  const timeline = { clips: [clip], audio: [], videoOverlays: [], effects: [], format: 'landscape' };
  const dependencies = {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    './editing': { visibleTimeline: t => t },
    './layers': { drawScene: () => { overlays++; } },
    './blur': { drawBlurs() {} },
    './clip-motion': { pictureAt: (c, t) => c.in + t * c.speed, speedAt: c => c.speed },
    './footage': { drawFootage: () => { footage++; } },
    './pip': { drawVideoOverlay() {}, footageArea: () => undefined, videoOverlaysAt: () => [] },
    './model': { dimensions: () => [1920, 1080], duration: t => t.clips.length ? 3 : 0, positions: t => t.clips.map(c => ({ clip: c, start: 0, end: 3 })), clipLength: () => 3 },
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/video/Preview.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: name => dependencies[name], document: { createElement: () => video },
    HTMLMediaElement: Media, HTMLVideoElement: Video, HTMLAudioElement: class extends Media {}, HTMLImageElement: Image,
    performance: { now: () => 0 }, requestAnimationFrame: fn => { raf = fn; return 1; }, cancelAnimationFrame() {},
  });
  const props = { timeline, assets: [{ id: 'video', kind: 'video', url: 'blob:video' }], time: .5, playing: true, onTime() {}, onEnd() {}, muted: true };
  function render(changes = {}) { Object.assign(props, changes); hook = 0; const element = exports.default(props, {}); element.props.ref.current = canvas; if (!mounted) { mounted = true; effects.forEach(fn => fn()); } }
  render(); raf(31);
  assert.equal(footage, 1);
  render({ playing: false, time: .531 }); raf(62);
  assert.equal(video.seeks, 1);
  assert.equal(video.paused, true);
  assert.equal(black, 1, 'pause must not clear the previous picture');
  assert.equal(overlays, 1, 'translucent overlays must not accumulate on a retained frame');
  raf(93); raf(124);
  assert.equal(video.seeks, 1, 'an in-flight seek must not be restarted every animation frame');
  assert.equal(black, 1);
  video.decoded(); raf(155);
  assert.equal(footage, 2, 'the decoded paused frame replaces the retained picture');
  assert.equal(overlays, 2);
  render({ timeline: { ...timeline, clips: [] } }); raf(186);
  assert.equal(black, 3, 'removing all footage still clears the preview');
});
