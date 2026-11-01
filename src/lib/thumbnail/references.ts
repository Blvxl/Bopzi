import { fetchImage } from './fetch-image';
import { robloxFetch } from './roblox-fetch';

export type ReferenceGame = {
  id: number;
  name: string;
  genre: string;
  imageUrl: string;
  sourceUrl: string;
  /** Live figures and the square icon, when Roblox returned them. Used to show a game the way Roblox does. */
  playing?: number;
  rating?: number;
  iconUrl?: string;
};

// Curated, established experiences, not a CTR ranking. Images refresh from Roblox.
const SEEDS = [
  [703124385, 'Obby'], [3310460039, 'Obby'], [9584852943, 'Obby'],
  [3317771874, 'Simulator'], [601130232, 'Simulator'], [7436755782, 'Simulator'],
  [5750914919, 'Simulator'], [6701277882, 'Simulator'],
  [2440500124, 'Horror'], [7326934954, 'Horror'], [3647333358, 'Horror'],
  [6331902150, 'Horror'], [1686885941, 'Roleplay'], [383310974, 'Roleplay'],
  [5203828273, 'Roleplay'], [3240075297, 'Roleplay'],
  [6035872082, 'Action'], [994732206, 'Action'], [3808081382, 'Action'],
  [2619619496, 'Action'], [4777817887, 'Action'], [210851291, 'Building'],
] as const;

type Catalog = { games: ReferenceGame[]; updatedAt: string };
let cached: Catalog | null = null;
let pending: Promise<Catalog> | null = null;
const MAX_AGE = 60 * 60 * 1000;
export function isRobloxImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)rbxcdn\.com$/.test(url.hostname) && !url.port && !url.username && !url.password;
  } catch { return false; }
}

export function imageMime(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  throw new Error('The reference was not an image.');
}

export async function referenceCatalog(): Promise<Catalog> {
  if (cached && Date.now() - Date.parse(cached.updatedAt) < MAX_AGE) return cached;
  if (pending) return pending;
  pending = (async () => {
    const ids = SEEDS.map(([id]) => id).join(',');
    const responses = await Promise.all([
      robloxFetch(`https://games.roblox.com/v1/games?universeIds=${ids}`, { signal: AbortSignal.timeout(15000), cache: 'no-store' }),
      robloxFetch(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${ids}&countPerUniverse=1&defaults=false&size=768x432&format=Png&isCircular=false`, { signal: AbortSignal.timeout(15000), cache: 'no-store' }),
    ]);
    if (responses.some(r => !r.ok)) throw new Error('Roblox references are temporarily unavailable.');
    const [details, thumbnails] = await Promise.all(responses.map(r => r.json()));
    // Nice to have: the library still works without them.
    const extra = (url: string) => robloxFetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    const [votes, icons] = await Promise.all([
      extra(`https://games.roblox.com/v1/games/votes?universeIds=${ids}`) as Promise<{ data?: { id: number; upVotes: number; downVotes: number }[] } | null>,
      extra(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids}&returnPolicy=PlaceHolder&size=256x256&format=Png&isCircular=false`) as Promise<{ data?: { targetId: number; state: string; imageUrl: string }[] } | null>,
    ]);
    const games: ReferenceGame[] = [];
    for (const [id, genre] of SEEDS) {
      const game = details.data?.find((g: { id: number }) => g.id === id);
      const image = thumbnails.data?.find((g: { universeId: number }) => g.universeId === id)?.thumbnails?.find((t: { state: string; imageUrl: string }) => t.state === 'Completed' && isRobloxImageUrl(t.imageUrl));
      if (!game?.rootPlaceId || !image) continue;
      const vote = votes?.data?.find(v => v.id === id);
      const icon = icons?.data?.find(i => i.targetId === id && i.state === 'Completed' && isRobloxImageUrl(i.imageUrl));
      games.push({
        id, genre, name: game.name, imageUrl: image.imageUrl, sourceUrl: `https://www.roblox.com/games/${game.rootPlaceId}`,
        playing: typeof game.playing === 'number' ? game.playing : undefined,
        rating: vote && vote.upVotes + vote.downVotes > 0 ? Math.floor((vote.upVotes / (vote.upVotes + vote.downVotes)) * 100) : undefined,
        iconUrl: icon?.imageUrl,
      });
    }
    if (!games.length) throw new Error('Roblox returned no available reference thumbnails.');
    cached = { games, updatedAt: new Date().toISOString() };
    return cached;
  })();
  try { return await pending; }
  catch (error) { if (cached) return cached; throw error; }
  finally { pending = null; }
}

export async function styleReferenceImage(id: number): Promise<string> {
  const game = await gameById(id);
  if (!game) throw new Error('That reference is unavailable. Choose another one.');
  const response = await fetchImage(game.imageUrl, AbortSignal.timeout(15000));
  if (!response.ok) throw new Error('Could not load the style reference. Try another one.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 8_000_000) throw new Error('The style reference is too large.');
  // Roblox CDN can serve image bytes with an application/octet-stream header.
  const mime = imageMime(bytes);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

// ---------- any public game, not only the curated list ----------

const found = new Map<number, ReferenceGame>();
const searches = new Map<string, { at: number; games: ReferenceGame[] }>();

async function thumbnailsFor(ids: number[]) {
  const out = new Map<number, string>();
  if (!ids.length) return out;
  const res = await robloxFetch(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${ids.join(',')}&countPerUniverse=1&defaults=false&size=768x432&format=Png&isCircular=false`, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (!res.ok) return out;
  const body = (await res.json()) as { data?: { universeId: number; thumbnails?: { state: string; imageUrl: string }[] }[] };
  for (const g of body.data ?? []) {
    const image = g.thumbnails?.find((t) => t.state === 'Completed' && isRobloxImageUrl(t.imageUrl));
    if (image) out.set(g.universeId, image.imageUrl);
  }
  return out;
}

/** Searches Roblox for games by name. Results without a usable thumbnail are left out. */
export async function searchGames(query: string): Promise<ReferenceGame[]> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (q.length < 2) return [];
  const key = q.toLowerCase();
  const hit = searches.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.games;

  const res = await robloxFetch(`https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(q)}&sessionId=${crypto.randomUUID()}&pageType=all`, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (!res.ok) throw new Error('Roblox search is temporarily unavailable.');
  type Hit = { universeId?: number; name?: string; rootPlaceId?: number; isSponsored?: boolean; minimumAge?: number };
  const body = (await res.json()) as { searchResults?: { contentGroupType?: string; contents?: Hit[] }[] };
  const hits = (body.searchResults ?? [])
    .filter((group) => group.contentGroupType === 'Game')
    .flatMap((group) => group.contents ?? [])
    // No ads, and nothing age-restricted in a tool aimed at all ages.
    .filter((g): g is Required<Pick<Hit, 'universeId' | 'name' | 'rootPlaceId'>> & Hit => !!g.universeId && !!g.name && !!g.rootPlaceId && !g.isSponsored && (g.minimumAge ?? 0) < 17)
    .filter((g, i, all) => all.findIndex((x) => x.universeId === g.universeId) === i)
    .slice(0, 16);
  const images = await thumbnailsFor(hits.map((g) => g.universeId));
  const games = hits.flatMap((g) => {
    const imageUrl = images.get(g.universeId);
    return imageUrl ? [{ id: g.universeId, genre: 'Search', name: g.name, imageUrl, sourceUrl: `https://www.roblox.com/games/${g.rootPlaceId}` }] : [];
  });
  for (const g of games) found.set(g.id, g);
  if (searches.size > 200) searches.clear();
  searches.set(key, { at: Date.now(), games });
  return games;
}

/** Resolves one game: curated, recently searched, or looked up fresh from Roblox. */
export async function gameById(id: number): Promise<ReferenceGame | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const curated = (await referenceCatalog().catch(() => null))?.games.find((g) => g.id === id);
  if (curated) return curated;
  const known = found.get(id);
  if (known) return known;
  const [details, images] = await Promise.all([
    robloxFetch(`https://games.roblox.com/v1/games?universeIds=${id}`, { signal: AbortSignal.timeout(15000), cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ data?: { id: number; name: string; rootPlaceId: number }[] } | null>,
    thumbnailsFor([id]),
  ]);
  const game = details?.data?.[0];
  const imageUrl = images.get(id);
  if (!game?.rootPlaceId || !imageUrl) return null;
  const resolved = { id, genre: 'Search', name: game.name, imageUrl, sourceUrl: `https://www.roblox.com/games/${game.rootPlaceId}` };
  found.set(id, resolved);
  return resolved;
}

/** Resolves a game from the place id in its roblox.com/games/<id> link. */
export async function gameByPlace(placeId: number): Promise<ReferenceGame | null> {
  if (!Number.isSafeInteger(placeId) || placeId <= 0) return null;
  const res = await robloxFetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`, { signal: AbortSignal.timeout(15000), cache: 'no-store' }).catch(() => null);
  const universeId = res?.ok ? ((await res.json()) as { universeId?: number | null }).universeId : null;
  return universeId ? gameById(universeId) : null;
}

export type DealGame = { name: string; url: string; playing: number; visits: number; imageUrl?: string; iconUrl?: string };
const dealGames = new Map<string, { at: number; game: DealGame }>();
const DEAL_GAME_AGE = 5 * 60 * 1000;

/** The live card for a deal's game, from its roblox.com/games/<id> link. Text that isn't a link has no card. */
export async function dealGame(text: string): Promise<DealGame | null> {
  const place = /roblox\.com\/(?:[a-z-]+\/)?games\/(\d+)/i.exec(text)?.[1] ?? /^\d+$/.exec(text.trim())?.[0];
  if (!place) return null;
  const known = dealGames.get(place);
  if (known && Date.now() - known.at < DEAL_GAME_AGE) return known.game;
  const read = <T,>(url: string) => robloxFetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' }).then((r) => (r.ok ? r.json() as Promise<T> : null)).catch(() => null);
  const universe = await read<{ universeId?: number | null }>(`https://apis.roblox.com/universes/v1/places/${place}/universe`);
  const id = universe?.universeId;
  if (!id) return known?.game ?? null;
  const [details, images, icons] = await Promise.all([
    read<{ data?: { name: string; rootPlaceId: number; playing?: number; visits?: number }[] }>(`https://games.roblox.com/v1/games?universeIds=${id}`),
    thumbnailsFor([id]).catch(() => new Map<number, string>()),
    read<{ data?: { imageUrl?: string }[] }>(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${id}&returnPolicy=PlaceHolder&size=256x256&format=Webp&isCircular=false`),
  ]);
  const info = details?.data?.[0];
  if (!info) return known?.game ?? null;
  const imageUrl = images.get(id), iconUrl = icons?.data?.[0]?.imageUrl;
  const game: DealGame = {
    name: info.name, url: `https://www.roblox.com/games/${info.rootPlaceId}`, playing: info.playing ?? 0, visits: info.visits ?? 0,
    imageUrl: imageUrl && isRobloxImageUrl(imageUrl) ? imageUrl : undefined,
    iconUrl: iconUrl && isRobloxImageUrl(iconUrl) ? iconUrl : undefined,
  };
  dealGames.set(place, { at: Date.now(), game });
  return game;
}
export type ArrangeReference ={ name: string; sourceUrl: string; imageUrl: string; image: string };
/** Public widescreen examples; popularity is not a design-quality score. */
export async function arrangementReferences(query: string, signal: AbortSignal): Promise<ArrangeReference[]> {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !['roblox','simulator','simulation','game','games','the','and'].includes(w));
  const groups = [['drill','mining','mine','dig','digging'], ['obby','parkour','escape'], ['rng','rarity','roll'], ['pet','pets','hatch','hatching']];
  const topics = new Set(terms.flatMap(t => groups.find(g => g.includes(t)) ?? [t]));
  const ranked = (await searchGames(query)).map(game => ({ game, score: [...topics].filter(t => game.name.toLowerCase().includes(t)).length })).filter(g => !topics.size || g.score > 0).sort((a,b) => b.score - a.score);
  const games = ranked.slice(0, 5).map(g => g.game);
  if (!games.length) return [];
  const url = 'https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=' + games.map(g => g.id).join(',') + '&countPerUniverse=3&defaults=false&size=768x432&format=Png&isCircular=false';
  const res = await robloxFetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), cache: 'no-store' });
  if (!res.ok) throw new Error('Roblox thumbnails are temporarily unavailable.');
  const body = await res.json() as { data?: { universeId: number; thumbnails?: { state: string; imageUrl: string }[] }[] };
  const candidates: { game: ReferenceGame; url: string }[] = [];
  // Round-robin avoids filling the set with one game's variants.
  for (let i = 0; i < 3; i++) for (const game of games) {
    const url = body.data?.find(g => g.universeId === game.id)?.thumbnails?.filter(t => t.state === 'Completed' && isRobloxImageUrl(t.imageUrl))[i]?.imageUrl;
    if (url && !candidates.some(c => c.url === url)) candidates.push({ game, url });
  }
  // Some hosts (Cloudflare) cannot run sharp; the images are then used as they come, without the widescreen check.
  const sharp = await import('sharp').then((m) => m.default).catch(() => null);
  const { createHash } = await import('node:crypto');
  const fetched = await Promise.allSettled(candidates.slice(0, 10).map(async ({ game, url }) => {
    const response = await fetchImage(url, AbortSignal.any([signal, AbortSignal.timeout(15000)]));
    if (!response.ok) throw new Error('Unavailable image');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 8_000_000) throw new Error('Oversized image');
    const mime = imageMime(bytes);
    if (!sharp) return { name: game.name, sourceUrl: game.sourceUrl, imageUrl: url, image: `data:${mime};base64,${bytes.toString('base64')}`, hash: createHash('sha256').update(bytes).digest('hex') };
    const metadata = await sharp(bytes, { limitInputPixels: 20_000_000 }).metadata();
    const ratio = (metadata.width ?? 0) / (metadata.height ?? 1);
    if (ratio < 1.6 || ratio > 1.95) throw new Error('Not a widescreen thumbnail');
    const normalized = await sharp(bytes).resize(640, 360, { fit: 'fill' }).jpeg({ quality: 85 }).toBuffer();
    return { name: game.name, sourceUrl: game.sourceUrl, imageUrl: url, image: 'data:image/jpeg;base64,' + normalized.toString('base64'), hash: createHash('sha256').update(normalized).digest('hex') };
  }));
  signal.throwIfAborted();
  const unique = new Set<string>();
  return fetched.flatMap(r => {
    if (r.status !== 'fulfilled' || unique.has(r.value.hash)) return [];
    unique.add(r.value.hash);
    const { hash, ...reference } = r.value;
    return [reference];
  }).slice(0, 6);
}
