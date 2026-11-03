// Reads Roblox's public endpoints. No key is needed. Roblox rate-limits shared hosts, so every call retries with a pause.

export const SORTS = ['top-playing-now', 'top-trending', 'up-and-coming', 'top-revisited'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A request that has not answered by now is given up on; without this one stalled connection can hold a whole run forever. */
const REQUEST_TIMEOUT_MS = 25_000;

/**
 * The pause between calls. Roblox lets only about 17 detail lookups through in a burst and then refuses for a while,
 * so the pace slows down after every refusal and creeps back up while calls succeed.
 */
let gap = 500;
const pace = () => sleep(gap);

/** `deadline` (a timestamp) stops the retrying: a run that must finish on time gives up instead of waiting out a long refusal. */
async function getJson(url, { tries = 7, deadline = 0 } = {}) {
  let last = '';
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'bopzi-collector/1.0 (+https://bopzi.dev)' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch((e) => ({ ok: false, status: 0, statusText: String(e.message ?? e) }));
    if (res.ok) { gap = Math.max(500, gap * 0.97); return res.json(); }
    last = `${res.status} ${res.statusText}`;
    if (res.status !== 429 && res.status < 500 && res.status !== 0) break;
    if (res.status === 429) gap = Math.min(gap * 1.5, 5000);
    // Too many requests: the limit refills slowly, so a short pause is not enough. Wait as long as it says, or back off hard.
    const wait = Math.min(Number(res.headers?.get?.('retry-after')) * 1000 || (res.status === 429 ? 8000 * 2 ** i : 1500 * 2 ** i), 90_000);
    if (deadline && Date.now() + wait > deadline) throw new Error(`out of time (${last})`);
    await sleep(wait);
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

/**
 * Details for many games: players, visits, favorites, genre, creator and last update. Fifty is the most Roblox allows per call.
 * With a deadline, the games not reached in time are simply missing from the result; the caller decides what to do about them.
 */
export async function details(ids, deadline = 0) {
  const out = new Map();
  for (const part of chunks(ids, 50)) {
    if (deadline && Date.now() > deadline) break;
    try {
      const body = await getJson(`https://games.roblox.com/v1/games?universeIds=${part.join(',')}`, { deadline });
      for (const g of body.data ?? []) out.set(g.id, g);
    } catch (e) {
      if (!deadline) throw e;
      break;
    }
    await pace();
  }
  return out;
}

/** Likes and dislikes for many games. */
export async function votes(ids, deadline = 0) {
  const out = new Map();
  for (const part of chunks(ids, 100)) {
    if (deadline && Date.now() > deadline) break;
    try {
      const body = await getJson(`https://games.roblox.com/v1/games/votes?universeIds=${part.join(',')}`, { deadline });
      for (const v of body.data ?? []) out.set(v.id, v);
    } catch (e) {
      if (!deadline) throw e;
      break;
    }
    await pace();
  }
  return out;
}

/** Games found by a search, a few pages deep. Search is how the collector finds games that are on no list. */
export async function search(query, sessionId, pages = 5) {
  const out = [];
  let token = '';
  for (let p = 0; p < pages; p++) {
    const q = new URLSearchParams({ searchQuery: query, sessionId, pageType: 'all' });
    if (token) q.set('pageToken', token);
    const body = await getJson(`https://apis.roblox.com/search-api/omni-search?${q}`);
    for (const group of body.searchResults ?? []) for (const c of group.contents ?? []) if (c.universeId) out.push({
      universeId: c.universeId, name: c.name ?? '', playing: c.playerCount ?? 0, rootPlaceId: c.rootPlaceId ?? null,
      creatorId: c.creatorId || null, creatorName: c.creatorName || null, upVotes: c.totalUpVotes ?? null, downVotes: c.totalDownVotes ?? null,
    });
    token = body.nextPageToken;
    if (!token) break;
    await sleep(220);
  }
  return out;
}

/**
 * Words that turn up different games. A search only shows its few hundred most popular results, so many different
 * words are needed to reach the long tail of small games. Words with a dash are two-word searches.
 */
export const WORDS = `simulator tycoon obby horror rpg anime fighting survival pet brainrot steal tower-defense roleplay racing shooter
battlegrounds clicker farm fishing dance hide-and-seek escape car zombie build story sword school military cooking soccer basketball
dress-up ninja dragon mining idle game new fun adventure party sports driving city war magic space cat dog legends hero blox universe
world land island kingdom empire army police prison jail heist bank robbery pizza burger restaurant cafe hotel mall shop store market
bakery candy ice-cream cake fruit garden flower tree forest jungle ocean sea pirate ship boat plane airport train truck bus bike skate
snow winter summer halloween christmas easter birthday wedding baby family zoo dino shark monster ghost vampire werewolf alien robot mech
tank gun sniper knife arena duel boxing wrestling karate samurai knight castle medieval viking egypt mummy pyramid desert cave dungeon
boss raid quest level grind gym muscle strength speed run parkour climb tower jump flip trick skibidi toilet rizz sigma meme noob pro
trader trade economy rich money cash gold diamond gem crystal egg hatch unicorn rainbow slime jelly ball bowling golf tennis volleyball
football hockey baseball cricket rugby drift speedway kart rally taxi delivery job work office bus-driver teacher student class exam
lunch bed sleep night day sun moon star galaxy planet rocket astronaut lab science potion wizard witch fairy elf orc goblin troll giant
titan god angel demon heaven maze puzzle riddle mystery detective murder mafia imposter spy agent secret hidden lost found rescue save
flood fire earthquake tornado storm volcano meteor apocalypse wasteland bunker base fort team squad clan guild server rp life hangout
chat social avatar outfit fashion model runway makeup hair nails salon spa pool beach lake river bridge raft camp camping hiking mountain`
  .split(/\s+/).map((w) => w.replace(/-/g, ' '));

/** Name, description, owner, creation date and verified badge for many groups (up to 100 a call). */
export async function groups(ids, deadline = 0) {
  const out = new Map();
  for (const part of chunks(ids, 100)) {
    if (deadline && Date.now() > deadline) break;
    try {
      const body = await getJson(`https://groups.roblox.com/v2/groups?groupIds=${part.join(',')}`, { deadline });
      for (const g of body.data ?? []) out.set(g.id, g);
    } catch (e) {
      if (!deadline) throw e;
      break;
    }
    await pace();
  }
  return out;
}
