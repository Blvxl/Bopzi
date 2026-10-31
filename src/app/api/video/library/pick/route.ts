import { pickFiles } from '@/video/library';
import { failed, refused } from '../guard';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let open = false;
/** Opens the system file picker on this computer and answers with the chosen paths (none if cancelled). */
export async function POST(req: Request) {
  const no = refused(req, true); if (no) return no;
  if (open) return Response.json({ error: 'The file picker is already open. It may be behind the browser window.' }, { status: 409 });
  open = true;
  try {
    const paths = await pickFiles();
    return paths ? Response.json({ paths }) : Response.json({ error: 'The file picker only opens on Windows. Paste the file path instead.', unsupported: true }, { status: 501 });
  } catch (e) { return failed(e, 'The file picker could not open.', 500); }
  finally { open = false; }
}
