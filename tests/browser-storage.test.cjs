const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { indexedDB, IDBKeyRange } = require('fake-indexeddb');

// db.ts as the website runs it: accounts on, so everything is kept in the browser's own database.
const code = ts.transpileModule(fs.readFileSync('src/lib/db.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = {};
const stand = { './supabase/config': { HOSTED_ACCOUNTS: true }, './util': { uid: (p) => `${p}_${Math.random().toString(36).slice(2, 9)}` } };
const fetched = [];
vm.runInNewContext(code, { exports: loaded, require: (id) => stand[id] ?? require(id), indexedDB, IDBKeyRange, Blob, FileReader: class {}, fetch: (...a) => { fetched.push(a); throw new Error('the website must not call the disk library'); }, console, Promise, Uint8Array, atob, localStorage: undefined });
const db = loaded;

const project = (id, owner, extra = {}) => ({ id, name: `Thumb ${id}`, owner, createdAt: 1, updatedAt: 1, doc: { layers: [{ type: 'text' }] }, ...extra });

test('a project is saved and read back in the browser, never through the disk library', async () => {
  db.setOwner('user-a');
  await db.putProject(project('p1', 'user-a', { updatedAt: 5 }));
  await db.putProject(project('p2', 'user-a', { updatedAt: 9 }));
  assert.equal((await db.getProject('p1')).name, 'Thumb p1');
  assert.deepEqual((await db.listProjects()).map((p) => p.id), ['p2', 'p1'], 'newest first');
  assert.equal(fetched.length, 0);
});

test('someone else\'s projects are not shown', async () => {
  await db.putProject(project('p3', 'user-b'));
  db.setOwner('user-a');
  assert.equal(await db.getProject('p3'), undefined);
  assert.ok(!(await db.listProjects()).some((p) => p.id === 'p3'));
});

test('images stay real files and belong to their project', async () => {
  db.setOwner('user-a');
  await db.putAsset({ id: 'a1', projectId: 'p1', blob: new Blob(['hi'], { type: 'image/png' }) });
  await db.putAsset({ id: 'a2', projectId: 'p2', blob: new Blob(['yo'], { type: 'image/png' }) });
  const mine = await db.listProjectAssets('p1');
  assert.deepEqual(mine.map((a) => a.id), ['a1']);
  assert.equal(mine[0].blob.size, 2);
});

test('the game icon is saved and removed', async () => {
  await db.putIcon('p1', new Blob(['icon'], { type: 'image/png' }));
  assert.equal((await db.getIcon('p1')).size, 4);
  await db.deleteIcon('p1');
  assert.equal(await db.getIcon('p1'), undefined);
});

test('deleting a project removes its images too', async () => {
  await db.deleteProject('p1');
  assert.equal(await db.getProject('p1'), undefined);
  assert.deepEqual(await db.listProjectAssets('p1'), []);
});

test('duplicating makes an independent copy with its own images', async () => {
  const copy = await db.duplicateProject('p2');
  assert.match(copy.name, /copy$/);
  const copied = await db.listProjectAssets(copy.id);
  assert.equal(copied.length, 1);
  assert.notEqual(copied[0].id, 'a2');
});
