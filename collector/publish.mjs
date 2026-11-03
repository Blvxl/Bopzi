// Publishes what the pages show as small JSON files, so the public website (which cannot reach this computer's database) can read them.
//   node collector/publish.mjs            the overview (chart, feed, games) and, every few runs, every list
//   node collector/publish.mjs lists      the lists only
// Where the files go:
//   - with SUPABASE_SERVICE_ROLE_KEY set: a public Supabase Storage bucket called "site" (created if missing). The website reads
//     it through NEXT_PUBLIC_DATA_URL, which is  <project url>/storage/v1/object/public/site
//   - without it: public/data/, which the local site (and any static host) can serve as /data/...
// It asks the local site (npm run dev, http://127.0.0.1:3000) for the data, so that is where the numbers are worked out.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SOURCE = process.env.BOPZI_SOURCE ?? 'http://127.0.0.1:3000';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'site';
// Supabase's newer secret keys (sb_secret_…) are not tokens, so they go in the apikey header only; the older service_role key is a token and also goes in Authorization.
const auth = key?.startsWith('sb_') ? { apikey: key } : { authorization: `Bearer ${key}`, apikey: key };
const only = process.argv[2];

const LISTS = ['words', 'updates', 'hands', 'new-highs', 'new-games', 'genres', 'types', 'themes', 'features', 'brands', 'extras', 'languages', 'looks', 'searches', 'events', 'calendar', 'earners'];

const get = async (p) => {
  const res = await fetch(`${SOURCE}${p}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${p}: ${res.status}`);
  return res.text();
};

let ready = false;
async function put(name, body) {
  if (!(url && key)) {
    const file = path.join('public', 'data', name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
    return;
  }
  if (!ready) {
    // Make sure the bucket exists and is public; "already exists" is fine.
    await fetch(`${url}/storage/v1/bucket`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }), signal: AbortSignal.timeout(20_000) }).catch(() => undefined);
    ready = true;
  }
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${name}`, {
    method: 'POST',
    // Short cache, so a page that asks every few seconds sees new data soon.
    headers: { ...auth, 'content-type': 'application/json', 'x-upsert': 'true', 'cache-control': 'max-age=10' },
    body, signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`upload ${name}: ${res.status} ${(await res.text()).slice(0, 160)}`);
}

let sent = 0;
if (only !== 'lists') {
  // 200 feed events: the Pulse page shows them all and the home page shows the first 40.
  await put('overview.json', await get('/api/terminal?pulse=200'));
  sent++;
}
if (only === 'lists' || only === 'all') {
  for (const slug of LISTS) {
    try { await put(`lists/${slug}.json`, await get(`/api/lists/${slug}`)); sent++; } catch (e) { console.error(`  ${slug}: ${e.message}`); }
  }
}
console.log(`published ${sent} file${sent === 1 ? '' : 's'} to ${url && key ? 'Supabase Storage' : 'public/data'}`);
