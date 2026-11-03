// The real database: Supabase Postgres, written with the service-role key (a server secret, never a NEXT_PUBLIC_ setting).
import { createClient } from '@supabase/supabase-js';

export function openSupabase(url, serviceKey) {
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const put = async (table, rows, onConflict) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  };
  // Supabase returns at most 1000 rows a request, so long lists are read a page at a time.
  const pages = async (build, limit = Infinity) => {
    const out = [];
    while (out.length < limit) {
      const { data, error } = await build().range(out.length, Math.min(out.length + 999, limit - 1));
      if (error) throw new Error(`games: ${error.message}`);
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  };
  return {
    kind: 'supabase',
    /** Games seen recently, with the player count last seen. A game that has been empty for a day is left out. */
    async trackedGames(sinceIso, emptyAfterIso, limit) {
      const rows = await pages(() => db.from('games').select('universe_id, playing').gte('last_seen', sinceIso).or(`playing.is.null,playing.gt.0,last_seen.gte.${emptyAfterIso}`).order('last_seen', { ascending: false }), limit);
      return rows.map((r) => ({ id: r.universe_id, playing: r.playing }));
    },
    async searchedSince(iso) { return (await pages(() => db.from('searches').select('query').gte('ts', iso).order('query'))).map((r) => r.query); },
    async markSearched(rows) { await put('searches', rows, 'query'); },
    // Supabase has no random order, so a random stretch of the games table is read instead.
    async sampleTerms(n) {
      const { count } = await db.from('games').select('universe_id', { count: 'exact', head: true });
      const from = Math.floor(Math.random() * Math.max(1, (count ?? 0) - n));
      const { data, error } = await db.from('games').select('name, creator_name').order('universe_id').range(from, from + n - 1);
      if (error) throw new Error('games: ' + error.message);
      return { creators: [...new Set(data.map((r) => r.creator_name).filter(Boolean))], names: data.map((r) => r.name) };
    },
    async knownIds() { return (await pages(() => db.from('games').select('universe_id').order('universe_id'))).map((r) => r.universe_id); },
    async lastSnapshotTs() {
      const { data, error } = await db.from('snapshots').select('ts').order('ts', { ascending: false }).limit(1);
      if (error) throw new Error(`snapshots: ${error.message}`);
      return data[0]?.ts ?? '';
    },
    async save({ games, snapshots, charts, totals }) {
      // first_seen is never sent, so the column default sets it on insert and an update leaves it alone.
      // A game with nobody in it is sent without last_seen, so it keeps its old one and ages out of the tracked set.
      await put('games', games.filter((g) => g.playing > 0), 'universe_id');
      await put('games', games.filter((g) => !(g.playing > 0)).map(({ last_seen, ...g }) => g), 'universe_id');
      await put('snapshots', snapshots, 'universe_id,ts');
      await put('chart_entries', charts, 'ts,sort_id,rank');
      await put('totals', totals, 'ts');
    },
  };
}
