// Reads Roblox's public endpoints. No key is needed. Roblox rate-limits shared hosts, so every call retries with a pause.

export const SORTS = ['top-playing-now', 'top-trending', 'up-and-coming', 'top-revisited'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 5) {
  let last = '';
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'bopzi-collector/1.0 (+https://bopzi.dev)' } }).catch((e) => ({ ok: false, status: 0, statusText: String(e.message ?? e) }));
    if (res.ok) return res.json();
    last = `${res.status} ${res.statusText}`;
    if (res.status !== 429 && res.status < 500 && res.status !== 0) break;
    const wait = Number(res.headers?.get?.('retry-after')) * 1000 || 1500 * 2 ** i;
    await sleep(Math.min(wait, 30_000));
  }
  throw new Error(`Roblox request failed (${last}): ${url.split('?')[0]}`);
}

/** The games on one of Roblox's lists, best first. */
export async function chart(sortId, sessionId) {
  const q = new URLSearchParams({ sessionId, sortId, device: 'computer', country: 'all' });
  const body = await getJson(`https://apis.roblox.com/explore-api/v1/get-sort-content?${q}`);
  return (body.games ?? []).map((g, i) => ({ universeId: g.universeId, rank: i + 1, name: g.name, playing: g.playerCount }));
}

const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/** Details for many games: players, visits, favorites, genre, creator and last update. */
export async function details(ids) {
  const out = new Map();
  for (const part of chunks(ids, 50)) {
    const body = await getJson(`https://games.roblox.com/v1/games?universeIds=${part.join(',')}`);
    for (const g of body.data ?? []) out.set(g.id, g);
    await sleep(250);
  }
  return out;
}

/** Likes and dislikes for many games. */
export async function votes(ids) {
  const out = new Map();
  for (const part of chunks(ids, 100)) {
    const body = await getJson(`https://games.roblox.com/v1/games/votes?universeIds=${part.join(',')}`);
    for (const v of body.data ?? []) out.set(v.id, v);
    await sleep(250);
  }
  return out;
}
