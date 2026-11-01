import path from 'node:path';
import { bundleHelper } from '../../../../helper/bundle-helper.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Hands out the helper as one file, already set to answer the site it was downloaded from.
// The website serves the same file ready-made as /bopzi-helper.mjs, because its host cannot read files at run time.
export async function GET(req: Request) {
  try {
    const file = await bundleHelper(path.join(process.cwd(), 'helper'), new URL(req.url).origin);
    return new Response(file, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'content-disposition': 'attachment; filename="bopzi-helper.mjs"', 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ error: 'The helper is not available from this site right now.' }, { status: 500 });
  }
}
