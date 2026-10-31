import { existsSync } from 'node:fs';
import path from 'node:path';
import { DEMOS, type Demo } from './demos';

// Server only. Looks in /public/demos so pages can show a demo only when its artwork is really there.
const ROOT = path.join(process.cwd(), 'public', 'demos');

function find(dir: string, base: string, exts: string[]) {
  for (const ext of exts) if (existsSync(path.join(ROOT, dir, `${base}.${ext}`))) return `/demos/${dir}/${base}.${ext}`;
  return null;
}

export function getDemos(): Demo[] {
  return DEMOS.map((spec) => {
    const background = find(spec.id, 'background', ['webp', 'jpg', 'jpeg', 'png']);
    const character = find(spec.id, 'character', ['png', 'webp']);
    return { ...spec, files: background && character ? { background, character } : null };
  });
}

/** An optional real screenshot of the studio, with a demo open, saved as public/demos/studio.png. */
export function getStudioShot() {
  return find('.', 'studio', ['webp', 'png', 'jpg']);
}
