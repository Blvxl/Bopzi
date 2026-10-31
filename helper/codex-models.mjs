// The models the person's Codex plan offers, read from the list Codex itself keeps up to date. Never the sign-in.
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const EFFORTS = ['low', 'medium', 'high'];

/** @returns {Promise<{ id: string, name: string, description: string, efforts: string[] }[]>} */
export async function codexModels() {
  const home = process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');
  const cache = JSON.parse(await readFile(path.join(home, 'models_cache.json'), 'utf8').catch(() => '{}'));
  return (Array.isArray(cache.models) ? cache.models : [])
    .filter((m) => m && typeof m.slug === 'string' && m.visibility === 'list')
    .map((m) => ({
      id: m.slug,
      name: typeof m.display_name === 'string' ? m.display_name : m.slug,
      description: typeof m.description === 'string' ? m.description : '',
      efforts: (m.supported_reasoning_levels ?? []).map((l) => l?.effort).filter((e) => EFFORTS.includes(e)),
    }));
}
