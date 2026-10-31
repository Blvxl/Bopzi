import { addFile } from '@/video/library';
import { failed, refused } from './guard';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Adds files by their paths on this computer. Each one succeeds or fails on its own. */
export async function POST(req: Request) {
  const no = refused(req, true); if (no) return no;
  try {
    const body = await req.json();
    if (!Array.isArray(body?.paths) || !body.paths.length || body.paths.length > 100 || !body.paths.every((p: unknown) => typeof p === 'string' && p.length < 1000)) throw new Error('Choose up to 100 files.');
    const added = [], errors: string[] = [];
    for (const raw of body.paths as string[]) {
      // Explorer's "Copy as path" wraps the path in quotes.
      try { added.push(await addFile(raw.trim().replace(/^"(.*)"$/, '$1'))); } catch (e) { errors.push(e instanceof Error ? e.message : `${raw} could not be added.`); }
    }
    return Response.json({ added, errors });
  } catch (e) { return failed(e, 'The files could not be added.'); }
}
