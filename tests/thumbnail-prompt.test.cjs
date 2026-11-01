const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, resolve = require) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: resolve, Buffer, URL, AbortSignal, fetch, console });
  return exports;
}
const { thumbnailPrompt, parseThumbnailBrief } = load('src/lib/thumbnail/prompt.ts');
// references.ts imports its image fetcher; these tests never fetch, so a stand-in is enough.
const { isRobloxImageUrl, imageMime } = load('src/lib/thumbnail/references.ts', (id) => (id === './fetch-image' ? { fetchImage: () => { throw new Error('not used here'); } } : require(id)));
const brief = { scene: 'An avatar leaps across a lava obby checkpoint.', style: 'gfx', title: '', references: [] };
const image = 'data:image/png;base64,aGVsbG8=';
test('reference order separates identity images from style inspiration', () => {
  const b = parseThumbnailBrief({ ...brief, references: [image, image], styleReferenceId: 703124385 });
  const prompt = thumbnailPrompt(b);
  assert.match(prompt, /Image 1 is .*real avatar/);
  assert.match(prompt, /Image 2 is .*real avatar/);
  assert.match(prompt, /Image 3: INSPIRATION from a different game/);
  assert.match(prompt, /its characters, creatures, props, map, logo and lettering must not appear, and neither must its border, frame or corner badges/);
});
test('style-only upload is image 1, never classified as identity', () => {
  const prompt = thumbnailPrompt(parseThumbnailBrief({ ...brief, styleReference: image }));
  assert.match(prompt, /Image 1: INSPIRATION from a different game/);
  assert.doesNotMatch(prompt, /Image 1 is .*real avatar/);
});
test('rejects malformed briefs and arbitrary remote style URLs before generation', () => {
  for (const value of [null, [], { ...brief, style: '__proto__' }, { ...brief, hook: 'fake' }, { ...brief, styleReference: 'http://127.0.0.1/secret' }, { ...brief, styleReference: image, styleReferenceId: 1 }, { ...brief, references: [image, image, image, image] }]) assert.throws(() => parseThumbnailBrief(value));
});
test('existing brief without hook remains valid and defaults to gameplay', () => {
  const b = parseThumbnailBrief(brief);
  assert.equal(b.hook, 'scene');
  assert.match(thumbnailPrompt(b), /No photoreal stone/);
});
test('ordinary scenes keep their details without a forced hero layout or invented reference', () => {
  const scene = 'A fishing boat at sunset, with a giant fish instead of a shark.';
  const prompt = thumbnailPrompt(parseThumbnailBrief({ ...brief, scene }));
  assert.ok(prompt.includes(JSON.stringify(scene)));
  assert.match(prompt, /Choose framing and camera that make the requested action/);
  assert.doesNotMatch(prompt, /One hero, large and off-centre|One object close to the lens|SWAPS FROM THE INSPIRATION/);
  assert.doesNotMatch(prompt, /INSPIRATION from a different game/);
});
const forImageTool = (prompt) => prompt.replace(/\{\{[\s\S]*?\}\}/g, '');
test('typed scene text reaches only the rewrite question, so a corrected typo stays corrected', () => {
  const scene = 'A stack of casino ships on a table with a big camera.';
  const prompt = thumbnailPrompt(parseThumbnailBrief({ ...brief, scene }));
  assert.ok(prompt.includes(JSON.stringify(scene)));
  assert.doesNotMatch(forImageTool(prompt), /casino ships/);
  assert.match(forImageTool(prompt), /USER REQUIREMENTS — HIGHEST PRIORITY/);
});
test('the image tool is only told about images it receives, in order', () => {
  const ordinary = forImageTool(thumbnailPrompt(parseThumbnailBrief({ ...brief, pose: 'none', styleReference: image, references: [image] })));
  assert.deepEqual([...new Set([...ordinary.matchAll(/^Image (\d)/gm)].map(m => m[1]))], ['1', '2']);
  assert.doesNotMatch(ordinary, /never given to the image tool|swatch/i);
  const hands = forImageTool(thumbnailPrompt(parseThumbnailBrief({ ...brief, pose: 'none', scene: 'Keep both hands from the inspiration while mining.', styleReference: image, references: [image] })));
  assert.deepEqual([...new Set([...hands.matchAll(/^Image (\d)/gm)].map(m => m[1]))], ['1', '2']);
});
test('thumbnails, icons and edits all describe chunky hands that can grip', () => {
  const { refinePrompt } = load('src/lib/thumbnail/prompt.ts');
  const hand = /HANDS: Every Roblox avatar has chunky Roblox GFX hands[\s\S]*exactly four short, thick, simple fingers[\s\S]*wrap around anything held[\s\S]*Never a plain cube[\s\S]*never a mitten or two fat fingers/;
  assert.match(forImageTool(thumbnailPrompt(parseThumbnailBrief(brief))), hand);
  assert.match(forImageTool(thumbnailPrompt(parseThumbnailBrief({ ...brief, icon: true }))), hand);
  assert.match(refinePrompt('Give the avatar a sword'), hand);
});
test('any wording of a swap asks for every copy in the inspiration, however small', () => {
  const scene = 'Change the diamond/ore to something anime.';
  const prompt = thumbnailPrompt(parseThumbnailBrief({ ...brief, scene, styleReference: image, pose: 'none' }));
  assert.match(prompt, /\{\{Look at image 1\. The user's request is quoted[\s\S]*including small ones on signs, labels, icons[\s\S]*Change the diamond\/ore to something anime\.[\s\S]*?\}\}/);
  const sent = forImageTool(prompt);
  assert.match(sent, /Each thing on the left must not appear anywhere in the result, at any size/);
  assert.doesNotMatch(sent, /diamond/);
});
test('a borrowed layout borrows positions, not the inspiration\'s props', () => {
  const sent = forImageTool(thumbnailPrompt(parseThumbnailBrief({ ...brief, styleReference: image, layout: true, pose: 'none' })));
  assert.match(sent, /borrowing positions and sizes only/);
  assert.match(sent, /props, signs, labels, numbers and icons are not part of the layout/);
  assert.doesNotMatch(sent, /placeholders/);
});
test('an unmarked edit finds its area first and keeps what it does not need', () => {
  const { refinePrompt, autoArea } = load('src/lib/thumbnail/prompt.ts');
  const prompt = refinePrompt('Remove the hand in the corner');
  assert.match(prompt, /CHANGE AREA: \{\{Look at the attached image[\s\S]*Remove the hand in the corner[\s\S]*?\}\}/);
  assert.match(forImageTool(prompt), /every object, sign, label, icon, number and piece of lettering/);
  assert.match(forImageTool(prompt), /Removing one thing never removes another/);
  assert.doesNotMatch(refinePrompt('Remove the hand', { x: 0.5, y: 0.5, w: 0.4, h: 0.4 }), /CHANGE AREA/);
  const box = autoArea('[0.5, 0.6, 0.2, 0.2]');
  for (const [got, want] of [[box.x, 0.47], [box.y, 0.55], [box.w, 0.26], [box.h, 0.3]]) assert.ok(Math.abs(got - want) < 1e-9);
  const corner = autoArea(' [0.8, 0.8, 0.5, 0.5]\n');
  assert.ok(Math.abs(corner.x + corner.w - 1) < 1e-9 && Math.abs(corner.y + corner.h - 1) < 1e-9);
  for (const answer of ['whole', '[0, 0, 1, 1]', '[0.5, 0.5]', '[0.5, 0.5, 0.001, 0.4]', 'the corner', '[1, 2, 3, 4]']) assert.equal(autoArea(answer), null);
});
test('thumbnails, icons and edits all require a complete avatar face', () => {
  const { refinePrompt } = load('src/lib/thumbnail/prompt.ts');
  const face = /FACE: Every visible Roblox avatar has a complete printed face: two clear eyes and a mouth/;
  assert.match(forImageTool(thumbnailPrompt(parseThumbnailBrief(brief))), face);
  assert.match(forImageTool(thumbnailPrompt(parseThumbnailBrief({ ...brief, icon: true }))), face);
  assert.match(refinePrompt('Fix the face'), face);
});
test('an automatic box is refused when the change runs across its edge', () => {
  const { boxHoldsChange } = load('src/lib/thumbnail/prompt.ts');
  const W = 40, H = 20, blank = () => new Uint8ClampedArray(W * H * 4).fill(100);
  const paint = (image, x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) image[(y * W + x) * 4] = image[(y * W + x) * 4 + 1] = image[(y * W + x) * 4 + 2] = 250; return image; };
  const box = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  assert.equal(boxHoldsChange(blank(), blank(), W, H, box), true);
  assert.equal(boxHoldsChange(blank(), paint(blank(), 14, 8, 26, 12), W, H, box), true);
  assert.equal(boxHoldsChange(blank(), paint(blank(), 0, 0, 30, 20), W, H, box), false);
  const corner = { x: 0.5, y: 0.5, w: 0.5, h: 0.5 };
  assert.equal(boxHoldsChange(blank(), paint(blank(), 26, 14, 40, 20), W, H, corner), true);
});
test('an edit that moves or resizes something is not boxed', () => {
  const { refinePrompt } = load('src/lib/thumbnail/prompt.ts');
  assert.match(refinePrompt('Make the character smaller'), /whole if the change moves, resizes, turns or re-poses anything/);
});
test('avatars keep the clean in-game look in thumbnails, icons and edits', () => {
  const { refinePrompt } = load('src/lib/thumbnail/prompt.ts');
  const look = /AVATAR LOOK: Avatars stay as clean and simple as a real in-game Roblox render/;
  assert.match(forImageTool(thumbnailPrompt(parseThumbnailBrief(brief))), look);
  assert.match(forImageTool(thumbnailPrompt(parseThumbnailBrief({ ...brief, icon: true }))), look);
  assert.match(refinePrompt('Fix the avatar'), look);
  assert.doesNotMatch(forImageTool(thumbnailPrompt(parseThumbnailBrief({ ...brief, references: [image] }))), /same rendering technique as the rest of the image/);
});
test('reference download only accepts HTTPS Roblox CDN hosts', () => {
  assert.equal(isRobloxImageUrl('https://tr.rbxcdn.com/example.png'), true);
  for (const url of ['http://tr.rbxcdn.com/image', 'https://rbxcdn.com.evil.org/image', 'https://evilrbxcdn.com/image', 'https://tr.rbxcdn.com:8080/image', 'https://user:pass@tr.rbxcdn.com/image', 'http://127.0.0.1/secret']) assert.equal(isRobloxImageUrl(url), false);
});

test('CDN reference bytes are checked independently of generic content-type headers', () => {
  assert.equal(imageMime(Buffer.from([137,80,78,71,13,10,26,10])), 'image/png');
  assert.equal(imageMime(Buffer.from([255,216,255])), 'image/jpeg');
  assert.throws(() => imageMime(Buffer.from('<html>not an image</html>')));
});

test('first-person requirements override reference scenery and face defaults', () => {
  const scene = "Make me in first person mining my egg with a pickaxe. Use both hands from the inspiration; don't change them. We are outside, not in water.";
  const b = parseThumbnailBrief({ ...brief, scene, styleReference: image, references: [image], expression: 'shock', layout: true });
  const prompt = thumbnailPrompt(b);
  assert.match(prompt, /USER REQUIREMENTS — HIGHEST PRIORITY/);
  assert.ok(prompt.includes(JSON.stringify(scene)));
  assert.match(prompt, /MUST NOT:/);
  assert.match(prompt, /No visible player face/);
  assert.match(prompt, /single continuous handle securely joined to its head/);
  assert.match(prompt, /Image 2 is also the HAND APPEARANCE REFERENCE/);
  assert.match(prompt, /Copy ONLY those explicitly requested parts/);
  assert.doesNotMatch(prompt, /what the ground and background are/);
  assert.doesNotMatch(prompt, /The main character's face is shocked/);
});

test('hand reuse must be requested explicitly, not merely mentioned or negated', () => {
  const { preserveInspirationHands } = load('src/lib/thumbnail/prompt.ts');
  assert.equal(preserveInspirationHands('Use both hands from the inspiration, do not change them'), true);
  assert.equal(preserveInspirationHands('Keep the same arms from the reference'), true);
  assert.equal(preserveInspirationHands('The inspiration has hands'), false);
  assert.equal(preserveInspirationHands('Do not use the hands from the inspiration'), false);
  assert.equal(preserveInspirationHands('Use a pickaxe in my hand'), false);
});

const serverWith = () => {
  const promptModule = load('src/lib/thumbnail/prompt.ts');
  return load('src/lib/thumbnail/server.ts', name => {
    if (name === './prompt') return promptModule;
    if (name === './pose') return { poseGuide: async (pose) => 'guide:' + pose };
    if (name === './references') return { styleReferenceImage: async () => image };
    if (name === './style') return { styleNotes: async () => 'bright' };
    if (name.includes('codex-core')) return { codexStatus: async () => ({ connected: false }), codexImage: () => { throw new Error('This test must not generate images.'); } };
    return require(name);
  });
};
test('the sharp inspiration goes to the image tool as one image', async () => {
  const job = await serverWith().prepareThumbnail(parseThumbnailBrief({ ...brief, styleReference: image }));
  assert.deepEqual([...job.images], [image]);
  const hands = await serverWith().prepareThumbnail(parseThumbnailBrief({ ...brief, scene: 'Mine the egg in first person. Keep both hands from the inspiration. Outside, not in water.', styleReference: image }));
  assert.deepEqual([...hands.images], [image]);
  assert.match(hands.prompt, /Image 1 is also the HAND APPEARANCE REFERENCE/);
});
test('auto pose follows the action, and only with a character to pose', async () => {
  const { posePick } = load('src/lib/thumbnail/prompt.ts');
  const hero = parseThumbnailBrief({ ...brief, scene: 'My avatar mining a crystal with a pickaxe', references: [image] });
  assert.equal(posePick(hero), 'swing');
  assert.equal(posePick({ ...hero, scene: 'My avatar running from a lava monster' }), 'run');
  assert.equal(posePick({ ...hero, scene: 'My avatar sitting in a quiet garden' }), null);
  assert.equal(posePick({ ...hero, labels: [{ name: 'Egg', role: 'object' }] }), null);
  assert.equal(posePick({ ...hero, pose: 'none' }), null);
  assert.equal(posePick({ ...hero, scene: 'First person view mining with a pickaxe' }), null);
  assert.equal(posePick({ ...hero, icon: true }), null);
  assert.equal(posePick({ ...hero, styleReference: image, layout: true }), null);
  assert.equal(posePick({ ...hero, styleReference: image, layout: true, pose: 'jump' }), 'jump');
  const job = await serverWith().prepareThumbnail(parseThumbnailBrief({ ...brief, scene: 'My avatar mining a crystal with a pickaxe', references: [image], styleReference: image }));
  assert.deepEqual([...job.images], [image, image, 'guide:swing']);
  assert.match(job.prompt, /Image 3: POSE GUIDE, not a character/);
  assert.match(job.prompt, /Use the camera angle, framing and character size of the pose guide/);
  assert.throws(() => parseThumbnailBrief({ ...brief, pose: 'dance' }));
});
test('every pose draws a mannequin the guide can use', () => {
  const { poseSvg } = load('src/lib/thumbnail/pose.ts');
  const { POSE_NAMES } = load('src/lib/thumbnail/prompt.ts');
  for (const name of POSE_NAMES) {
    const svg = poseSvg(name);
    assert.match(svg, /<polygon /);
    assert.doesNotMatch(svg, /NaN|undefined/);
  }
});

test('edits can change the environment and viewpoint without contradictory keep rules', () => {
  const { refinePrompt } = load('src/lib/thumbnail/prompt.ts');
  const prompt = refinePrompt('Move outside, not in water. Show first person with a complete pickaxe, keep both hands unchanged.');
  assert.match(prompt, /replace the old environment/);
  assert.match(prompt, /change the camera/);
  assert.match(prompt, /No external portrait/);
  assert.match(prompt, /do not redesign preserved hands/);
  assert.doesNotMatch(prompt, /KEEP: the composition, camera angle/);
  const region = refinePrompt('Repair the pickaxe', {x:0.5,y:0.1,w:0.4,h:0.8});
  assert.match(region, /Everything outside that area must stay exactly as it is/);
});
