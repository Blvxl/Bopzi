const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync('src/lib/chatgpt/server.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
vm.runInNewContext(code, { exports: exportsObject, require, process, URL, Buffer, fetch, Response, Request, AbortSignal, setTimeout, clearTimeout, console });
const { isSameOriginCall } = exportsObject;
const request = (origin, header = '1') => new Request('http://127.0.0.1:3000/api/chatgpt', { method: 'POST', headers: { ...(origin ? { origin } : {}), 'x-bopzi-local': header } });

test('connection requests require the exact origin and local header', () => {
  assert.equal(isSameOriginCall(request('http://127.0.0.1:3000')), true);
  assert.equal(isSameOriginCall(request('http://127.0.0.1:3001')), false);
  assert.equal(isSameOriginCall(request('http://localhost:3000')), false);
  assert.equal(isSameOriginCall(request('https://example.com')), false);
  assert.equal(isSameOriginCall(request(null)), false);
  assert.equal(isSameOriginCall(request('http://127.0.0.1:3000', '0')), false);
  const rewritten = new Request('http://localhost:3000/api/chatgpt', { method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'x-bopzi-local': '1' } });
  assert.equal(isSameOriginCall(rewritten), true);
});
