import { gameById, gameByPlace, referenceCatalog, searchGames } from '@/lib/thumbnail/references';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// No parameters: the curated list. `?q=` searches all of Roblox. `?id=` resolves one saved pick, `?place=` a pasted game link.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get('q');
  const id = params.get('id');
  try {
    if (q !== null) return Response.json({ games: await searchGames(q) }, { headers: { 'cache-control': 'public, max-age=300' } });
    const place = params.get('place');
    if (id !== null || place !== null) {
      const game = id !== null ? await gameById(Number(id)) : await gameByPlace(Number(place));
      return game ? Response.json({ game }, { headers: { 'cache-control': 'public, max-age=300' } }) : Response.json({ error: 'That game could not be found.' }, { status: 404 });
    }
    return Response.json(await referenceCatalog(), { headers: { 'cache-control': 'public, max-age=300' } });
  } catch (e) {
    return Response.json({ error: q !== null ? (e instanceof Error ? e.message : 'Roblox search failed.') : 'Could not reach Roblox. You can still upload your own style reference.', games: [] }, { status: 502 });
  }
}
