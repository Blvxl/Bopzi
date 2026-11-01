import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** The helper as one downloadable file, already set to answer the site named by `origin`. */
export async function bundleHelper(dir, origin) {
  const [core, main] = await Promise.all([readFile(path.join(dir, 'codex-core.mjs'), 'utf8'), readFile(path.join(dir, 'bopzi-helper.mjs'), 'utf8')]);
  return [
    main.slice(0, main.indexOf('import http')).trimEnd(),
    "import http from 'node:http';",
    // The two files become one: the helper's import of the core goes, and the core's exports become plain declarations.
    core.replace(/^export /gm, ''),
    main
      .slice(main.indexOf('const PORT'))
      .replace("new Set(['http://localhost:3000'])", `new Set([${JSON.stringify(origin)}])`),
    '',
  ].join('\n\n');
}
