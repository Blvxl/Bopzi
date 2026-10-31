import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Hands out the helper as one file, already set to answer the site it was downloaded from.
export async function GET(req: Request) {
  try {
    const dir = path.join(process.cwd(), 'helper');
    const [core, main] = await Promise.all([readFile(path.join(dir, 'codex-core.mjs'), 'utf8'), readFile(path.join(dir, 'bopzi-helper.mjs'), 'utf8')]);
    const origin = new URL(req.url).origin;
    const file = [
      main.slice(0, main.indexOf('import http')).trimEnd(),
      "import http from 'node:http';",
      // The two files become one: the helper's import of the core goes, and the core's exports become plain declarations.
      core.replace(/^export /gm, ''),
      main
        .slice(main.indexOf('const PORT'))
        .replace("new Set(['http://localhost:3000'])", `new Set([${JSON.stringify(origin)}])`),
      '',
    ].join('\n\n');
    return new Response(file, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'content-disposition': 'attachment; filename="bopzi-helper.mjs"', 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ error: 'The helper is not available from this site right now.' }, { status: 500 });
  }
}
