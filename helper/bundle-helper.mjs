import { readFile } from 'node:fs/promises';
import path from 'node:path';

const noExports = (text) => text.replace(/^export /gm, '');
/** Imports of the helper's own files go; the single file already contains them. */
const noLocalImports = (text) => text.replace(/^import .* from '\.\/[^']+';\r?\n?/gm, '');
/** The models file only borrows names (readFile, os, path) that the core file already imports. */
const noImports = (text) => text.replace(/^import .*;\r?\n?/gm, '');

/** The helper as one downloadable file, already set to answer the site named by `origin`. */
export async function bundleHelper(dir, origin) {
  const [core, models, roblox, main] = await Promise.all(['codex-core.mjs', 'codex-models.mjs', 'roblox.mjs', 'bopzi-helper.mjs'].map((name) => readFile(path.join(dir, name), 'utf8')));
  return [
    main.slice(0, main.indexOf('import http')).trimEnd(),
    "import http from 'node:http';",
    noImports(noExports(models)),
    noImports(noExports(roblox)),
    noLocalImports(noExports(core)),
    main
      .slice(main.indexOf('const PORT'))
      .replace("new Set(['http://localhost:3000'])", `new Set([${JSON.stringify(origin)}])`),
    '',
  ].join('\n\n');
}
